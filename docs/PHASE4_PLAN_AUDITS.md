# Phase 4: Plan-Specific Infusion Drug Audit

## Data boundary

The client extractor processes employer or TPA claim files inside that organization's controlled environment. It does not make network requests. Only the approved aggregate CSV and its manifest are uploaded to MeshKor. Raw claims, claim IDs, and member IDs are not accepted by the central import endpoint or stored in its database.

The local quality report can contain source row numbers and generic validation reasons. Keep that report in the client environment.

## Client-side extractor

Install and run from the extractor directory:

```powershell
cd client_extractor
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item config/client_config.example.yaml config/client_config.yaml
python -m src.cli extract --claims path\to\claims.csv --config config\client_config.yaml --output output
```

The extractor accepts CSV, XLSX, and XLSM. 837P/837I parsing is deliberately disabled until the payer companion guide and adjudication rules are implemented.

Required input columns are claim_id, service_date, hcpcs_code, site_npi, units, allowed_amount, paid_amount, member_id, claim_status, and plan_id. Optional columns are adjustment_reference, reversal_reference, and service_setting.

Before processing, set local plan_id and plan_reference. Add billing unit entries only after a source-backed review. Every entry must include qty, unit, verification_status: validated, source_reference, and the source file's 64-character SHA-256. There is no default or dummy billing unit.

Adjustment and reversal references are resolved only when the reference is unique and belongs to the same member, plan, HCPCS code, provider NPI, and service date. Denied claims, unresolved references, and duplicate or conflicting records are excluded and counted in output/data_quality.json.

Aggregation is by plan reference, HCPCS, site NPI, calendar quarter, and service setting. Cells with fewer than 11 distinct members are suppressed. A second site cell is suppressed within a group that contains a small cell. No subtotal rows or exact member counts are exported.

The central import accepts only output/claims_summary.csv plus its matching output/manifest.json.

## Network roster input

A plan roster CSV must have these exact columns:

```csv
provider_npi,provider_name,network_name,network_status,effective_start,effective_end,service_location,applicable_plan_reference
```

Use in_network or out_of_network, valid ISO dates, and the selected plan's exact plan_reference. Leave effective_end empty only for an open-ended source record. An NPI is treated as in-network for a quarter only when a roster interval covers the full quarter. Missing, conflicting, or expired evidence remains unknown or expired.

## Central workflow

1. An Admin creates an employer/TPA organization and plan.
2. An Admin grants each Viewer access to the organization. Viewer API queries are restricted to those assigned organizations.
3. An Admin imports the extractor's aggregate CSV and manifest. The server validates the schema, SHA-256, dates, quarter, NPI, plan reference, member band, duplicate keys, and privacy declarations. It stores only approved aggregate rows and import metadata.
4. An Admin imports the plan network roster.
5. An Admin creates and runs an audit. Viewers can review scoped results and submit review comments. Only Admins can approve/reject or run the audit.
6. The audit page shows plan allowed/paid unit prices, the CMS ASP limit, a hospital-reported reference when an explicitly verified site mapping exists, network status, source lineage, quality gaps, and CSV/PDF exports.

API routes are mounted under /api/v1/ and /api/. The canonical routes include /organizations/, /plans/, /plans/{id}/network-roster/, /plan-audits/import-summary/, /plan-audits/imports/, /plan-audits/create/, /plan-audits/{id}/run/, /plan-audits/{id}/overview/, /plan-audits/{id}/results/, /plan-audits/{id}/drug-analysis/, /plan-audits/{id}/hospital-comparison/, /plan-audits/{id}/asp-benchmark/, /plan-audits/{id}/savings/, /plan-audits/{id}/network-validation/, /plan-audits/{id}/quality/, /plan-audits/{id}/generate-report/, /plan-audits/{id}/report/, /plan-audits/{id}/export-csv/, and /plan-audits/{id}/review/.

## Calculation and interpretation rules

- Plan allowed per unit = total allowed / total units.
- Plan paid per unit = total paid / total units.
- Hospital markup = hospital-reported price per verified HCPCS unit / CMS ASP payment limit.
- Plan allowed markup and plan paid markup are separate ratios to the same quarter's CMS ASP payment limit.
- Plan-to-hospital ratio = plan allowed per unit / hospital-reported price per unit.
- CMS ASP payment limit already includes the statutory 6%; no additional 6% is added.
- Hospital-reported prices are not represented as the plan's contracted rate.
- Potential savings compare the plan's observed current-site allowed amount per unit with a lower amount observed for the same HCPCS, quarter, setting, and billing unit at another site whose roster confirms full-quarter in-network status. The figure is not a forecast or guarantee. Clinical review stays pending; the application does not currently hold provider capacity or clinical suitability evidence.

All comparisons retain quarter and source file/hash references. Missing references are not treated as zero. Unverified units show UNIT_UNRESOLVED; absent hospital/ASP evidence shows REFERENCE_NOT_FOUND; unknown network status is displayed as a warning.

## Data still required for meaningful results

The software does not manufacture client inputs. To populate a real audit, the employer/TPA must supply its claims export to the local extractor and its provider network roster to the Admin. For hospital-price matches, add only individually verified name-to-NPI entries to config/hospital_sites.csv with the fields hospital_name, npi, source, and verified_on; the current file has no mappings, so hospital prices remain unmatched until those are verified. CMS ASP and other Phase 0–3 reference data continue to come from the existing Parquet pipeline. A current unit review must exist for the HCPCS scope used by the audit. No alternative becomes clinically actionable without independent clinical and feasibility review.
