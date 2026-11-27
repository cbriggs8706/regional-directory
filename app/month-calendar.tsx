"use client";

import type { CSSProperties, ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { unitNameWithType, type Unit } from "../lib/directory";
import { formatVisitTime, offsetDate, offsetMonth, visitLabels, type VisitEvent } from "../lib/visits";
import { RouteLink } from "./route-navigation";

const monthLabel = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
const dayLabel = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" });
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type CalendarEvent = {
  id: string;
  title: string;
  source?: string;
  owner?: string;
  color?: string;
  href?: string;
  open?: () => void;
  start?: number | null;
  end?: number | null;
};

export function calendarDays(month: string) {
  const until = offsetMonth(month, 1);
  const days = new Map<string, CalendarEvent[]>();
  for (let day = month; day < until; day = offsetDate(day, 1)) days.set(day, []);
  return { until, days };
}

export function placeCalendarEvent(days: Map<string, CalendarEvent[]>, event: CalendarEvent, start: string, end: string) {
  for (const [day, events] of days) {
    if (start <= day && day <= end) events.push(event);
  }
}

export function placeCalendarVisit(days: Map<string, CalendarEvent[]>, visit: VisitEvent, unit: Unit | undefined,
  action: Pick<CalendarEvent, "color" | "owner" | "open">) {
  const event: CalendarEvent = {
    id: `visit-${visit.id}`, title: visit.title || visitLabels[visit.kind],
    source: unit ? unitNameWithType(unit) : undefined, ...action,
    start: visit.start_minute, end: Math.min(1440, visit.end_minute),
  };
  days.get(visit.event_date)?.push(event);
  if (visit.end_minute > 1440) {
    days.get(offsetDate(visit.event_date, 1))?.push({ ...event, start: 0, end: visit.end_minute - 1440 });
  }
}

export function MonthCalendar({ month, today, setMonth, byDay, children }: {
  month: string; today: string; setMonth: (month: string) => void;
  byDay: Map<string, CalendarEvent[]>; children: ReactNode;
}) {
  const firstWeekday = new Date(month).getUTCDay();
  const empty = [...byDay.values()].every((events) => events.length === 0);
  return <div className="panel shared-calendar">
      <div className="shared-calendar-toolbar">
        <div>
          <h2 aria-live="polite">{monthLabel.format(new Date(month))}</h2>
          <p className="field-help">Mountain Time</p>
        </div>
        <div className="toolbar">
          <button type="button" className="icon-button" aria-label="Previous month"
            onClick={() => setMonth(offsetMonth(month, -1))}><ChevronLeft size={19} aria-hidden /></button>
          <button type="button" className="button" onClick={() => setMonth(offsetMonth(today, 0))}>Today</button>
          <button type="button" className="icon-button" aria-label="Next month"
            onClick={() => setMonth(offsetMonth(month, 1))}><ChevronRight size={19} aria-hidden /></button>
        </div>
      </div>
      {children}
      <div className="shared-calendar-grid" data-empty={empty}>
        {weekdays.map((day) => <span className="shared-calendar-weekday" key={day}>{day.slice(0, 3)}</span>)}
        {Array.from({ length: firstWeekday }, (_, index) => <div className="shared-calendar-blank" key={index} aria-hidden />)}
        {[...byDay].map(([day, events]) => {
          const sortedEvents = events.toSorted((a, b) => (a.start ?? -1) - (b.start ?? -1) || a.title.localeCompare(b.title));
          return <div className="shared-calendar-day" key={day} data-empty={events.length === 0} data-today={day === today}>
            <time dateTime={day} aria-current={day === today ? "date" : undefined}>
              <span aria-hidden="true">{Number(day.slice(-2))}</span>
              <span>{dayLabel.format(new Date(day))}</span>
            </time>
            {events.length > 0 && <ul>
              {sortedEvents.map(({ id, title, source, owner, color, href, open, start, end }) => {
                const style = color ? { "--calendar-color": color } as CSSProperties : undefined;
                const content = <>
                  <strong>{title}</strong>
                  {source && <span>{source}</span>}
                  {start != null && <span>{formatVisitTime(start)}{end != null && ` – ${formatVisitTime(end)}`}</span>}
                  {owner && <span>{owner}</span>}
                </>;
                return <li key={id}>{href
                  ? <RouteLink className="shared-calendar-event" style={style} href={href} prefetch={false}>{content}</RouteLink>
                  : open ? <button type="button" className="shared-calendar-event" style={style} onClick={open}>{content}</button>
                    : <div className="shared-calendar-event" style={style}>{content}</div>}
                </li>;
              })}
            </ul>}
          </div>;
        })}
      </div>
    </div>;
}
