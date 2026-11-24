"use client";

import { useState, type FormEvent } from "react";
import type { Unit } from "../lib/directory";
import { monthNames, reportPeriod, type FamilyHistoryReport } from "../lib/family-history";
import { Modal } from "./editor";
import { saveSubmitterHistory } from "./report-actions";

export function SubmitterHistoryEntry({ wards, unitNames, initialUnit, initialMonth, reports, fixedUnit, close, saved }: {
  wards: Unit[];
  unitNames: Map<string, string>;
  initialUnit: string;
  initialMonth: string;
  reports: Map<string, FamilyHistoryReport>;
  fixedUnit: boolean;
  close: () => void;
  saved: (unit: string, month: string, changedMonths: number) => void;
}) {
  const [unit, setUnit] = useState(initialUnit);
  const [yearText, setYearText] = useState(initialMonth.slice(0, 4));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const year = Number(yearText);
  const validYear = Number.isInteger(year) && year >= 1900 && year <= 9999;
  const years = validYear ? (year === 1900 ? [year] : [year - 1, year]) : [];
  const rows = monthNames.map((label, index) => ({
    label,
    cells: years.map((displayYear) => {
      const month = reportPeriod(displayYear, index);
      return { month, report: reports.get(`${unit}/${month}`) };
    }),
  }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const months = rows.flatMap(({ cells }) => cells.flatMap(({ month, report }) => {
      const raw = String(form.get(month) ?? "").trim();
      const submitters = Number(raw);
      return raw && submitters !== report?.submitters ? [{ month, submitters, revision: report?.revision ?? null }] : [];
    }));
    if (!months.length) {
      setError("Enter or change at least one monthly count.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result = await saveSubmitterHistory({ unit_id: unit, months });
      if (result.error) setError(result.error);
      else {
        const visibleMonth = `${year}-${initialMonth.slice(5, 7)}`;
        const latest = months.reduce((latest, { month }) => month.startsWith(`${year}-`) && month > latest ? month : latest, visibleMonth);
        saved(unit, latest, months.length);
      }
    } catch {
      setError("Could not save submitter history. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Enter submitter history" close={() => { if (!busy) close(); }}>
      <form className="modal-body stack" onSubmit={submit}>
        <fieldset disabled={busy} className="report-entry-fields">
          <div className="report-entry-target">
            {fixedUnit ? <div className="report-entry-unit"><small>Ward or branch</small><strong>{unitNames.get(unit)}</strong></div> : <label>Ward or branch
              <select required value={unit} onChange={(event) => { setUnit(event.target.value); setError(""); }}>
                <option value="">Select a ward or branch</option>
                {wards.map(({ id }) => <option key={id} value={id}>{unitNames.get(id)}</option>)}
              </select>
            </label>}
            <label>Report year
              <input type="number" required min="1900" max="9999" step="1" value={yearText}
                onChange={(event) => { setYearText(event.target.value); setError(""); }} />
            </label>
          </div>
          {unit && validYear && <>
            <p className="field-help">Copy the year-to-date counts from the graph. Blank cells skip that month. Enter 0 if the graph shows zero.</p>
            <table className="report-table report-entry-table submitter-history-table" key={`${unit}/${year}`}>
              <thead><tr><th scope="col">Month</th>{years.map((displayYear) => <th key={displayYear} scope="col">YTD {displayYear}</th>)}</tr></thead>
              <tbody>{rows.map(({ label, cells }) => <tr key={label}>
                <th scope="row">{label}</th>
                {cells.map(({ month, report }) => <td key={month}>
                  <input name={month} aria-label={`${label} ${month.slice(0, 4)} submitters`} type="number"
                    min="0" max="2147483647" step="1" defaultValue={report?.submitters ?? ""} />
                </td>)}
              </tr>)}</tbody>
            </table>
          </>}
        </fieldset>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="form-actions">
          <button className="button" type="button" disabled={busy} onClick={close}>Cancel</button>
          <button className="button primary" disabled={busy || !unit || !validYear}>{busy ? "Saving…" : "Save history"}</button>
        </div>
      </form>
    </Modal>
  );
}
