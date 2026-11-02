"""Run and inspect plan-specific audit comparisons."""
import logging
from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import AuditEvent, PlanAudit, PlanAuditResult, SavingsOpportunity
from .permissions import CanAnalyze, CanView
from .plan_audit_common import audit_payload, get_visible_audit
from .plan_audit_engine import run_plan_audit


logger = logging.getLogger(__name__)


def _decimal_text(value):
    return None if value is None else format(Decimal(value), "f")


def result_payload(item):
    return {
        "id": item.pk, "hcpcs_code": item.hcpcs_code, "drug_description": item.drug_description,
        "site_npi": item.site_npi,
        "quarter": item.quarter, "service_setting": item.service_setting,
        "total_units": _decimal_text(item.total_units),
        "total_allowed_amount": _decimal_text(item.total_allowed_amount),
        "total_paid_amount": _decimal_text(item.total_paid_amount),
        "member_count_band": item.member_count_band,
        "plan_allowed_price_per_unit": _decimal_text(item.plan_allowed_price_per_unit),
        "plan_paid_price_per_unit": _decimal_text(item.plan_paid_price_per_unit),
        "hospital_price_per_unit": _decimal_text(item.hospital_price_per_unit),
        "asp_payment_limit": _decimal_text(item.asp_payment_limit),
        "hospital_markup_multiple": _decimal_text(item.hospital_markup_multiple),
        "allowed_markup_multiple": _decimal_text(item.allowed_markup_multiple),
        "paid_markup_multiple": _decimal_text(item.paid_markup_multiple),
        "plan_to_hospital_price_multiple": _decimal_text(item.plan_to_hospital_price_multiple),
        "network_status": item.network_status,
        "data_quality_status": item.data_quality_status,
        "data_quality_notes": item.data_quality_notes,
        "source_references": item.source_references,
    }


def _visible_totals(audit):
    results = list(audit.results.all())
    allowed = sum((row.total_allowed_amount for row in results), Decimal(0))
    paid = sum((row.total_paid_amount for row in results), Decimal(0))
    units = sum((row.total_units for row in results), Decimal(0))
    savings = sum((row.potential_allowed_savings for row in audit.savings_opportunities.all()),
                  Decimal(0))
    return {
        "drugs_analyzed": len({row.hcpcs_code for row in results}),
        "hospitals_compared": len({row.site_npi for row in results if row.hospital_price_per_unit is not None}),
        "sites_with_claims": len({row.site_npi for row in results}),
        "units_analyzed": _decimal_text(units),
        "visible_allowed_amount": _decimal_text(allowed),
        "visible_paid_amount": _decimal_text(paid),
        "potential_allowed_savings": _decimal_text(savings),
        "data_quality_warnings": sum(row.data_quality_status != "VALID" for row in results),
        "totals_scope": "visible_approved_aggregate_rows_only",
    }


@api_view(["POST"])
@permission_classes([CanAnalyze])
def run_audit(request, audit_id):
    audit = get_visible_audit(request.user, audit_id)
    try:
        with transaction.atomic():
            audit = PlanAudit.objects.select_for_update().select_related(
                "organization", "plan", "summary_import"
            ).get(pk=audit.pk)
            if audit.summary_import.import_status != "accepted":
                return Response({"error": "The selected summary import is not accepted."}, status=409)
            audit.status = "running"
            audit.summary = {}
            audit.save(update_fields=["status", "summary"])
            audit.results.all().delete()
            audit.savings_opportunities.all().delete()
            summary = run_plan_audit(audit)
            audit.summary = summary
            has_warnings = any(status != "VALID" for status in summary["quality_status_counts"])
            audit.status = "needs_review" if has_warnings else "completed"
            audit.completed_at = timezone.now()
            audit.save(update_fields=["summary", "status", "completed_at"])
            AuditEvent.objects.create(
                actor=request.user, action="plan_audit_run_completed",
                entity_type="plan_audit", entity_id=str(audit.pk),
                details={"result_rows": summary["result_rows"],
                         "savings_opportunities": summary["savings_opportunities"],
                         "status": audit.status},
            )
    except Exception:
        logger.exception("Plan audit execution failed for audit id %s.", audit.pk)
        PlanAudit.objects.filter(pk=audit.pk).update(
            status="failed", summary={"error": "Audit execution failed; no result details were stored."})
        return Response({"error": "Audit execution failed. Check reference-data availability and server logs."},
                        status=500)
    return Response(audit_payload(audit))


@api_view(["GET"])
@permission_classes([CanView])
def audit_results(request, audit_id):
    audit = get_visible_audit(request.user, audit_id)
    try:
        limit = min(max(int(request.query_params.get("limit", 100)), 1), 500)
        offset = max(int(request.query_params.get("offset", 0)), 0)
    except (TypeError, ValueError):
        return Response({"error": "limit and offset must be whole numbers."}, status=400)
    queryset = audit.results.all()
    if request.query_params.get("hcpcs_code"):
        queryset = queryset.filter(hcpcs_code=request.query_params["hcpcs_code"].upper())
    if request.query_params.get("quarter"):
        queryset = queryset.filter(quarter=request.query_params["quarter"])
    if request.query_params.get("data_quality_status"):
        queryset = queryset.filter(data_quality_status=request.query_params["data_quality_status"])
    total = queryset.count()
    rows = queryset[offset:offset + limit]
    return Response({"count": total, "limit": limit, "offset": offset,
                     "results": [result_payload(row) for row in rows]})


@api_view(["GET"])
@permission_classes([CanView])
def drug_analysis(request, audit_id):
    audit = get_visible_audit(request.user, audit_id)
    grouped = defaultdict(lambda: {
        "units": Decimal(0), "allowed": Decimal(0), "paid": Decimal(0),
        "asp": set(), "allowed_multiple": [], "paid_multiple": [],
        "qualities": defaultdict(int), "sites": set(), "quarters": set(),
    })
    for row in audit.results.all():
        item = grouped[row.hcpcs_code]
        item["units"] += row.total_units
        item["allowed"] += row.total_allowed_amount
        item["paid"] += row.total_paid_amount
        item["sites"].add(row.site_npi)
        item["quarters"].add(row.quarter)
        item["qualities"][row.data_quality_status] += 1
        if row.asp_payment_limit is not None:
            item["asp"].add(row.asp_payment_limit)
        if row.allowed_markup_multiple is not None:
            item["allowed_multiple"].append(row.allowed_markup_multiple)
        if row.paid_markup_multiple is not None:
            item["paid_multiple"].append(row.paid_markup_multiple)
    result = []
    for code, item in sorted(grouped.items()):
        allowed_unit = item["allowed"] / item["units"] if item["units"] else None
        paid_unit = item["paid"] / item["units"] if item["units"] else None
        asp = next(iter(item["asp"])) if len(item["asp"]) == 1 else None
        allowed_markup = allowed_unit / asp if asp else None
        paid_markup = paid_unit / asp if asp else None
        result.append({
            "hcpcs_code": code, "total_units": _decimal_text(item["units"]),
            "visible_allowed_amount": _decimal_text(item["allowed"]),
            "visible_paid_amount": _decimal_text(item["paid"]),
            "allowed_price_per_unit": _decimal_text(allowed_unit),
            "paid_price_per_unit": _decimal_text(paid_unit),
            "asp_payment_limit": _decimal_text(asp),
            "allowed_markup_multiple": _decimal_text(allowed_markup),
            "paid_markup_multiple": _decimal_text(paid_markup),
            "hospitals": len(item["sites"]), "quarters": sorted(item["quarters"]),
            "data_quality_status_counts": dict(item["qualities"]),
            "totals_scope": "visible_approved_aggregate_rows_only",
        })
    return Response({"audit_id": audit.pk, "results": result})


@api_view(["GET"])
@permission_classes([CanView])
def hospital_comparison(request, audit_id):
    audit = get_visible_audit(request.user, audit_id)
    rows = audit.results.exclude(hospital_price_per_unit__isnull=True)
    return Response([{
        "hcpcs_code": row.hcpcs_code, "site_npi": row.site_npi,
        "quarter": row.quarter, "service_setting": row.service_setting,
        "plan_allowed_price_per_unit": _decimal_text(row.plan_allowed_price_per_unit),
        "hospital_reported_price_per_unit": _decimal_text(row.hospital_price_per_unit),
        "hospital_markup_multiple": _decimal_text(row.hospital_markup_multiple),
        "plan_to_hospital_price_multiple": _decimal_text(row.plan_to_hospital_price_multiple),
        "data_quality_status": row.data_quality_status,
        "source_references": row.source_references,
        "interpretation": "Hospital-reported reference price; not the employer plan's contracted rate.",
    } for row in rows[:2000]])


@api_view(["GET"])
@permission_classes([CanView])
def asp_benchmark(request, audit_id):
    audit = get_visible_audit(request.user, audit_id)
    rows = audit.results.all().order_by("hcpcs_code", "quarter", "site_npi")
    return Response([{
        "hcpcs_code": row.hcpcs_code, "site_npi": row.site_npi,
        "quarter": row.quarter, "plan_allowed_price_per_unit": _decimal_text(row.plan_allowed_price_per_unit),
        "plan_paid_price_per_unit": _decimal_text(row.plan_paid_price_per_unit),
        "asp_payment_limit": _decimal_text(row.asp_payment_limit),
        "allowed_markup_multiple": _decimal_text(row.allowed_markup_multiple),
        "paid_markup_multiple": _decimal_text(row.paid_markup_multiple),
        "data_quality_status": row.data_quality_status,
        "source_references": row.source_references,
    } for row in rows[:2000]])


@api_view(["GET"])
@permission_classes([CanView])
def audit_overview(request, audit_id):
    audit = get_visible_audit(request.user, audit_id)
    return Response({"audit": audit_payload(audit), "metrics": _visible_totals(audit)})
