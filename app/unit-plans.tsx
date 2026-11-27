"use client";

import { useState, type FormEvent } from "react";
import { Download, ExternalLink, Eye } from "lucide-react";
import { type Unit } from "../lib/directory";
import { unitPlanMaxBytes, type UnitPlan } from "../lib/unit-plans";
import { Modal } from "./modal";
import { uploadUnitPlan } from "./unit-plan-actions";

const yearFormat = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "America/Boise" });

export function UnitPlans({ unit, title, currentYear, versions, loadError, uploadOpen, closeUpload }: {
  unit: Unit;
  title: string;
  currentYear: string;
  versions: UnitPlan[];
  loadError: string | null;
  uploadOpen: boolean;
  closeUpload: () => void;
}) {
  const [preview, setPreview] = useState<UnitPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const current = versions.find(({ created_at }) => yearFormat.format(new Date(created_at)) === currentYear);
  const archive = versions.filter(({ id }) => id !== current?.id);

  function planHref(plan: UnitPlan) {
    return `/units/${unit.id}/ward-plans/${plan.id}`;
  }

  function planRow(plan: UnitPlan) {
    return <li key={plan.id} className="unit-plan-row">
      <time className="unit-plan-year" dateTime={plan.created_at}>{yearFormat.format(new Date(plan.created_at))}</time>
      <strong>{plan.filename}</strong>
      <div className="unit-plan-file-actions">
        <button type="button" className="button" aria-label={`View ${plan.filename}`} aria-haspopup="dialog"
          onClick={() => setPreview(plan)}><Eye size={16} aria-hidden /> View PDF</button>
        <a className="button" href={planHref(plan)} aria-label={`Download ${plan.filename}`}>
          <Download size={16} aria-hidden /> Download
        </a>
      </div>
    </li>;
  }

  function dismissUpload() {
    setError("");
    closeUpload();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setStatus("");
    const form = new FormData(event.currentTarget);
    const file = form.get("pdf");
    if (file instanceof File && file.size > unitPlanMaxBytes) {
      setError("Choose a PDF file up to 4 MB.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result = await uploadUnitPlan(unit.id, form);
      if (result.error) setError(result.error);
      else {
        closeUpload();
        setStatus(`${title} uploaded.`);
      }
    } catch {
      setError("Could not upload the PDF. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="unit-plans stack" aria-labelledby="unit-plan-heading">
    <div className="panel unit-plan-card">
      <h2 id="unit-plan-heading">{title}</h2>
      {loadError ? <p className="notice error" role="alert">{loadError}</p> : <>
        {status && <p className="notice" role="status">{status}</p>}
        <ul className="management-list">
          {current ? planRow(current) : <li className="unit-plan-row">
            <strong className="unit-plan-year">{currentYear}</strong>
            <span className="muted">Not uploaded yet</span>
          </li>}
        </ul>
      </>}
    </div>
    {!loadError && archive.length > 0 && <>
      <h3>Previous plans</h3>
      <ul className="panel management-list">{archive.map(planRow)}</ul>
    </>}
    {preview && <Modal title={preview.filename} className="unit-plan-viewer" close={() => setPreview(null)}>
      <div className="unit-plan-viewer-actions">
        <a className="button" href={`${planHref(preview)}?view=1`} target="_blank" rel="noopener">
          <ExternalLink size={16} aria-hidden /> Open in new tab
        </a>
        <a className="button" href={planHref(preview)}><Download size={16} aria-hidden /> Download</a>
      </div>
      <iframe className="unit-plan-pdf" title={`PDF viewer for ${preview.filename}`} src={`${planHref(preview)}?view=1`} />
    </Modal>}
    {uploadOpen && <Modal title={`Add ${title}`} close={() => { if (!busy) dismissUpload(); }}>
      <form className="modal-body stack" onSubmit={submit}>
        <label>{title} PDF<input type="file" name="pdf" accept=".pdf,application/pdf" required disabled={busy} /></label>
        <p className="field-help">Upload a PDF up to 4 MB. The previous plan will remain in the archive.</p>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="button" disabled={busy} onClick={dismissUpload}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy}>{busy ? "Uploading…" : "Upload PDF"}</button>
        </div>
      </form>
    </Modal>}
  </section>;
}
