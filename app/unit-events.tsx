import { CalendarDays, Clock3, Pencil } from "lucide-react";
import { unitLabels, type Conference, type Unit } from "../lib/directory";
import { formatVisitTime, offsetDate, visitLabels, type UnitVisitData, type VisitEvent } from "../lib/visits";
import type { EditorState } from "./editor";

type UnitEvent =
  | { type: "conference"; unit: Unit; conference: Conference; canEdit: boolean }
  | { type: "visit"; visit: VisitEvent };

const dates = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function eventDay(event: UnitEvent) {
  return event.type === "visit" ? event.visit.event_date : event.conference.begins_on;
}

function visitEnded(visit: VisitEvent, today: string, minute: number) {
  const endDate = offsetDate(visit.event_date, Math.floor(visit.end_minute / 1440));
  return endDate < today || (endDate === today && visit.end_minute % 1440 <= minute);
}

export function UnitEvents({ unit, stake, conferences, wardConferences, visits, userId, edit, openVisit }: {
  unit: Unit;
  stake?: Unit;
  conferences: Conference[];
  wardConferences: Conference[] | null;
  visits: UnitVisitData;
  userId: string;
  edit: (state: EditorState) => void;
  openVisit: (visit: VisitEvent) => void;
}) {
  const events: UnitEvent[] = [
    ...(stake ? conferences.map((conference): UnitEvent => ({
      type: "conference", unit: stake, conference, canEdit: unit.id === stake.id,
    })) : []),
    ...(wardConferences ?? []).map((conference): UnitEvent => ({ type: "conference", unit, conference, canEdit: true })),
    ...visits.events.map((visit): UnitEvent => ({ type: "visit", visit })),
  ];
  events.sort((a, b) => eventDay(a).localeCompare(eventDay(b)) ||
    (a.type === "visit" ? a.visit.start_minute : -1) - (b.type === "visit" ? b.visit.start_minute : -1));
  const upcoming = [];
  const past = [];
  let lastVisit: VisitEvent | undefined;
  for (const event of events) {
    const ended = event.type === "visit" ? visitEnded(event.visit, visits.today, visits.minute)
      : event.conference.ends_on < visits.today;
    if (ended) {
      past.push(event);
      if (event.type === "visit") lastVisit = event.visit;
    } else {
      upcoming.push(event);
    }
  }

  function eventRow(event: UnitEvent) {
    if (event.type === "visit") {
      const { visit } = event;
      const day = dates.format(new Date(visit.event_date));
      const time = `${formatVisitTime(visit.start_minute)} – ${formatVisitTime(visit.end_minute)}`;
      const nextDay = visit.end_minute >= 1440 ? " next day" : "";
      return <li key={`visit-${visit.id}`}>
        <Clock3 size={18} aria-hidden />
        <div>
          <strong>Scheduled Visit</strong>
          <span>{day} · {time}{nextDay}</span>
          <small>{visit.kind === "visit" ? "" : `${visitLabels[visit.kind]} · `}{visit.owner_email}</small>
        </div>
        <button type="button" className="button" onClick={() => openVisit(visit)}
          aria-label={`${visit.owner_id === userId ? "Edit" : "View"} scheduled visit on ${day} at ${formatVisitTime(visit.start_minute)}`}>
          {visit.owner_id === userId ? "Edit" : "View"}
        </button>
      </li>;
    }

    const { conference, unit: conferenceUnit, canEdit } = event;
    const label = `${unitLabels[conferenceUnit.kind]} Conference`;
    const dateRange = dates.formatRange(new Date(conference.begins_on), new Date(conference.ends_on));
    return <li key={`conference-${conference.id}`}>
      <CalendarDays size={18} aria-hidden />
      <div><strong>{label}</strong><span>{dateRange}</span></div>
      {canEdit && <button type="button" className="icon-button" aria-label={`Edit ${label.toLowerCase()} on ${dateRange}`}
        onClick={() => edit({
          resource: conferenceUnit.kind === "stake" ? "stake_conferences" : "ward_conferences",
          unit: conferenceUnit, row: conference,
        })}><Pencil size={16} aria-hidden /></button>}
    </li>;
  }

  const daysSince = lastVisit ? (Date.parse(visits.today) - Date.parse(lastVisit.event_date)) / 86_400_000 : 0;
  return <section className="panel unit-events" id="unit-events" aria-labelledby="unit-events-heading">
    <h2 id="unit-events-heading">Events</h2>
    <p className="unit-last-visit"><strong>Last Visited</strong>
      {lastVisit ? <span><time dateTime={lastVisit.event_date}>{dates.format(new Date(lastVisit.event_date))}</time>
        {" · "}{daysSince} {daysSince === 1 ? "day" : "days"} ago</span>
        : <span className="muted">{visits.loadError ? "Unavailable" : "No past visits on the calendar."}</span>}
    </p>
    {visits.loadError && <p className="notice error" role="alert">{visits.loadError}</p>}
    {wardConferences === null && <p className="field-help">Ward and branch conferences are unavailable.</p>}
    {upcoming.length ? <ul className="management-list unit-event-list">{upcoming.map(eventRow)}</ul>
      : !visits.loadError && <p className="muted">No upcoming events.</p>}
    {past.length > 0 && <details className="unit-event-history">
      <summary>Past events</summary>
      <ul className="management-list unit-event-list">{past.reverse().map(eventRow)}</ul>
    </details>}
  </section>;
}
