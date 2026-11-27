"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Globe, MapPin } from "lucide-react";
import { normalizeEmail, unitLabels, unitLineage, unitNameWithType, type Directory } from "../lib/directory";
import type { DirectoryOrganization } from "../lib/organizations";
import { offsetMonth, todayInVisitZone } from "../lib/visits";
import { AddMenu } from "./add-menu";
import { CalendarEventEditor } from "./calendar-event-editor";
import { calendarDays, MonthCalendar, placeCalendarEvent, placeCalendarVisit } from "./month-calendar";
import { SectionSkeleton } from "./pending-content";
import { addCalendarEvent, deletePrivateCalendarEvent, loadCalendarEvents, savePrivateCalendarEvent } from "./shared-calendar-actions";
import { VisitEditor, type VisitEditorEntry } from "./visit-editor";

type CalendarData = Awaited<ReturnType<typeof loadCalendarEvents>>;
type PersonalEvent = CalendarData["personalEvents"][number];
type CalendarEditor =
  | { kind: "global" }
  | { kind: "personal"; event?: PersonalEvent }
  | { kind: "visit"; entry: VisitEditorEntry };

const myColor = "#2054a8";
const sharedCalendarColors = ["#7133a5", "#955800", "#a52a60", "#48566a", "#b23525", "#006779"];

export function DirectoryCalendar({ directory, organizations, userId, email, admin, preview, addHost }: {
  directory: Directory;
  organizations: DirectoryOrganization[];
  userId: string;
  email: string;
  admin: boolean;
  preview: boolean;
  addHost: HTMLElement | null;
}) {
  const today = todayInVisitZone();
  const currentMonth = offsetMonth(today, 0);
  const [month, setMonth] = useState(currentMonth);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: CalendarData | null } | null>(null);
  const [editor, setEditor] = useState<CalendarEditor | null>(null);
  const [notice, setNotice] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(() => new Set());
  const key = `${month}:${revision}`;
  const loaded = result?.key === key ? result : null;
  const data = loaded?.data;
  const defaultDate = month === currentMonth ? today : month;
  const myEmail = normalizeEmail(email);
  const sharedColors = new Map((result?.data?.visitAccounts ?? []).map((owner, index) => [
    owner, sharedCalendarColors[index] ?? `hsl(${(index * 137.508) % 360} 74% 30%)`,
  ]));
  const units = useMemo(() => new Map(directory.units.map((unit) => [unit.id, unit])), [directory.units]);
  const visitUnit = editor?.kind === "visit" ? editor.entry.unit : undefined;
  const eventScope = useMemo(() => visitUnit && unitLineage(visitUnit, units), [visitUnit, units]);
  const privateEvent = editor?.kind === "personal" ? editor.event : undefined;

  useEffect(() => {
    let active = true;
    void loadCalendarEvents(month).then(
      (data) => { if (active) setResult({ key, data }); },
      () => { if (active) setResult({ key, data: null }); },
    );
    return () => { active = false; };
  }, [month, key]);

  const { until, days } = calendarDays(month);
  const organizationsById = new Map(organizations.map((organization) => [organization.id, organization]));
  const conferences = [
    ...directory.stake_conferences.map((row) => ({ ...row, unitId: row.stake_id })),
    ...(data?.wardConferences ?? []).map((row) => ({ ...row, unitId: row.unit_id })),
  ];
  for (const { id, unitId, begins_on, ends_on } of conferences) {
    const unit = units.get(unitId);
    if (!unit || begins_on >= until || ends_on < month) continue;
    placeCalendarEvent(days, {
      id: `conference-${id}`, title: `${unitLabels[unit.kind]} Conference`,
      source: unitNameWithType(unit), href: `/units/${unitId}?section=overview`,
    }, begins_on, ends_on);
  }

  for (const { id, organization_id, title, event_date, end_date } of data?.organizationEvents ?? []) {
    placeCalendarEvent(days, {
      id: `organization-${id}`, title,
      source: organizationsById.get(organization_id)?.name ?? "Organization",
      href: `/organizations/${organization_id}`,
    }, event_date, end_date ?? event_date);
  }

  for (const { id, title, event_date, end_date } of data?.globalEvents ?? []) {
    placeCalendarEvent(days, { id: `global-${id}`, title }, event_date, end_date ?? event_date);
  }

  for (const event of data?.personalEvents ?? []) {
    placeCalendarEvent(days, {
      id: `personal-${event.id}`, title: event.title, color: myColor,
      open: () => setEditor({ kind: "personal", event }),
    }, event.event_date, event.end_date ?? event.event_date);
  }

  for (const event of data?.sharedPersonalEvents ?? []) {
    const color = sharedColors.get(event.owner_email);
    if (!color || !selectedUsers.has(event.owner_email)) continue;
    placeCalendarEvent(days, {
      id: `personal-${event.id}`, title: event.title, color, owner: event.owner_email,
    }, event.event_date, event.end_date ?? event.event_date);
  }

  for (const event of data?.visits ?? []) {
    const visitOwner = normalizeEmail(event.owner_email);
    const mine = preview ? visitOwner === myEmail : event.owner_id === userId;
    const color = mine ? myColor : sharedColors.get(visitOwner);
    if (!color || (!mine && !selectedUsers.has(visitOwner))) continue;
    const unit = units.get(event.unit_id ?? "");
    placeCalendarVisit(days, event, unit, {
      color,
      owner: mine ? undefined : visitOwner,
      open: () => setEditor({ kind: "visit", entry: { unit, day: event.event_date, event } }),
    });
  }

  const errors = data?.errors ?? (loaded ? ["Could not load calendar events."] : []);
  const empty = [...days.values()].every((events) => events.length === 0);

  function refresh() {
    setRevision((value) => value + 1);
  }

  function saved(day: string, message: string) {
    setEditor(null);
    setMonth(offsetMonth(day, 0));
    setNotice(message);
    refresh();
  }

  function removed(message: string) {
    setEditor(null);
    setNotice(message);
    refresh();
  }

  return <section aria-labelledby="calendar-heading">
    <div className="section-heading"><h1 id="calendar-heading">Calendar</h1></div>
    <MonthCalendar month={month} today={today} setMonth={(value) => { setMonth(value); setNotice(""); }} byDay={days}>
      <fieldset className="calendar-filters" aria-label="Calendars to show">
        <span className="calendar-filter-label"><span className="calendar-color" aria-hidden />Global</span>
        <span className="calendar-filter-label"><span className="calendar-color" style={{ backgroundColor: myColor }} aria-hidden />{preview ? "My visits" : "My events"}</span>
        {[...sharedColors].map(([owner, color]) => <label className="check" key={owner}>
          <input type="checkbox" checked={selectedUsers.has(owner)} onChange={(event) => {
            const checked = event.target.checked;
            setSelectedUsers((current) => {
              const next = new Set(current);
              if (checked) next.add(owner);
              else next.delete(owner);
              return next;
            });
          }} />
          <span className="calendar-color" style={{ backgroundColor: color }} aria-hidden />
          <span>{owner}</span>
        </label>)}
      </fieldset>
      {notice && <p className="notice" role="status">{notice}</p>}
      {!loaded && <SectionSkeleton label="calendar events" />}
      {errors.length > 0 && <p className="notice error" role="alert">
        {errors.join(" ")} <button type="button" className="text-button" onClick={refresh}>Retry</button>
      </p>}
      {loaded && errors.length === 0 && empty && <p className="shared-calendar-status muted">No events to show this month.</p>}
    </MonthCalendar>
    <AddMenu host={preview ? null : addHost} label="Add to calendar" actions={[
      { label: "Add Global Event", Icon: Globe, run: () => setEditor({ kind: "global" }) },
      { label: "Add Personal Event", Icon: CalendarPlus, run: () => setEditor({ kind: "personal" }) },
      { label: "Schedule a Visit", Icon: MapPin, run: () => setEditor({ kind: "visit", entry: { day: defaultDate } }) },
    ]} />
    {editor?.kind === "visit" && <VisitEditor entry={editor.entry}
      editable={!preview && (!editor.entry.event || editor.entry.event.owner_id === userId)}
      building={directory.buildings.find(({ id }) => id === visitUnit?.building_id)}
      parentUnit={units.get(visitUnit?.parent_id ?? "")} eventScope={eventScope}
      unitPicker={editor.entry.event ? undefined : {
        units: admin ? units : new Map([...units].filter(([, unit]) => unit.kind !== "region")),
        select: (unit) => setEditor({ kind: "visit", entry: { ...editor.entry, unit } }),
      }}
      close={() => setEditor(null)}
      done={(day, message, wasRemoved) => {
        if (wasRemoved) removed(message);
        else saved(day, message);
      }} />}
    {editor?.kind === "global" && <CalendarEventEditor title="Add Global Event" defaultDate={defaultDate}
      saveEvent={addCalendarEvent} close={() => setEditor(null)} saved={(day) => saved(day, "Global event added.")} />}
    {editor?.kind === "personal" && <CalendarEventEditor title={privateEvent ? "Edit Personal Event" : "Add Personal Event"}
      description="People with access to your calendar can see this event."
      defaultDate={defaultDate} event={privateEvent}
      saveEvent={(values) => savePrivateCalendarEvent(values, privateEvent?.id ?? null)}
      removeEvent={privateEvent && (() => deletePrivateCalendarEvent(privateEvent.id))}
      close={() => setEditor(null)}
      saved={(day) => saved(day, privateEvent ? "Personal event updated." : "Personal event added.")}
      removed={() => removed("Personal event removed.")} />}
  </section>;
}
