"use client";

import { useState, type FormEvent } from "react";
import { formatBuildingAddress, type Building, type Unit } from "../lib/directory";
import { AddressLink } from "./address-link";
import { formatVisitTime, minuteToTime, timeToMinute, visitLabels, type VisitEvent, type VisitKind } from "../lib/visits";
import { deleteVisit, saveVisit, scheduleVisit } from "./visit-actions";
import { Modal } from "./editor";

export type VisitEditorEntry = { unit?: Unit; day: string; event?: VisitEvent; minute?: number };

export function scheduledMessage(added: number) {
  return added ? `Added ${added} ${added === 1 ? "meeting" : "meetings"} to your calendar.`
    : "Those saved meetings are already on your calendar, or the unit has no saved meeting times.";
}

export function VisitEditor({ entry, editable, building, close, done }: {
  entry: VisitEditorEntry; editable: boolean; building?: Building; close: () => void; done: (day: string, message: string) => void;
}) {
  const { event, unit } = entry;
  const isDrive = !unit;
  const hasTimes = Boolean(unit?.sacrament_meeting_time || unit?.council_meeting_time);
  const [useMeetings, setUseMeetings] = useState(!event && hasTimes);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const initialStart = event?.start_minute ?? entry.minute
    ?? timeToMinute(unit?.sacrament_meeting_time ?? unit?.council_meeting_time ?? "09:00");
  const initialEnd = event?.end_minute ?? initialStart + (isDrive ? 30 : 60);

  async function submit(eventSubmit: FormEvent<HTMLFormElement>) {
    eventSubmit.preventDefault();
    if (busy || !editable) return;
    const data = new FormData(eventSubmit.currentTarget);
    const day = String(data.get("date"));
    setBusy(true);
    setError("");
    try {
      if (useMeetings && unit) {
        const response = await scheduleVisit(unit.id, day);
        if (response.error) setError(response.error);
        else done(day, scheduledMessage(response.added));
        return;
      }
      const response = await saveVisit({
        id: event?.id ?? null, unit_id: unit?.id ?? null, event_date: day,
        kind: isDrive ? "drive" : event?.kind ?? String(data.get("kind")) as VisitKind,
        title: isDrive ? String(data.get("title") ?? "").trim() || null : null,
        start_minute: timeToMinute(String(data.get("start"))),
        end_minute: timeToMinute(String(data.get("end"))) + (data.has("next_day") ? 1440 : 0),
      });
      if (response.error) setError(response.error);
      else done(day, isDrive ? (event ? "Driving block updated." : "Driving block added.") : event ? "Visit updated." : "Visit added to your calendar.");
    } catch {
      setError("Could not save this visit. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!event || busy || !editable) return;
    setBusy(true);
    try {
      const response = await deleteVisit(event.id);
      if (response.error) setError(response.error);
      else done(event.event_date, "Visit removed.");
    } catch {
      setError("Could not remove this visit.");
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={event ? visitLabels[event.kind] : isDrive ? "Add driving time" : "Schedule a visit"} close={() => { if (!busy) close(); }}>
    <form className="modal-body stack" onSubmit={submit}>
      {unit && <strong>{unit.name}</strong>}
      {building && <small><AddressLink address={formatBuildingAddress(building)} /></small>}
      {!editable && event && <p>Planned by {event.owner_email}</p>}
      {isDrive && <label>Trip label <span className="optional">optional</span>
        <input name="title" maxLength={150} defaultValue={event?.title ?? ""} disabled={!editable || busy} />
      </label>}
      <label>Date<input type="date" name="date" required defaultValue={entry.day} disabled={!editable || busy} /></label>
      {!event && hasTimes && <label className="check"><input type="checkbox" checked={useMeetings} disabled={busy}
        onChange={(e) => setUseMeetings(e.target.checked)} />Use saved meeting times</label>}
      {useMeetings ? <ul className="field-help">
        {unit?.sacrament_meeting_time && <li>Sacrament meeting at {formatVisitTime(timeToMinute(unit.sacrament_meeting_time))} · 1 hour</li>}
        {unit?.council_meeting_time && <li>Ward / branch council at {formatVisitTime(timeToMinute(unit.council_meeting_time))} · 1 hour</li>}
      </ul> : <>
        {!event && !isDrive && <label>Event type<select name="kind" defaultValue="visit">
          {Object.entries(visitLabels).filter(([value]) => value !== "drive").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>}
        <div className="visit-time-fields">
          <label>Start time<input type="time" name="start" required defaultValue={minuteToTime(initialStart)} disabled={!editable || busy} /></label>
          <label>End time<input type="time" name="end" required defaultValue={minuteToTime(initialEnd)} disabled={!editable || busy} /></label>
        </div>
        <label className="check"><input type="checkbox" name="next_day" defaultChecked={initialEnd >= 1440} disabled={!editable || busy} />Ends the next day</label>
      </>}
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="form-actions">
        {event && editable && <button type="button" className="button text-danger push" disabled={busy}
          onClick={() => { if (confirmDelete) void remove(); else setConfirmDelete(true); }}>
          {confirmDelete ? "Confirm removal" : "Remove"}
        </button>}
        <button type="button" className="button" disabled={busy} onClick={close}>{editable ? "Cancel" : "Close"}</button>
        {editable && <button className="button primary" disabled={busy}>{busy ? "Saving…" : isDrive ? "Save driving block" : "Save visit"}</button>}
      </div>
    </form>
  </Modal>;
}
