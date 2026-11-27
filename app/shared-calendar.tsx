"use client";

import { useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { unitLabels, unitNameWithType, type Directory } from "../lib/directory";
import type { DirectoryOrganization } from "../lib/organizations";
import { offsetMonth, todayInVisitZone } from "../lib/visits";
import { AddMenu } from "./add-menu";
import { CalendarEventEditor } from "./calendar-event-editor";
import { SectionSkeleton } from "./pending-content";
import { calendarDays, MonthCalendar, placeCalendarEvent, placeCalendarVisit } from "./month-calendar";
import { addCalendarEvent, loadSharedCalendarEvents } from "./shared-calendar-actions";
import { loadVisitEvents } from "./visit-actions";

type SharedEvents = Awaited<ReturnType<typeof loadSharedCalendarEvents>>;
type Visits = Awaited<ReturnType<typeof loadVisitEvents>>;

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
  const { until, days: byDay } = calendarDays(month);
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
  const conferences = [
    ...stakeConferences.map((row) => ({ ...row, unitId: row.stake_id })),
    ...(shared?.wardConferences ?? []).map((row) => ({ ...row, unitId: row.unit_id })),
  ];
  for (const { id, unitId, begins_on, ends_on } of conferences) {
    const unit = unitsById.get(unitId);
    if (!unit || begins_on >= until || ends_on < month) continue;
    placeCalendarEvent(byDay, {
      id: `conference-${id}`, kind: "conference", title: `${unitLabels[unit.kind]} Conference`,
      source: unitNameWithType(unit), href: `/units/${unitId}?section=overview`,
    }, begins_on, ends_on);
  }

  for (const { id, organization_id, title, event_date, end_date } of shared?.organizationEvents ?? []) {
    placeCalendarEvent(byDay, {
      id: `organization-${id}`, kind: "organization", title,
      source: organizationsById.get(organization_id)?.name ?? "Organization",
      href: `/organizations/${organization_id}`,
    }, event_date, end_date ?? event_date);
  }

  for (const { id, title, event_date, end_date } of shared?.calendarEvents ?? []) {
    placeCalendarEvent(byDay, { id: `standalone-${id}`, kind: "standalone", title }, event_date, end_date ?? event_date);
  }

  for (const visit of visits?.events ?? []) {
    placeCalendarVisit(byDay, visit, unitsById.get(visit.unit_id ?? ""), { href: "/?tab=visits" });
  }

  const empty = [...byDay.values()].every((events) => events.length === 0);

  return <section aria-labelledby="calendar-heading">
    <div className="section-heading shared-calendar-heading">
      <h1 id="calendar-heading">Calendar</h1>
      <label className="check"><input type="checkbox" checked={showVisits} onChange={(event) => {
        setVisitResult(null);
        setShowVisits(event.target.checked);
      }} />Show my visits</label>
    </div>
    <MonthCalendar month={month} today={today} setMonth={setMonth} byDay={byDay}>
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
      {shared && !shared.errors.length && (!showVisits || (visits && !visits.error)) && empty &&
        <p className="shared-calendar-status muted">No events this month.</p>}
    </MonthCalendar>
    <AddMenu host={addHost} label="Add to calendar" actions={[
      { label: "Add event", Icon: CalendarPlus, run: () => setAddingEvent(true) },
    ]} />
    {addingEvent && <CalendarEventEditor title="Add event" saveEvent={addCalendarEvent} defaultDate={month === offsetMonth(today, 0) ? today : month}
      close={() => setAddingEvent(false)} saved={(date) => {
        setAddingEvent(false);
        setMonth(offsetMonth(date, 0));
        setSharedResult(null);
        setSharedRetry((value) => value + 1);
      }} />}
  </section>;
}
