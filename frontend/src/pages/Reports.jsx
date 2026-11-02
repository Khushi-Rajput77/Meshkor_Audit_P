import { useState } from "react";
import { postJSON, useApi, downloadFile } from "../api.js";
import { Loading, Table } from "../components.jsx";

export default function Reports({ user }) {
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadingXlsx, setDownloadingXlsx] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const isAdmin = user?.roles?.some((role) => ["SUPER_ADMIN", "Admin"].includes(role));
  const canRelease = user?.roles?.some((role) => ["SUPER_ADMIN", "REVIEWER", "Admin"].includes(role));
  const canReviewReports = user?.roles?.some((role) => ["SUPER_ADMIN", "ANALYST", "REVIEWER", "Admin"].includes(role));
  const reports = useApi("reports", null, [version]);
  const currentReportReleased = reports.data?.some((report) => report.status === "released");
  const canDownload = isAdmin || currentReportReleased;

  async function release() {
    setError(""); setMessage("");
    try {
      const result = await postJSON("reports/approval/sign-off");
      setMessage(result.signed ? "The current report is released for Viewer access." : "The report was not released.");
      setVersion((v) => v + 1);
    } catch (e) { setError(e.message); }
  }

  async function handleDownload() {
    setError("");
    setDownloading(true);
    try {
      await downloadFile("reports/market-analysis/pdf/", "ohio_infusion_drug_market_report.pdf");
    } catch (e) {
      setError(e.message);
    } finally {
      setDownloading(false);
    }
  }

  async function handleCsvDownload() {
    setError("");
    setDownloadingCsv(true);
    try {
      await downloadFile("hospital-drug-price-comparisons/exports/csv/", "infusion_audit_report_appendix.csv");
    } catch (e) { setError(e.message); }
    finally { setDownloadingCsv(false); }
  }

  async function handleXlsxDownload() {
    setError("");
    setDownloadingXlsx(true);
    try {
      await downloadFile("hospital-drug-price-comparisons/exports/excel/", "infusion_audit_comparisons.xlsx");
    } catch (e) {
      setError(e.message);
    } finally {
      setDownloadingXlsx(false);
    }
  }

  return <>
    <h1>Reports & Exports</h1>
    <p className="lede">{isAdmin
      ? "Review draft reports, record an independent release, and export the supporting detail."
      : canReviewReports
        ? "Track current report builds. Reviewers can release a completed report; downloads are available after release."
        : "Download the current released Ohio market report and its CSV data appendix."}</p>
    <section>
      <h2>Current market report</h2>
      <p className="muted">Prices shown are posted hospital rates; they do not represent plan claims, acquisition costs, or guaranteed savings. Unit review status is shown in the underlying tables.</p>
      <div className="filters">
        <button type="button" className="button" onClick={handleDownload} disabled={downloading || !canDownload}>
          {downloading ? "Generating PDF…" : canDownload ? "Download PDF Report" : "PDF available after release"}
        </button>
        <button type="button" className="button secondary" onClick={handleCsvDownload} disabled={downloadingCsv || !canDownload}>
          {downloadingCsv ? "Preparing appendix…" : canDownload ? "Download CSV Appendix" : "CSV available after release"}
        </button>
        {isAdmin && <button type="button" className="button secondary" onClick={handleXlsxDownload} disabled={downloadingXlsx}>
          {downloadingXlsx ? "Generating workbook…" : "Download Admin Excel Export"}
        </button>}
        {canRelease && <>
          <button type="button" onClick={release} disabled={!reports.data?.some((report) => report.status === "generated")}>
            Release current report
          </button>
        </>}
      </div>
      {message && <p role="status" className="success-message">{message}</p>}
      {error && <p role="alert" className="note error">{error}</p>}
    </section>
    <Loading state={reports}>{(rows) => <section>
      <h2>Report history</h2>
      <Table rows={rows} columns={[
        { key: "name", label: "Report" },
        { key: "status", label: "Status" },
        { key: "generated_at", label: "Generated", render: (r) => new Date(r.generated_at).toLocaleString() },
        ...(isAdmin ? [{ key: "built_by", label: "Built by", render: (r) => r.built_by || "—" }] : []),
        { key: "approved_by", label: "Released by", render: (r) => r.approved_by || "—" },
      ]} />
    </section>}</Loading>
  </>;
}
