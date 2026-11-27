"use client";

import { useEffect, useState, type FormEvent } from "react";
import { formatBuildingAddress, hasSacramentMeeting, unitLineage, unitNameWithType, type Building, type Unit } from "../lib/directory";
import { AddressLink } from "./address-link";
import { formatVisitTime, minuteToTime, timeToMinute, visitLabels, type VisitEvent, type VisitKind } from "../lib/visits";
import { deleteVisit, loadUnitDateEvents, saveVisit, scheduleVisit } from "./visit-actions";
import { Modal } from "./editor";

export type VisitEditorEntry = { unit?: Unit; day: string; event?: VisitEvent; minute?: number };

function VisitUnitOptions({ units }: { units: Map<string, Unit> }) {
  const paths = [...units.values()].map((unit) => ({ unit, lineage: unitLineage(unit, units) }));
  paths.sort((a, b) => {
    for (const [index, unit] of a.lineage.entries()) {
      const other = b.lineage[index];
      if (!other) return 1;
      if (unit.id !== other.id) return unit.name.localeCompare(other.name) || unit.id.localeCompare(other.id);
    }
    return a.lineage.length - b.lineage.length;
  });

  const groups = new Map<string, { label: string; options: { unit: Unit; indented: boolean }[] }>();
  for (const { unit, lineage } of paths) {
    const council = lineage.find(({ kind }) => kind === "council");
    const groupId = council?.id ?? (unit.kind === "region" ? "regions" : "other");
    let group = groups.get(groupId);
    if (!group) {
      group = { label: council ? unitNameWithType(council) : unit.kind === "region" ? "Regions" : "Other units", options: [] };
      groups.set(groupId, group);
    }
    group.options.push({ unit, indented: hasSacramentMeeting(unit.kind) && lineage.some(({ kind }) => kind === "stake") });
  }

  return <>
    {[...groups].map(([id, { label, options }]) => <optgroup key={id} label={label}>
      {options.map(({ unit, indented }) => <option key={unit.id} value={unit.id}>
        {`${indented ? "\u00a0\u00a0\u00a0" : ""}${unitNameWithType(unit)}`}
      </option>)}
    </optgroup>)}
  </>;
}

export function scheduledMessage(added: number) {
  return added ? `Added ${added} ${added === 1 ? "meeting" : "meetings"} to your calendar.`
    : "Those saved meetings are already on your calendar, or the unit has no saved meeting times.";
}

function ExistingUnitEvents({ day, scope, editingId }: { day: string; scope: Unit[]; editingId?: string }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof loadUnitDateEvents>> | null>(null);
  useEffect(() => {
    let active = true;
    void loadUnitDateEvents(scope.map(({ id }) => id), day).then(
      (data) => { if (active) setResult(data); },
      () => { if (active) setResult({ events: [], error: "Could not load existing events." }); },
    );
    return () => { active = false; };
  }, [day, scope]);

  if (!result) return <p className="field-help" role="status">Checking for existing events…</p>;
  const events = result.events.filter(({ id }) => id !== editingId);
  return <>
    {events.length > 0 && <section aria-label="Existing events on this date">
      <strong>Existing events on this date</strong>
      <ul className="management-list unit-event-list">
        {events.map(({ id, unitId, title, details }) => {
          const unit = scope.find((item) => item.id === unitId);
          return <li key={id}>
            <div><strong>{title}</strong><span>{unit && `${unitNameWithType(unit)} · `}{details}</span></div>
          </li>;
        })}
      </ul>
    </section>}
    {result.error && <p className="field-help" role="status">{result.error}</p>}
  </>;
}

export function VisitEditor({ entry, editable, building, parentUnit, eventScope, unitPicker, close, done }: {
  entry: VisitEditorEntry; editable: boolean; building?: Building; parentUnit?: Unit; eventScope?: Unit[];
  unitPicker?: { units: Map<string, Unit>; select: (unit: Unit | undefined) => void };
  close: () => void; done: (day: string, message: string, removed?: boolean) => void;
}) {
  const { event, unit } = entry;
  const isDrive = !unit && !unitPicker;
  const councilLabel = unit?.kind === "branch" ? "Branch Council" : "Ward Council";
  const automaticMeetings = [
    { label: "Sacrament meeting", time: unit?.sacrament_meeting_time },
    { label: councilLabel, time: unit?.council_meeting_time },
  ].filter(({ time }) => Boolean(time));
  const stake = unit?.kind === "stake" ? unit : parentUnit?.kind === "stake" ? parentUnit : undefined;
  const meetingTimes = [
    ...automaticMeetings,
    { label: "First meeting", time: unit?.first_meeting_time },
    { label: "T&FH Coordinating Council", time: unit?.tfh_coordinating_council_time },
    { label: stake && stake !== unit ? `${unitNameWithType(stake)} Council` : "Stake Council", time: stake?.stake_council_time },
  ].flatMap(({ label, time }) => time ? [{ label, time: timeToMinute(time) }] : [])
    .sort((a, b) => a.time - b.time);
  const [useMeetings, setUseMeetings] = useState(!event && automaticMeetings.length > 0);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [day, setDay] = useState(entry.day);
  const initialStart = event?.start_minute ?? entry.minute
    ?? timeToMinute(unit?.sacrament_meeting_time ?? unit?.council_meeting_time ?? "09:00");
  const initialEnd = event?.end_minute ?? initialStart + (isDrive ? 30 : 60);

  async function submit(eventSubmit: FormEvent<HTMLFormElement>) {
    eventSubmit.preventDefault();
    if (busy || !editable || (unitPicker && !unit)) return;
    const data = new FormData(eventSubmit.currentTarget);
    const notes = String(data.get("notes") ?? "").trim() || null;
    setBusy(true);
    setError("");
    try {
      if (useMeetings && unit) {
        const response = await scheduleVisit(unit.id, day, notes);
        if (response.error) setError(response.error);
        else done(day, scheduledMessage(response.added));
        return;
      }
      const response = await saveVisit({
        id: event?.id ?? null, unit_id: unit?.id ?? null, event_date: day,
        kind: isDrive ? "drive" : event?.kind ?? String(data.get("kind")) as VisitKind,
        title: isDrive ? String(data.get("title") ?? "").trim() || null : null,
        ...(notes || event?.notes ? { notes } : {}),
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
      else done(event.event_date, "Visit removed.", true);
    } catch {
      setError("Could not remove this visit.");
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={event ? visitLabels[event.kind] : isDrive ? "Add driving time" : "Schedule a visit"} close={() => { if (!busy) close(); }}>
    <form className="modal-body stack" onSubmit={submit}>
      {unitPicker ? <label>Unit
        <select value={unit?.id ?? ""} required disabled={busy} onChange={(e) => {
          const selected = unitPicker.units.get(e.target.value);
          unitPicker.select(selected);
          setUseMeetings(Boolean(selected?.sacrament_meeting_time || selected?.council_meeting_time));
        }}>
          <option value="">Select a unit</option>
          <VisitUnitOptions units={unitPicker.units} />
        </select>
      </label> : unit && <strong>{unit.name}</strong>}
      {building && <small><AddressLink address={formatBuildingAddress(building)} /></small>}
      {!editable && event && <p>Planned by {event.owner_email}</p>}
      {isDrive && <label>Trip label <span className="optional">optional</span>
        <input name="title" maxLength={150} defaultValue={event?.title ?? ""} disabled={!editable || busy} />
      </label>}
      <label>Date<input type="date" name="date" required value={day} disabled={!editable || busy}
        onChange={(event) => setDay(event.target.value)} /></label>
      {unit && eventScope && editable && day && <ExistingUnitEvents key={`${unit.id}:${day}`} day={day} scope={eventScope} editingId={event?.id} />}
      {meetingTimes.length > 0 && <section className="visit-meeting-times" aria-label="Saved meeting times">
        <strong>Saved meeting times</strong>
        <ul>
          {meetingTimes.map(({ label, time }) => <li key={label}>
            <span>{label}</span><time dateTime={minuteToTime(time)}>{formatVisitTime(time)}</time>
          </li>)}
        </ul>
      </section>}
      {!event && automaticMeetings.length > 0 && <label className="check">
        <input type="checkbox" checked={useMeetings} disabled={busy} onChange={(e) => setUseMeetings(e.target.checked)} />
        <span>Use saved times for {automaticMeetings.map(({ label }) => label).join(" and ")}
          <span className="optional"> ({automaticMeetings.length > 1 ? "1 hour each" : "1 hour"})</span>
        </span>
      </label>}
      {!useMeetings && (unit || isDrive) && <>
        {!event && !isDrive && <label>Event type<select name="kind" defaultValue="visit">
          {Object.entries(visitLabels).filter(([value]) => value !== "drive").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>}
        <div className="visit-time-fields" key={unit?.id}>
          <label>Start time<input type="time" name="start" required defaultValue={minuteToTime(initialStart)} disabled={!editable || busy} /></label>
          <label>End time<input type="time" name="end" required defaultValue={minuteToTime(initialEnd)} disabled={!editable || busy} /></label>
        </div>
        <label className="check" key={unit?.id && `${unit.id}-next-day`}><input type="checkbox" name="next_day" defaultChecked={initialEnd >= 1440} disabled={!editable || busy} />Ends the next day</label>
      </>}
      {!isDrive && (editable || event?.notes) && <label>Notes <span className="optional">optional</span>
        <textarea name="notes" rows={3} maxLength={4000} defaultValue={event?.notes ?? ""} readOnly={!editable} disabled={busy} />
      </label>}
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="form-actions">
        {event && editable && <button type="button" className="button text-danger push" disabled={busy}
          onClick={() => { if (confirmDelete) void remove(); else setConfirmDelete(true); }}>
          {confirmDelete ? "Confirm removal" : "Remove"}
        </button>}
        <button type="button" className="button" disabled={busy} onClick={close}>{editable ? "Cancel" : "Close"}</button>
        {editable && <button className="button primary" disabled={busy || Boolean(unitPicker && !unit)}>{busy ? "Saving…" : isDrive ? "Save driving block" : "Save visit"}</button>}
      </div>
    </form>
  </Modal>;
}
