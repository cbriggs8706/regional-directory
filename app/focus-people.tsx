"use client";

import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import type { Contact, Unit } from "../lib/directory";
import { formatReportMonth, reportMonthPattern } from "../lib/family-history";
import { focusMetrics, focusTypeLabels, type FocusActivity, type FocusActivityData } from "../lib/focus-people";
import { Modal, type EditorState } from "./editor";
import { UnitSectionHeading } from "./unit-section-heading";
import { saveFocusActivity } from "./focus-activity-actions";
import { PersonCard } from "./person-card";

const baptismDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function FocusPeople({ unit, contacts, currentMonth, history, edit }: {
  unit: Unit;
  contacts: Contact[];
  currentMonth: string;
  history: FocusActivityData | null;
  edit: (state: EditorState) => void;
}) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ person: Contact; month: string; record?: FocusActivity } | null>(null);
  const month = selectedMonth ?? currentMonth;
  const validMonth = reportMonthPattern.test(month);
  const activity = new Map(history?.activity.filter(({ report_month }) => report_month === `${month}-01`)
    .map((row) => [row.contact_id, row]));

  return <section className="unit-tab-section" aria-labelledby="focus-people-heading">
    <UnitSectionHeading id="focus-people-heading" title="Focus People" unit={unit} />
    <div className="panel focus-people">
      {history?.loadError && <p className="notice error" role="alert">{history.loadError}</p>}
      {contacts.length === 0 ? <p className="muted">No focus people assigned to this {unit.kind} yet.</p> : <>
        <label className="focus-month">Reporting month
          <input type="month" min="1900-01" max="9999-12" value={month}
            onChange={(event) => setSelectedMonth(event.target.value)} />
        </label>
        <ul className="focus-people-list">
          {contacts.map((person) => {
            const record = activity.get(person.id);
            return <PersonCard key={person.id} className="focus-person" person={person}>
              <div className="focus-person-heading">
                <div className="contact-info">
                  <h3>{person.name}</h3>
                  <div className="chips">
                    {person.focus_type && <span className="chip">{focusTypeLabels[person.focus_type]}</span>}
                    {person.is_whatsapp && <span className="chip">WhatsApp</span>}
                  </div>
                  {person.baptized_on && <span>Date Baptized <time dateTime={person.baptized_on}>{baptismDate.format(new Date(person.baptized_on))}</time></span>}
                  {person.phone && <span>{person.phone}</span>}
                  {person.email && <span>{person.email}</span>}
                </div>
                <button className="icon-button" onClick={() => edit({ resource: "contacts", row: person })}
                  aria-label={`Edit ${person.name}`}><Pencil size={17} aria-hidden /></button>
              </div>
              {validMonth && !history?.loadError && <>
                <dl className="focus-metrics">
                  {focusMetrics.map(({ key, label }) => <div key={key}>
                    <dt>{label}</dt>
                    <dd>{record?.[key] == null ? "Unknown" : record[key] ? "Yes" : "No"}</dd>
                  </div>)}
                </dl>
                <button className="button" aria-label={`Edit activity for ${person.name}`} onClick={() => setEditing({ person, month, record })}>Edit activity</button>
              </>}
            </PersonCard>;
          })}
        </ul>
      </>}
      {editing && <ActivityEditor {...editing} close={() => setEditing(null)} />}
    </div>
  </section>;
}

function ActivityEditor({ person, month, record, close }: {
  person: Contact;
  month: string;
  record?: FocusActivity;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(focusMetrics.map(({ key }) => {
      const value = form.get(key);
      return [key, value === "" ? null : value === "yes"];
    }));
    setBusy(true);
    setError("");
    try {
      const result = await saveFocusActivity({ contact_id: person.id, month, revision: record?.revision ?? null, values });
      if (result.error) setError(result.error);
      else close();
    } catch {
      setError("Could not save the activity. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={`Activity for ${person.name}`} close={() => { if (!busy) close(); }}>
    <form className="modal-body stack" onSubmit={submit}>
      <p>Year-to-date activity through {formatReportMonth(month)}.</p>
      {focusMetrics.map(({ key, label }) => <label key={key}>{label}
        <select name={key} disabled={busy} defaultValue={record?.[key] == null ? "" : record[key] ? "yes" : "no"}>
          <option value="">Unknown</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>)}
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="button" type="button" disabled={busy} onClick={close}>Cancel</button>
        <button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save activity"}</button>
      </div>
    </form>
  </Modal>;
}
