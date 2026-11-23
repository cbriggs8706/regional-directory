"use client";

import { useEffect, useRef, useState, type DragEvent, type PointerEvent } from "react";
import { Plus } from "lucide-react";
import type { Unit } from "../lib/directory";
import { formatVisitTime, offsetDate, todayInVisitZone, visitLabels, type VisitEvent } from "../lib/visits";

const dayName = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const hourPixels = 76;
const laneHeight = 46;
const hours = Array.from({ length: 24 }, (_, hour) => hour);
const toPixels = (minutes: number) => minutes / 60 * hourPixels;

type Segment = { event: VisitEvent; start: number; end: number; offset: number };
type Positioned = Segment & { lane: number };

function arrangeDay(segments: Segment[]) {
  const laneEnds: number[] = [];
  return [...segments].sort((a, b) => a.start - b.start || a.end - b.end).map((segment): Positioned => {
    const free = laneEnds.findIndex((end) => end <= segment.start);
    const lane = free === -1 ? laneEnds.length : free;
    laneEnds[lane] = segment.end;
    return { ...segment, lane };
  });
}

type Resize = {
  event: VisitEvent;
  pointer: number;
  x: number;
  scroll: number;
  edge: "start" | "end";
  offset: number;
};
type Preview = { id: string; start_minute: number; end_minute: number };

export function VisitCalendar({ days, events, units, userId, draggedUnit, dropUnit, addDrive, resize, openEvent }: {
  days: string[];
  events: VisitEvent[];
  units: Map<string, Unit>;
  userId: string;
  draggedUnit: string;
  dropUnit: (id: string, day: string) => void;
  addDrive: (day: string, minute: number) => void;
  resize: (event: VisitEvent, start: number, end: number) => Promise<void>;
  openEvent: (event: VisitEvent) => void;
}) {
  const today = todayInVisitZone();
  const [dropDay, setDropDay] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);
  const drag = useRef<Resize | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const byDay = new Map<string, Segment[]>();
  const shown = new Set(days);

  useEffect(() => { if (scroll.current) scroll.current.scrollLeft = toPixels(6 * 60); }, []);

  for (const original of events) {
    const event = preview?.id === original.id ? { ...original, ...preview } : original;
    const segments = [
      { date: event.event_date, start: event.start_minute, end: Math.min(1440, event.end_minute), offset: 0 },
      { date: offsetDate(event.event_date, 1), start: 0, end: event.end_minute - 1440, offset: 1440 },
    ];
    for (const { date, start, end, offset } of segments) {
      if (!shown.has(date) || end <= start) continue;
      const day = byDay.get(date) ?? [];
      day.push({ event, start, end, offset });
      byDay.set(date, day);
    }
  }

  function dragOver(event: DragEvent, day: string) {
    if (!draggedUnit) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropDay(day);
  }

  function drop(event: DragEvent, day: string) {
    if (!draggedUnit) return;
    event.preventDefault();
    setDropDay("");
    dropUnit(draggedUnit, day);
  }

  function beginResize(event: PointerEvent<HTMLButtonElement>, segment: Segment, edge: Resize["edge"]) {
    if (saving || drag.current || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { event: segment.event, pointer: event.pointerId, x: event.clientX,
      scroll: scroll.current?.scrollLeft ?? 0, edge, offset: segment.offset };
    setPreview({ id: segment.event.id, start_minute: segment.event.start_minute, end_minute: segment.event.end_minute });
  }

  function resized(event: PointerEvent<HTMLButtonElement>, active: Resize) {
    const pixels = event.clientX - active.x + (scroll.current?.scrollLeft ?? 0) - active.scroll;
    const delta = Math.round(pixels * 60 / hourPixels / 5) * 5;
    const { start_minute: start, end_minute: end } = active.event;
    if (!delta) return { start_minute: start, end_minute: end };
    if (active.edge === "start") {
      return { start_minute: Math.max(0, end - 1440, Math.min(1439, end - 5, start + delta)), end_minute: end };
    }
    const earliestEnd = Math.min(start + 1440, Math.max(active.offset + 1, start + 5));
    return { start_minute: start, end_minute: Math.max(earliestEnd, Math.min(start + 1440, end + delta)) };
  }

  function moveResize(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (active?.pointer === event.pointerId) setPreview({ id: active.event.id, ...resized(event, active) });
  }

  function cancelResize(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = null;
    setPreview(null);
  }

  async function finishResize(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (active?.pointer !== event.pointerId) return;
    drag.current = null;
    const { start_minute: start, end_minute: end } = resized(event, active);
    if (start === active.event.start_minute && end === active.event.end_minute) {
      setPreview(null);
      return;
    }
    setSaving(true);
    setPreview({ id: active.event.id, start_minute: start, end_minute: end });
    try {
      await resize(active.event, start, end);
    } finally {
      setPreview(null);
      setSaving(false);
    }
  }

  function resizeHandle(segment: Segment, edge: Resize["edge"]) {
    return <button type="button" className={`visit-resize visit-resize-${edge}`} tabIndex={-1}
      aria-label={`Drag to change the ${edge} time`} disabled={saving}
      onPointerDown={(event) => beginResize(event, segment, edge)}
      onPointerMove={moveResize} onPointerUp={finishResize} onPointerCancel={cancelResize} onLostPointerCapture={cancelResize} />;
  }

  return <div className="visit-calendar-scroll" ref={scroll}>
    <div className="visit-grid" style={{ "--visit-hour": `${hourPixels}px`, "--visit-track": `${24 * hourPixels}px` } as React.CSSProperties}>
      <div className="visit-grid-head">
        <span className="visit-time-corner">Date</span>
        <div className="visit-hours">{hours.map((hour) => <span key={hour}>{formatVisitTime(hour * 60)}</span>)}</div>
      </div>
      {days.map((day) => {
        const label = dayName.format(new Date(day));
        const segments = arrangeDay(byDay.get(day) ?? []);
        const lanes = segments.reduce((count, segment) => Math.max(count, segment.lane + 1), 1);
        return <div className="visit-day-row" key={day} data-today={day === today ? "" : undefined}
          data-drop={draggedUnit && dropDay === day ? "" : undefined}
          onDragOver={(event) => dragOver(event, day)} onDrop={(event) => drop(event, day)}>
          <button className="visit-day-heading" onClick={() => addDrive(day, 9 * 60)}
            aria-label={`Add driving time on ${label}`}>
            <time dateTime={day} aria-current={day === today ? "date" : undefined}>{label}</time>
            <Plus size={14} aria-hidden />
          </button>
          <div className="visit-track" style={{ height: Math.max(60, lanes * laneHeight + 8) }}
            onClick={(click) => {
              if (click.target !== click.currentTarget || draggedUnit || saving) return;
              const x = click.clientX - click.currentTarget.getBoundingClientRect().left;
              const minute = Math.max(0, Math.min(1425, Math.floor(x / hourPixels * 4) * 15));
              addDrive(day, minute);
            }}>
            {segments.map((segment) => {
              const { event, start, end, offset, lane } = segment;
              const own = event.owner_id === userId;
              const label = visitLabels[event.kind];
              const name = event.kind === "drive"
                ? event.title || label : units.get(event.unit_id ?? "")?.name ?? "Unit";
              const active = drag.current;
              const showEndHandle = active?.event.id === event.id && active.edge === "end"
                ? active.offset === offset : offset + end === event.end_minute;
              return <div className={`visit-event visit-event-${event.kind}${own ? "" : " visit-event-team"}`} key={event.id}
                style={{ top: lane * laneHeight + 5, left: toPixels(start), width: Math.max(2, toPixels(end - start) - 1) }}>
                <button className="visit-event-open" onClick={() => openEvent(event)}
                  title={`${name} · ${formatVisitTime(start)}${own ? "" : ` · ${event.owner_email}`}`}>
                  <strong>{name}</strong>
                  <small>{formatVisitTime(start)}{!own ? ` · ${event.owner_email}` : event.kind !== "drive" ? ` · ${label}` : ""}</small>
                </button>
                {own && offset === 0 && resizeHandle(segment, "start")}
                {own && showEndHandle && resizeHandle(segment, "end")}
              </div>;
            })}
          </div>
        </div>;
      })}
    </div>
  </div>;
}
