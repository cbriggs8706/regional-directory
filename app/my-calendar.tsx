"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, MapPin } from "lucide-react";
import { unitLineage, unitPath, type Directory } from "../lib/directory";
import { offsetMonth, todayInVisitZone } from "../lib/visits";
import { AddMenu } from "./add-menu";
import { CalendarEventEditor } from "./calendar-event-editor";
import { calendarDays, MonthCalendar, placeCalendarEvent, placeCalendarVisit } from "./month-calendar";
import { SectionSkeleton } from "./pending-content";
import { deletePrivateCalendarEvent, loadPrivateCalendarEvents, savePrivateCalendarEvent } from "./shared-calendar-actions";
import { loadVisitEvents } from "./visit-actions";
import { VisitEditor, type VisitEditorEntry } from "./visit-editor";

type PrivateEvents = Awaited<ReturnType<typeof loadPrivateCalendarEvents>>;
type PrivateEvent = PrivateEvents["events"][number];
type Visits = Awaited<ReturnType<typeof loadVisitEvents>>;

export function MyCalendar({ directory, addHost }: { directory: Directory; addHost: HTMLElement | null }) {
  const today = todayInVisitZone();
  const currentMonth = offsetMonth(today, 0);
  const [month, setMonth] = useState(currentMonth);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; visits: Visits; privateEvents: PrivateEvents } | null>(null);
  const [visitEditor, setVisitEditor] = useState<VisitEditorEntry | null>(null);
  const [eventEditor, setEventEditor] = useState<{ event?: PrivateEvent } | null>(null);
  const [notice, setNotice] = useState("");
  const { until, days } = calendarDays(month);
  const key = `${month}:${revision}`;
  const loaded = result?.key === key ? result : null;
  const defaultDate = month === currentMonth ? today : month;
  const units = useMemo(() => new Map(directory.units.map((unit) => [unit.id, unit])), [directory.units]);
  const visitUnit = visitEditor?.unit;
  const eventScope = useMemo(() => visitUnit && unitLineage(visitUnit, units), [visitUnit, units]);
  const privateEvent = eventEditor?.event;

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadVisitEvents(month, until, false).catch(() => ({ events: [], error: "Could not load your visits." })),
      loadPrivateCalendarEvents(month).catch(() => ({ events: [], error: "Could not load your private events." })),
    ]).then(([visits, privateEvents]) => {
      if (active) setResult({ key, visits, privateEvents });
    });
    return () => { active = false; };
  }, [month, until, key]);

  for (const event of loaded?.privateEvents.events ?? []) {
    placeCalendarEvent(days, {
      id: `private-${event.id}`, kind: "standalone", title: event.title, open: () => setEventEditor({ event }),
    }, event.event_date, event.end_date ?? event.event_date);
  }
  for (const event of loaded?.visits.events ?? []) {
    const unit = units.get(event.unit_id ?? "");
    placeCalendarVisit(days, event, unit, { open: () => setVisitEditor({ unit, day: event.event_date, event }) });
  }

  const errors = [loaded?.visits.error, loaded?.privateEvents.error].filter(Boolean);
  const empty = [...days.values()].every((events) => events.length === 0);

  function refresh() {
    setRevision((value) => value + 1);
  }

  function saved(day: string, message: string) {
    setMonth(offsetMonth(day, 0));
    setNotice(message);
    refresh();
  }

  return <section aria-labelledby="my-calendar-heading">
    <div className="section-heading"><h1 id="my-calendar-heading">My Calendar</h1></div>
    <MonthCalendar month={month} today={today} setMonth={(value) => { setMonth(value); setNotice(""); }} byDay={days}>
      {notice && <p className="notice" role="status">{notice}</p>}
      {!loaded && <SectionSkeleton label="your calendar events" />}
      {errors.length > 0 && <p className="notice error" role="alert">
        {errors.join(" ")} <button type="button" className="text-button" onClick={refresh}>Retry</button>
      </p>}
      {loaded && errors.length === 0 && empty && <p className="shared-calendar-status muted">No events this month.</p>}
    </MonthCalendar>
    <AddMenu host={addHost} label="Add to my calendar" actions={[
      { label: "Add visit", Icon: MapPin, run: () => setVisitEditor({ day: defaultDate }) },
      { label: "Add event", Icon: CalendarPlus, run: () => setEventEditor({}) },
    ]} />
    {visitEditor && <VisitEditor entry={visitEditor} editable
      building={directory.buildings.find(({ id }) => id === visitUnit?.building_id)}
      parentUnit={units.get(visitUnit?.parent_id ?? "")} eventScope={eventScope}
      unitPicker={visitEditor.event ? undefined : {
        options: directory.units.map((unit) => ({ unit, label: unitPath(unit, units, "dropdown") }))
          .sort((a, b) => a.label.localeCompare(b.label)),
        select: (unit) => setVisitEditor({ ...visitEditor, unit }),
      }}
      close={() => setVisitEditor(null)}
      done={(day, message, removed) => {
        setVisitEditor(null);
        if (removed) {
          refresh();
          setNotice(message);
        } else saved(day, message);
      }} />}
    {eventEditor && <CalendarEventEditor
      title={privateEvent ? "Edit private event" : "Add private event"}
      defaultDate={defaultDate} event={privateEvent}
      saveEvent={(values) => savePrivateCalendarEvent(values, privateEvent?.id ?? null)}
      removeEvent={privateEvent && (() => deletePrivateCalendarEvent(privateEvent.id))}
      close={() => setEventEditor(null)}
      saved={(day) => {
        setEventEditor(null);
        saved(day, privateEvent ? "Private event updated." : "Private event added to your calendar.");
      }}
      removed={() => {
        setEventEditor(null);
        setNotice("Private event removed.");
        refresh();
      }} />}
  </section>;
}
