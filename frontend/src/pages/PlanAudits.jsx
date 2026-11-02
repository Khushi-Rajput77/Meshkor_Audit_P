import React, { useCallback, useEffect, useMemo, useState } from "react";
import { deleteJSON, downloadFile, getJSON, postJSON, uploadPlanSummary, uploadNetworkRoster } from "../api.js";

const isAdmin = (user) => user?.roles?.some((role) => ["SUPER_ADMIN", "Admin"].includes(role));
const isAnalyst = (user) => isAdmin(user) || user?.roles?.includes("ANALYST");
const money = (value) => {
  if (value == null || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: number < 10 ? 3 : 2,
  }).format(number) : "—";
};
const count = (value) => value == null ? "—" : Number(value).toLocaleString("en-US");

function ErrorBox({ error, details }) {
  return error ? <div className="data-quality-alert" role="alert"><div className="alert-content">
    <strong className="alert-title">Could not complete the request</strong><span className="alert-description">{error}</span>
    {details && <pre className="plan-audit-error-details">{JSON.stringify(details, null, 2)}</pre>}
  </div></div> : null;
}

function Field({ label, ...props }) {
  return <label className="plan-audit-field">{label}<input {...props} /></label>;
}

export default function PlanAudits({ user }) {
  const admin = isAdmin(user);
  const analyst = isAnalyst(user);
  const [organizations, setOrganizations] = useState([]);
  const [plans, setPlans] = useState([]);
  const [imports, setImports] = useState([]);
  const [audits, setAudits] = useState([]);
  const [organizationId, setOrganizationId] = useState("");
  const [planId, setPlanId] = useState("");
  const [importId, setImportId] = useState("");
  const [auditId, setAuditId] = useState("");
  const [audit, setAudit] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [results, setResults] = useState([]);
  const [resultCount, setResultCount] = useState(0);
  const [hcpcsFilter, setHcpcsFilter] = useState("");
  const [quarterFilter, setQuarterFilter] = useState("");
  const [savings, setSavings] = useState([]);
  const [quality, setQuality] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [accessRows, setAccessRows] = useState([]);
  const [viewerUsers, setViewerUsers] = useState([]);
  const [error, setError] = useState("");
  const [errorDetails, setErrorDetails] = useState(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  useEffect(() => {
    let alive = true;
    getJSON("organizations/").then((items) => {
      if (!alive) return;
      setOrganizations(items);
      if (!items.some((item) => String(item.id) === String(organizationId))) {
        setOrganizationId(items.length ? String(items[0].id) : "");
      }
    }).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [organizationId, refreshKey]);

  useEffect(() => {
    setPlans([]); setPlanId(""); setImports([]); setImportId(""); setAudits([]); setAuditId("");
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) {
      setPlans([]); setPlanId("");
      return undefined;
    }
    let alive = true;
    getJSON("plans/", { organization_id: organizationId }).then((items) => {
      if (!alive) return;
      setPlans(items);
      if (!items.length) setPlanId("");
      else if (!items.some((item) => String(item.id) === String(planId))) {
        setPlanId(String(items[0].id));
      }
    }).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [organizationId, refreshKey, planId]);

  useEffect(() => {
    setImports([]); setImportId(""); setAudits([]); setAuditId("");
  }, [planId]);

  useEffect(() => {
    if (!planId) {
      setImports([]); setImportId(""); setAudits([]); setAuditId("");
      return undefined;
    }
    let alive = true;
    Promise.all([
      getJSON("plan-audits/imports/", { plan_id: planId }),
      getJSON("plan-audits/", { plan_id: planId }),
    ]).then(([importItems, auditItems]) => {
      if (!alive) return;
      setImports(importItems); setAudits(auditItems);
      if (!importItems.some((item) => String(item.id) === String(importId))) {
        setImportId(importItems.length ? String(importItems[0].id) : "");
      }
      if (!auditItems.some((item) => String(item.id) === String(auditId))) {
        setAuditId(auditItems.length ? String(auditItems[0].id) : "");
      }
    }).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [planId, refreshKey, importId, auditId]);

  useEffect(() => {
    setAudit(null); setMetrics(null); setResults([]); setSavings([]); setQuality(null); setReviews([]);
    if (!auditId) return undefined;
    let alive = true;
    const base = "plan-audits/" + auditId + "/";
    Promise.all([
      getJSON(base), getJSON(base + "overview/"),
      getJSON(base + "savings/"), getJSON(base + "quality/"), getJSON(base + "review/"),
    ]).then(([detail, overview, savingsRows, qualityData, reviewRows]) => {
      if (!alive) return;
      setAudit(detail); setMetrics(overview.metrics);
      setSavings(savingsRows); setQuality(qualityData); setReviews(reviewRows);
    }).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [auditId, refreshKey]);

  useEffect(() => {
    setResults([]); setResultCount(0);
    if (!auditId) return undefined;
    let alive = true;
    getJSON("plan-audits/" + auditId + "/results/", { limit: 500, hcpcs_code: hcpcsFilter, quarter: quarterFilter })
      .then((page) => { if (alive) { setResults(page.results || []); setResultCount(page.count || 0); } })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [auditId, refreshKey, hcpcsFilter, quarterFilter]);

  useEffect(() => {
    if (!admin) return undefined;
    let alive = true;
    getJSON("user-accounts/").then((items) => alive && setViewerUsers(
      items.filter((item) => item.is_active && item.roles?.some((role) => ["CLIENT", "ANALYST", "Viewer"].includes(role))),
    )).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [admin]);

  useEffect(() => {
    setAccessRows([]);
    if (!admin || !organizationId) return undefined;
    let alive = true;
    getJSON("organizations/" + organizationId + "/users/")
      .then((items) => alive && setAccessRows(items))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [admin, organizationId, refreshKey]);

  const selectedImport = useMemo(
    () => imports.find((item) => String(item.id) === String(importId)), [imports, importId],
  );
  async function act(action, success) {
    setBusy(true); setError(""); setErrorDetails(null); setNotice("");
    try { await action(); setNotice(success); refresh(); }
    catch (e) { setError(e.message); setErrorDetails(e.payload?.validation_summary || e.payload?.errors || null); }
    finally { setBusy(false); }
  }
  async function createOrganization(event) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element);
    await act(async () => {
      await postJSON("organizations/", { organization_name: form.get("organization_name"),
        organization_type: form.get("organization_type") });
      element.reset();
    }, "Organization created.");
  }
  async function createPlan(event) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element);
    await act(async () => {
      await postJSON("plans/", { organization_id: organizationId, plan_name: form.get("plan_name"),
        payer_reference: form.get("payer_reference"), plan_reference: form.get("plan_reference"),
        effective_start: form.get("effective_start") || null, effective_end: form.get("effective_end") || null });
      element.reset();
    }, "Plan created.");
  }
  async function importSummary(event) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element);
    await act(async () => {
      await uploadPlanSummary(organizationId, planId, form.get("summary"), form.get("manifest"));
      element.reset();
    }, "Approved aggregate summary imported.");
  }
  async function uploadRoster(event) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element);
    await act(async () => { await uploadNetworkRoster(planId, form.get("roster")); element.reset(); },
      "Network roster imported.");
  }
  async function createAudit(event) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element);
    await act(async () => {
      const item = await postJSON("plan-audits/create/", { organization_id: organizationId,
        plan_id: planId, summary_import_id: importId, audit_name: form.get("audit_name"),
        reporting_period: form.get("reporting_period") });
      setAuditId(String(item.id)); element.reset();
    }, "Plan audit created.");
  }
  async function runAudit() {
    await act(() => postJSON("plan-audits/" + auditId + "/run/"), "Audit run finished.");
  }
  async function addViewerAccess(event) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element);
    await act(async () => {
      await postJSON("organizations/" + organizationId + "/users/", { user_id: form.get("user_id") });
      element.reset();
    }, "Organization access granted.");
  }
  async function revokeViewer(userId) {
    await act(() => deleteJSON("organizations/" + organizationId + "/users/" + userId + "/"),
      "Organization access revoked.");
  }
  async function submitReview(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await act(() => postJSON("plan-audits/" + auditId + "/review/", { comments: form.get("comments") }),
      "Review submitted.");
  }
  async function generateReport() {
    await act(async () => {
      await postJSON("plan-audits/" + auditId + "/generate-report/");
      await downloadFile("plan-audits/" + auditId + "/report/", "plan-audit-" + auditId + ".pdf");
    }, "PDF report generated.");
  }
  async function exportResults() {
    await act(() => downloadFile("plan-audits/" + auditId + "/export-csv/",
      "plan-audit-" + auditId + ".csv"), "Results CSV downloaded.");
  }

  return <div className="page-stack plan-audits-page">
    <section className="page-intro"><div><p className="eyebrow">Employer and TPA workspace</p>
      <h2>Plan-specific infusion drug audits</h2>
      <p className="muted">Analyze approved claims aggregates against verified hospital prices, Medicare ASP, and plan network data.</p></div></section>
    <ErrorBox error={error} details={errorDetails} />
    {notice && <div className="plan-audit-notice" role="status">{notice}</div>}
    <section className="dashboard-panel">
      <div className="panel-header"><div><h3 className="panel-title">Audit workspace</h3>
        <p className="panel-subtitle">Client and Analyst access is limited to organizations explicitly assigned by a Super Admin.</p></div></div>
      <div className="plan-audit-selectors">
        <label>Organization<select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
          <option value="">Select organization</option>{organizations.map((item) =>
            <option key={item.id} value={item.id}>{item.organization_name} ({item.organization_type})</option>)}
        </select></label>
        <label>Plan<select value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">Select plan</option>{plans.map((item) =>
            <option key={item.id} value={item.id}>{item.plan_name} · {item.plan_reference}</option>)}
        </select></label>
        <label>Audit<select value={auditId} onChange={(e) => setAuditId(e.target.value)}>
          <option value="">Select audit</option>{audits.map((item) =>
            <option key={item.id} value={item.id}>{item.audit_name} · {item.status}</option>)}
        </select></label>
      </div>
      {organizations.length === 0 && <div className="empty-panel-state">No organization access is assigned to this account yet.</div>}
    </section>

    {imports.length > 0 && <section className="dashboard-panel"><h3 className="panel-title">Claims summary import history</h3>
      <div className="table-wrap"><table className="executive-table"><thead><tr><th>Source file</th><th>Status</th><th>Source period</th><th>Aggregate rows</th><th>SHA-256</th></tr></thead><tbody>
        {imports.map((item) => <tr key={item.id}><td>{item.source_file_name}</td><td>{item.import_status}</td><td>{item.source_period || "—"}</td><td>{count(item.row_count)}</td><td><code className="plan-audit-hash">{item.file_hash}</code></td></tr>)}
      </tbody></table></div>
      {selectedImport?.validation_summary && <p className="muted">Selected import: {count(selectedImport.validation_summary.stored_rows)} rows stored; {count(selectedImport.validation_summary.rejected_rows)} rejected. Raw claims stored: no.</p>}
    </section>}

    {analyst && <div className="plan-audit-admin-grid">
      {admin && <>
      <section className="dashboard-panel"><h3 className="panel-title">Create an organization</h3>
        <form className="plan-audit-form" onSubmit={createOrganization}>
          <Field name="organization_name" label="Organization name" maxLength="200" required />
          <label className="plan-audit-field">Organization type<select name="organization_type" required>
            <option value="employer">Employer</option><option value="tpa">TPA</option></select></label>
          <button disabled={busy}>Create organization</button>
        </form>
      </section>
      <section className="dashboard-panel"><h3 className="panel-title">Create a plan</h3>
        {!organizationId ? <p className="muted">Create or select an organization first.</p> :
          <form className="plan-audit-form" onSubmit={createPlan}>
            <Field name="plan_name" label="Plan name" maxLength="200" required />
            <Field name="plan_reference" label="Unique plan reference" maxLength="120" required />
            <Field name="payer_reference" label="Payer reference (optional)" maxLength="120" />
            <Field name="effective_start" label="Effective start (optional)" type="date" />
            <Field name="effective_end" label="Effective end (optional)" type="date" />
            <button disabled={busy}>Create plan</button>
          </form>}
      </section>
      </>}
      <section className="dashboard-panel"><h3 className="panel-title">Import approved aggregates</h3>
        {!planId ? <p className="muted">Select or create a plan first.</p> :
          <form className="plan-audit-form" onSubmit={importSummary}>
            <label className="plan-audit-field">Claims summary CSV<input name="summary" type="file" accept=".csv,text/csv" required /></label>
            <label className="plan-audit-field">Matching manifest JSON<input name="manifest" type="file" accept=".json,application/json" required /></label>
            <p className="muted">Upload only the local extractor's claims_summary.csv and manifest.json. Raw claims must stay in the client environment.</p>
            <button disabled={busy}>{busy ? "Validating and importing…" : "Validate and import"}</button>
          </form>}
      </section>
      <section className="dashboard-panel"><h3 className="panel-title">Import plan network roster</h3>
        {!planId ? <p className="muted">Select a plan first.</p> :
          <form className="plan-audit-form" onSubmit={uploadRoster}>
            <label className="plan-audit-field">Network roster CSV<input name="roster" type="file" accept=".csv,text/csv" required /></label>
            <p className="muted">Use the documented roster schema. Network status is accepted only when the source covers a full reporting quarter.</p>
            <button disabled={busy}>Validate and import roster</button>
          </form>}
      </section>
      <section className="dashboard-panel"><h3 className="panel-title">Create an audit</h3>
        {!selectedImport || selectedImport.import_status !== "accepted" ? <p className="muted">Import an accepted summary for this plan first.</p> :
          <form className="plan-audit-form" onSubmit={createAudit}>
            <Field name="audit_name" label="Audit name" maxLength="200" required />
            <Field name="reporting_period" label="Source period" defaultValue={selectedImport.source_period} maxLength="64" required />
            <button disabled={busy}>Create audit</button>
          </form>}
      </section>
      {admin && <section className="dashboard-panel"><h3 className="panel-title">Organization access</h3>
        {!organizationId ? <p className="muted">Select an organization first.</p> : <>
          <form className="plan-audit-form plan-audit-form--inline" onSubmit={addViewerAccess}>
            <label className="plan-audit-field">Account<select name="user_id" required defaultValue="">
              <option value="">Select an active Analyst or Client</option>{viewerUsers.map((item) =>
                <option key={item.id} value={item.id}>{item.display_name} ({item.username}, ID {item.id})</option>)}
            </select></label>
            <button disabled={busy || viewerUsers.length === 0}>Grant access</button>
          </form>
          {accessRows.length ? <ul className="plan-audit-access-list">{accessRows.map((row) =>
            <li key={row.user_id}><span>{row.display_name} <small>({row.username}, ID {row.user_id})</small></span>
              <button type="button" className="button-subtle" disabled={busy} onClick={() => revokeViewer(row.user_id)}>Revoke</button></li>)}</ul>
            : <p className="muted">No viewers are assigned to this organization.</p>}
        </>}
      </section>}
    </div>}

    {audit && <>
      <section className="dashboard-panel"><div className="panel-header"><div><h3 className="panel-title">{audit.audit_name}</h3>
        <p className="panel-subtitle">{audit.organization_name} · {audit.plan_name} · {audit.reporting_period} · {audit.status}</p></div>
        <div className="plan-audit-actions">
          {analyst && <button type="button" disabled={busy || audit.status === "running"} onClick={runAudit}>Run audit</button>}
          {analyst && <button type="button" className="secondary" disabled={busy || !["completed", "needs_review"].includes(audit.status)} onClick={generateReport}>Generate PDF</button>}
          <button type="button" className="secondary" disabled={busy} onClick={exportResults}>Download results CSV</button>
        </div></div>
        {metrics && <div className="plan-audit-metrics">
          <article><span>Drugs analyzed</span><strong>{count(metrics.drugs_analyzed)}</strong></article>
          <article><span>Hospitals matched</span><strong>{count(metrics.hospitals_compared)}</strong></article>
          <article><span>Sites in claims</span><strong>{count(metrics.sites_with_claims)}</strong></article>
          <article><span>Visible units analyzed</span><strong>{count(metrics.units_analyzed)}</strong></article>
          <article><span>Visible allowed amount</span><strong>{money(metrics.visible_allowed_amount)}</strong></article>
          <article><span>Visible paid amount</span><strong>{money(metrics.visible_paid_amount)}</strong></article>
          <article><span>Potential allowed savings</span><strong>{money(metrics.potential_allowed_savings)}</strong></article>
          <article><span>Quality warnings</span><strong>{count(metrics.data_quality_warnings)}</strong></article>
        </div>}
        <p className="muted">Totals include only approved unsuppressed aggregate rows. Savings are opportunities for review, not guarantees.</p>
      </section>

      {quality && <section className="dashboard-panel"><h3 className="panel-title">Data quality and evidence limits</h3>
        <div className="plan-audit-quality">
          {(quality.notes || []).map((note) => <p key={note}>• {note}</p>)}
          {quality.result_status_counts && Object.entries(quality.result_status_counts).map(([name, value]) =>
            <p key={name}><b>{name}:</b> {count(value)} result rows</p>)}
          {quality.import_quality?.errors?.length > 0 && <p>{count(quality.import_quality.errors.length)} aggregate import validation errors recorded.</p>}
        </div>
      </section>}

      <section className="dashboard-panel"><div className="panel-header"><div><h3 className="panel-title">Drug and site comparison</h3>
        <p className="panel-subtitle">Plan allowed and paid amount per billing unit alongside available CMS ASP and hospital references.</p></div></div>
        <div className="plan-audit-filters">
          <Field label="Filter HCPCS" value={hcpcsFilter} maxLength="5" onChange={(e) => setHcpcsFilter(e.target.value.toUpperCase())} placeholder="J-code" />
          <Field label="Filter quarter" value={quarterFilter} maxLength="6" onChange={(e) => setQuarterFilter(e.target.value.toUpperCase())} placeholder="YYYYQ1" />
        </div>
        <p className="muted">Showing {count(results.length)} of {count(resultCount)} filtered result rows. Download the CSV for the complete export.</p>
        {results.length ? <div className="table-wrap"><table className="executive-table"><thead><tr>
          <th>HCPCS and drug</th><th>Site NPI</th><th>Quarter</th><th>Setting</th><th>Allowed / unit</th><th>Paid / unit</th><th>Hospital ref / unit</th><th>Hospital / ASP</th><th>Plan / hospital</th><th>ASP limit / unit</th><th>Network</th><th>Data quality</th>
        </tr></thead><tbody>{results.map((row) => <tr key={row.id}>
          <td><span className="hcpcs-badge">{row.hcpcs_code}</span><small className="plan-audit-row-notes">{row.drug_description || "Description unavailable"}</small></td><td>{row.site_npi}</td><td>{row.quarter}</td><td>{row.service_setting}</td>
          <td>{money(row.plan_allowed_price_per_unit)}</td><td>{money(row.plan_paid_price_per_unit)}</td><td>{money(row.hospital_price_per_unit)}</td><td>{row.hospital_markup_multiple == null ? "—" : Number(row.hospital_markup_multiple).toFixed(2) + "×"}</td><td>{row.plan_to_hospital_price_multiple == null ? "—" : Number(row.plan_to_hospital_price_multiple).toFixed(2) + "×"}</td><td>{money(row.asp_payment_limit)}</td>
          <td>{row.network_status}</td><td><span className={"status-tag " + (row.data_quality_status === "VALID" ? "validated" : "pending")}>{row.data_quality_status}</span>
            {row.data_quality_notes?.length > 0 && <small className="plan-audit-row-notes">{row.data_quality_notes.join(", ")}</small>}</td>
        </tr>)}</tbody></table></div> : <div className="empty-panel-state">No audit results yet. An Admin can run an audit after selecting an accepted import.</div>}
      </section>

      <section className="dashboard-panel"><h3 className="panel-title">In-network alternatives for review</h3>
        {savings.length ? <div className="table-wrap"><table className="executive-table"><thead><tr>
          <th>HCPCS</th><th>Quarter</th><th>Current site</th><th>Alternative site</th><th>Current allowed / unit</th><th>Alternative / unit</th><th>Potential allowed-amount savings</th><th>Potential paid-amount difference</th><th>Network status</th><th>Clinical review</th>
        </tr></thead><tbody>{savings.map((row) => <tr key={row.id}>
          <td>{row.hcpcs_code}</td><td>{row.quarter}</td><td>{row.current_site_npi}</td><td>{row.alternative_site_npi}</td>
          <td>{money(row.current_allowed_price_per_unit)}</td><td>{money(row.alternative_allowed_price_per_unit)}</td>
          <td>{money(row.potential_allowed_savings)}</td><td>{money(row.potential_paid_difference)}</td><td>{row.network_status}</td><td>{row.clinical_review_status}</td>
        </tr>)}</tbody></table></div> : <div className="empty-panel-state">No potential alternative passed the comparison, verified unit, and full-quarter in-network checks.</div>}
      </section>

      <section className="dashboard-panel"><h3 className="panel-title">Audit review</h3>
        {reviews.length ? <ul className="plan-audit-access-list">{reviews.map((item) =>
          <li key={item.id}><span><b>{item.reviewer || "Reviewer"}:</b> {item.review_status} {item.comments}</span><small>{item.reviewed_at}</small></li>)}
        </ul> : <p className="muted">No review submitted.</p>}
        <form className="plan-audit-form plan-audit-form--inline" onSubmit={submitReview}>
          <Field name="comments" label="Review comments" maxLength="2000" />
          <button disabled={busy || !["completed", "needs_review"].includes(audit.status)}>Submit review</button>
        </form>
      </section>
    </>}
  </div>;
}
