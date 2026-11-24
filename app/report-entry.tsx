"use client";

import { useState, type FormEvent } from "react";
import { type Unit } from "../lib/directory";
import {
  countMetrics, generationsLabel, reportFields, reportMonthPattern, submitterGroups,
  type FamilyHistoryReport, type ReportField,
} from "../lib/family-history";
import { saveFamilyHistoryReport } from "./report-actions";
import { Modal } from "./editor";

export function ReportEntry({ wards, unitNames, initialUnit, initialMonth, reports, close, saved, fixedUnit }: {
  wards: Unit[];
  fixedUnit?: boolean;
  unitNames: Map<string, string>;
  initialUnit: string;
  initialMonth: string;
  reports: Map<string, FamilyHistoryReport>;
  close: () => void;
  saved: (unit: string, month: string) => void;
}) {
  const [unit, setUnit] = useState(initialUnit);
  const [month, setMonth] = useState(initialMonth);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const existing = reports.get(`${unit}/${month}`);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values: Partial<Record<ReportField, number | null>> = Object.fromEntries(reportFields.map((field) => {
      const value = form.get(field);
      return [field, typeof value === "string" && value.trim() ? Number(value) : null];
    }));
    if (values.indexed === null && existing?.indexed == null) delete values.indexed;
    for (const { key, label } of submitterGroups) {
      const raw = String(form.get(`${key}_submitter_input`) ?? "").trim();
      if (raw && !/^(?:\d+|(?:\d+(?:\.\d+)?|\.\d+)\s*%)$/.test(raw)) {
        setError(`Enter ${label.toLowerCase()} submitters as a whole number or a percentage with a % sign.`);
        return;
      }
      values[key === "total" ? "submitters" : `${key}_submitters` as const] = raw && !raw.endsWith("%") ? Number(raw) : null;
      values[`${key}_percent`] = raw.endsWith("%") ? Number(raw.slice(0, -1)) : null;
      if (raw.endsWith("%") && (values[`${key}_percent`] ?? 0) > 100) {
        setError(`${label} submitter percentage must be between 0 and 100.`);
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      const result = await saveFamilyHistoryReport({ unit_id: unit, month, revision: existing?.revision ?? null, values });
      if (result.error) setError(result.error);
      else saved(unit, month);
    } catch {
      setError("Could not save the report. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function field(name: ReportField, label: string, percent = false) {
    return <input name={name} aria-label={label} type="number" min="0" max={percent ? 100 : 2147483647}
      step={percent ? "any" : 1} defaultValue={existing?.[name] ?? ""} />;
  }

  return (
    <Modal title="Enter monthly report" close={() => { if (!busy) close(); }}>
      <form className="modal-body stack" onSubmit={submit}>
        <fieldset disabled={busy} className="report-entry-fields">
          <div className="report-entry-target">
            {fixedUnit ? <div className="report-entry-unit"><small>Ward or branch</small><strong>{unitNames.get(unit)}</strong></div> : <label>Ward or branch
              <select required value={unit} onChange={(event) => { setUnit(event.target.value); setError(""); }}>
                <option value="">Select a ward or branch</option>
                {wards.map(({ id }) => <option key={id} value={id}>{unitNames.get(id)}</option>)}
              </select>
            </label>}
            <label>Report month
              <input type="month" required min="1900-01" max="9999-12" value={month}
                onChange={(event) => { setMonth(event.target.value); setError(""); }} />
            </label>
          </div>
          {unit && reportMonthPattern.test(month) && <div className="stack" key={`${unit}/${month}/${existing?.revision ?? ""}`}>
            <p className="field-help">{existing ? "Editing a saved report." : "New report."} Enter the YTD figures from the PDF. Leave any unavailable numbers blank.</p>
            <fieldset>
              <legend>Activity figures</legend>
              {countMetrics.filter(({ key }) => key !== "submitters").map(({ key, label }) => <label key={key}>{label}{field(key, label)}</label>)}
              <div className="report-entry-pair">
                <label>{generationsLabel} (%){field("first_four_generations", `${generationsLabel} percentage`, true)}</label>
                <label>Members counted for this percentage{field("first_four_members", "Member count for first four generations")}</label>
              </div>
              <p className="field-help">If the PDF gives a separate member count for this percentage, enter it here. The rollup otherwise uses the total eligible member count as an estimate.</p>
            </fieldset>
            <fieldset className="report-entry-breakdown">
              <legend>YTD submitter breakdown</legend>
              <p className="field-help">For a fraction such as 74 / 325, enter 74 and 325. For older reports with a percentage, enter the % sign, for example 22.8%.</p>
              <div className="report-table-scroll">
                <table className="report-table report-entry-table">
                  <thead><tr><th scope="col">Group</th><th scope="col">Submitters</th><th scope="col">Eligible members</th></tr></thead>
                  <tbody>{submitterGroups.map(({ key, label }) => <tr key={key}>
                    <th scope="row">{label}</th>
                    <td><input name={`${key}_submitter_input`} aria-label={`${label} submitters`} inputMode="text"
                      defaultValue={existing?.[key === "total" ? "submitters" : `${key}_submitters` as const]
                        ?? (existing?.[`${key}_percent`] != null ? `${existing[`${key}_percent`]}%` : "")} /></td>
                    <td>{field(`${key}_members`, `${label} eligible members`)}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </fieldset>
          </div>}
        </fieldset>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="form-actions">
          <button className="button" type="button" disabled={busy} onClick={close}>Cancel</button>
          <button className="button primary" disabled={busy || !unit || !reportMonthPattern.test(month)}>{busy ? "Saving…" : "Save report"}</button>
        </div>
      </form>
    </Modal>
  );
}
