"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { callingLevelLabel, compareCallingOrder, type CallingLevel, type CallingType } from "../lib/directory";
import { saveCallingOrder } from "./actions";

const groupLevels = ["stake", "ward", "council", "region"] as const;

export function CallingGroups({ callings, renderCalling }: {
  callings: CallingType[]; renderCalling: (calling: CallingType) => ReactNode;
}) {
  return <div className="calling-sections">
    {groupLevels.map((level) => {
      const group = callings.filter((calling) => calling.level === level).sort(compareCallingOrder);
      return (level === "stake" || level === "ward" || group.length > 0) &&
        <CallingGroup key={level} level={level} callings={group} renderCalling={renderCalling} />;
    })}
  </div>;
}

function CallingGroup({ level, callings, renderCalling }: {
  level: CallingLevel; callings: CallingType[]; renderCalling: (calling: CallingType) => ReactNode;
}) {
  const [reordering, setReordering] = useState(false);
  const label = callingLevelLabel(level);
  return <section aria-labelledby={`callings-${level}`} className="calling-list">
    <div className="calling-section-heading">
      <h2 id={`callings-${level}`}>{label} callings</h2>
      {!reordering && callings.length > 1 && (level === "stake" || level === "ward") &&
        <button className="button" aria-label={`Reorder ${label} callings`} onClick={() => setReordering(true)}>Reorder</button>}
    </div>
    {reordering ? <CallingOrder level={level} callings={callings} close={() => setReordering(false)} />
      : callings.length > 0 ? callings.map(renderCalling)
        : <p className="panel calling-section-empty">No calling titles yet.</p>}
  </section>;
}

function CallingOrder({ level, callings, close }: { level: CallingLevel; callings: CallingType[]; close: () => void }) {
  const [draft, setDraft] = useState(callings);
  const [dragging, setDragging] = useState("");
  const [target, setTarget] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = useRef<HTMLUListElement>(null);
  const drag = useRef<{ id: string; pointer: number; x: number; y: number } | null>(null);
  const frame = useRef(0);
  const sourceIndex = draft.findIndex((calling) => calling.id === dragging);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= draft.length) return;
    const updated = [...draft];
    const [calling] = updated.splice(from, 1);
    updated.splice(to, 0, calling);
    setDraft(updated);
    setAnnouncement(`${calling.name} moved to position ${to + 1}.`);
  }

  function targetAt(x: number, y: number) {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-calling-id]");
    return row && list.current?.contains(row) ? row.dataset.callingId ?? "" : "";
  }

  function monitorDrag() {
    const active = drag.current;
    if (!active) return;
    const threshold = 70;
    if (active.y < threshold) window.scrollBy(0, -14);
    else if (active.y > window.innerHeight - threshold) window.scrollBy(0, 14);
    setTarget(targetAt(active.x, active.y));
    frame.current = requestAnimationFrame(monitorDrag);
  }

  function start(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (!event.isPrimary || event.button !== 0 || drag.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY };
    setDragging(id);
    frame.current = requestAnimationFrame(monitorDrag);
  }

  function stop(event: PointerEvent<HTMLButtonElement>, drop = false) {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    if (drop) {
      const destination = targetAt(event.clientX, event.clientY);
      move(draft.findIndex((calling) => calling.id === active.id), draft.findIndex((calling) => calling.id === destination));
    }
    cancelAnimationFrame(frame.current);
    drag.current = null;
    setDragging("");
    setTarget("");
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await saveCallingOrder(level, draft.map((calling) => calling.id));
      if (result.error) setError(result.error);
      else close();
    } catch {
      setError("Could not save the order. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="panel calling-order">
    <p className="field-help">Drag the handles or use the arrows to move a calling.</p>
    <ul ref={list} className="calling-order-list">
      {draft.map((calling, index) => <li key={calling.id} data-calling-id={calling.id}
        data-moving={calling.id === dragging ? "" : undefined}
        data-drop={dragging && calling.id === target && sourceIndex !== index ? (index < sourceIndex ? "before" : "after") : undefined}>
        <button type="button" className="icon-button calling-drag" tabIndex={-1} disabled={busy} aria-label={`Drag ${calling.name}`}
          onPointerDown={(event) => start(event, calling.id)}
          onPointerMove={(event) => {
            if (drag.current?.pointer !== event.pointerId) return;
            drag.current.x = event.clientX;
            drag.current.y = event.clientY;
          }}
          onPointerUp={(event) => stop(event, true)} onPointerCancel={stop} onLostPointerCapture={stop}>
          <GripVertical size={19} aria-hidden />
        </button>
        <span>{calling.name}</span>
        <button className="icon-button" aria-label={`Move ${calling.name} up`} disabled={busy || Boolean(dragging) || index === 0}
          onClick={() => move(index, index - 1)}><ArrowUp size={17} aria-hidden /></button>
        <button className="icon-button" aria-label={`Move ${calling.name} down`} disabled={busy || Boolean(dragging) || index === draft.length - 1}
          onClick={() => move(index, index + 1)}><ArrowDown size={17} aria-hidden /></button>
      </li>)}
    </ul>
    <span className="visually-hidden" role="status">{announcement}</span>
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="form-actions">
      <button className="button" disabled={busy || Boolean(dragging)} onClick={close}>Cancel</button>
      <button className="button primary" disabled={busy || Boolean(dragging)} onClick={save}>{busy ? "Saving…" : "Save order"}</button>
    </div>
  </div>;
}
