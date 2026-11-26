"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { unitLabels, unitNameWithType, type Directory } from "../lib/directory";
import type { DirectoryOrganization } from "../lib/organizations";
import { formatVisitTime, offsetDate, offsetMonth, todayInVisitZone, visitLabels, visitPeriod } from "../lib/visits";
import { AddMenu } from "./add-menu";
import { Modal } from "./editor";
import { SectionSkeleton } from "./pending-content";
import { RouteLink } from "./route-navigation";
import { addCalendarEvent, loadSharedCalendarEvents } from "./shared-calendar-actions";
import { loadVisitEvents } from "./visit-actions";

const monthLabel = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
const dayLabel = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" });
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type CalendarEvent = {
  id: string;
  kind: "conference" | "organization" | "standalone" | "visit";
  title: string;
  source?: string;
  href?: string;
  start?: number | null;
  end?: number | null;
};

type SharedEvents = Awaited<ReturnType<typeof loadSharedCalendarEvents>>;
type Visits = Awaited<ReturnType<typeof loadVisitEvents>>;

function CalendarEventEditor({ defaultDate, close, saved }: {
  defaultDate: string;
  close: () => void;
  saved: (date: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await addCalendarEvent({
        title: form.get("title"), event_date: form.get("event_date"), end_date: form.get("end_date") || null,
      });
      if (result.error !== null) setError(result.error);
      else saved(result.date);
    } catch {
      setError("Could not save this event. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return <Modal title="Add event" close={() => { if (!busy) close(); }}>
    <form className="modal-body stack" onSubmit={submit}>
      <label>Title<input name="title" maxLength={150} required /></label>
      <label>Start date
        <input name="event_date" type="date" min="0001-01-01" max="9999-12-31" defaultValue={defaultDate} required />
      </label>
      <label>End date <span className="optional">optional</span>
        <input name="end_date" type="date" min="0001-01-01" max="9999-12-31" />
      </label>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="button" disabled={busy} onClick={close}>Cancel</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  </Modal>;
}

export function SharedCalendar({ units, stakeConferences, organizations, addHost }: {
  units: Directory["units"];
  stakeConferences: Directory["stake_conferences"];
  organizations: DirectoryOrganization[];
  addHost: HTMLElement | null;
}) {
  const today = todayInVisitZone();
  const [month, setMonth] = useState(() => offsetMonth(today, 0));
  const [showVisits, setShowVisits] = useState(false);
  const [addingEvent, setAddingEvent] = useState(false);
  const [sharedResult, setSharedResult] = useState<{ month: string; data: SharedEvents } | null>(null);
  const [visitResult, setVisitResult] = useState<{ month: string; data: Visits } | null>(null);
  const [sharedRetry, setSharedRetry] = useState(0);
  const [visitRetry, setVisitRetry] = useState(0);
  const { until, days } = visitPeriod(month, "month", true);
  const shared = sharedResult?.month === month ? sharedResult.data : null;
  const visits = showVisits && visitResult?.month === month ? visitResult.data : null;

  useEffect(() => {
    let active = true;
    loadSharedCalendarEvents(month).then((data) => {
      if (active) setSharedResult({ month, data });
    }).catch(() => {
      if (active) setSharedResult({ month, data: {
        wardConferences: [], organizationEvents: [], calendarEvents: [], errors: ["Could not load calendar events."],
      } });
    });
    return () => { active = false; };
  }, [month, sharedRetry]);

  useEffect(() => {
    if (!showVisits) return;
    let active = true;
    loadVisitEvents(month, until, false).then((data) => {
      if (active) setVisitResult({ month, data });
    }).catch(() => {
      if (active) setVisitResult({ month, data: { events: [], error: "Could not load your visits." } });
    });
    return () => { active = false; };
  }, [month, until, showVisits, visitRetry]);

  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const organizationsById = new Map(organizations.map((organization) => [organization.id, organization]));
  const byDay = new Map(days.map((day) => [day, [] as CalendarEvent[]]));

  function placeAllDayEvent(event: CalendarEvent, startDate: string, endDate: string) {
    for (let day = startDate < month ? month : startDate; day < until && day <= endDate; day = offsetDate(day, 1)) {
      byDay.get(day)?.push(event);
    }
  }

  const conferences = [
    ...stakeConferences.map((row) => ({ ...row, unitId: row.stake_id })),
    ...(shared?.wardConferences ?? []).map((row) => ({ ...row, unitId: row.unit_id })),
  ];
  for (const { id, unitId, begins_on, ends_on } of conferences) {
    const unit = unitsById.get(unitId);
    if (!unit || begins_on >= until || ends_on < month) continue;
    const event: CalendarEvent = {
      id: `conference-${id}`, kind: "conference", title: `${unitLabels[unit.kind]} Conference`,
      source: unitNameWithType(unit), href: `/units/${unitId}?section=overview`,
    };
    placeAllDayEvent(event, begins_on, ends_on);
  }

  for (const { id, organization_id, title, event_date, end_date } of shared?.organizationEvents ?? []) {
    const event: CalendarEvent = {
      id: `organization-${id}`, kind: "organization", title,
      source: organizationsById.get(organization_id)?.name ?? "Organization",
      href: `/organizations/${organization_id}`,
    };
    placeAllDayEvent(event, event_date, end_date ?? event_date);
  }

  for (const { id, title, event_date, end_date } of shared?.calendarEvents ?? []) {
    placeAllDayEvent({ id: `standalone-${id}`, kind: "standalone", title }, event_date, end_date ?? event_date);
  }

  for (const visit of visits?.events ?? []) {
    const unit = unitsById.get(visit.unit_id ?? "");
    const event: CalendarEvent = {
      id: `visit-${visit.id}`, kind: "visit", title: visit.title || visitLabels[visit.kind],
      source: unit ? unitNameWithType(unit) : undefined, href: "/?tab=visits",
      start: visit.start_minute, end: Math.min(1440, visit.end_minute),
    };
    byDay.get(visit.event_date)?.push(event);
    if (visit.end_minute > 1440) {
      byDay.get(offsetDate(visit.event_date, 1))?.push({ ...event, start: 0, end: visit.end_minute - 1440 });
    }
  }

  const firstWeekday = new Date(month).getUTCDay();
  const count = [...byDay.values()].reduce((sum, events) => sum + events.length, 0);

  return <section aria-labelledby="calendar-heading">
    <div className="section-heading shared-calendar-heading">
      <h1 id="calendar-heading">Calendar</h1>
      <label className="check"><input type="checkbox" checked={showVisits} onChange={(event) => {
        setVisitResult(null);
        setShowVisits(event.target.checked);
      }} />Show my visits</label>
    </div>
    <div className="panel shared-calendar">
      <div className="shared-calendar-toolbar">
        <div>
          <h2 aria-live="polite">{monthLabel.format(new Date(month))}</h2>
          <p className="field-help">Mountain Time</p>
        </div>
        <div className="toolbar">
          <button type="button" className="icon-button" aria-label="Previous month"
            onClick={() => setMonth((value) => offsetMonth(value, -1))}><ChevronLeft size={19} aria-hidden /></button>
          <button type="button" className="button" onClick={() => setMonth(offsetMonth(today, 0))}>Today</button>
          <button type="button" className="icon-button" aria-label="Next month"
            onClick={() => setMonth((value) => offsetMonth(value, 1))}><ChevronRight size={19} aria-hidden /></button>
        </div>
      </div>
      {!shared && <SectionSkeleton label="calendar events" />}
      {Boolean(shared?.errors.length) && <p className="notice error" role="alert">
        {shared?.errors.join(" ")} <button type="button" className="text-button" onClick={() => {
          setSharedResult(null);
          setSharedRetry((value) => value + 1);
        }}>Retry</button>
      </p>}
      {showVisits && !visits && <p className="shared-calendar-status field-help" role="status">Loading your visits…</p>}
      {visits?.error && <p className="notice error" role="alert">
        {visits.error} <button type="button" className="text-button" onClick={() => {
          setVisitResult(null);
          setVisitRetry((value) => value + 1);
        }}>Retry visits</button>
      </p>}
      {shared && !shared.errors.length && (!showVisits || (visits && !visits.error)) && count === 0 &&
        <p className="shared-calendar-status muted">No events this month.</p>}
      <div className="shared-calendar-grid" data-empty={count === 0}>
        {weekdays.map((day) => <span className="shared-calendar-weekday" key={day}>{day.slice(0, 3)}</span>)}
        {Array.from({ length: firstWeekday }, (_, index) => <div className="shared-calendar-blank" key={index} aria-hidden />)}
        {days.map((day) => {
          const events = byDay.get(day) ?? [];
          events.sort((a, b) => (a.start ?? -1) - (b.start ?? -1) || a.title.localeCompare(b.title));
          return <div className="shared-calendar-day" key={day} data-empty={events.length === 0} data-today={day === today}>
            <time dateTime={day} aria-current={day === today ? "date" : undefined}>
              <span aria-hidden="true">{Number(day.slice(-2))}</span>
              <span>{dayLabel.format(new Date(day))}</span>
            </time>
            {events.length > 0 && <ul>
              {events.map(({ id, kind, title, source, href, start, end }) => {
                const content = <>
                  <strong>{title}</strong>
                  {source && <span>{source}</span>}
                  {start != null && <span>{formatVisitTime(start)}{end != null && ` – ${formatVisitTime(end)}`}</span>}
                </>;
                return <li key={id}>{href
                  ? <RouteLink className="shared-calendar-event" data-kind={kind} href={href} prefetch={false}>{content}</RouteLink>
                  : <div className="shared-calendar-event" data-kind={kind}>{content}</div>}
                </li>;
              })}
            </ul>}
          </div>;
        })}
      </div>
    </div>
    <AddMenu host={addHost} label="Add to calendar" actions={[
      { label: "Add event", Icon: CalendarPlus, run: () => setAddingEvent(true) },
    ]} />
    {addingEvent && <CalendarEventEditor defaultDate={month === offsetMonth(today, 0) ? today : month}
      close={() => setAddingEvent(false)} saved={(date) => {
        setAddingEvent(false);
        setMonth(offsetMonth(date, 0));
        setSharedResult(null);
        setSharedRetry((value) => value + 1);
      }} />}
  </section>;
}
