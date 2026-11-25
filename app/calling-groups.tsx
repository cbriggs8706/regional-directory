"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus } from "lucide-react";
import { callingLevelLabel, compareCallingOrder, type CallingType, type Organization } from "../lib/directory";
import { saveCallingOrder } from "./actions";
import type { EditorState } from "./editor";

const groupLevels = ["stake", "ward", "council", "region"] as const;

export function CallingGroups({ organizations, callings, edit, renderCalling }: {
  organizations: Organization[]; callings: CallingType[]; edit: (state: EditorState) => void;
  renderCalling: (calling: CallingType) => ReactNode;
}) {
  return <div className="calling-sections">
    {groupLevels.map((level) => {
      const groups = organizations.filter((organization) => organization.level === level).sort(compareCallingOrder);
      if (!groups.length) return null;
      return <section key={level} className="calling-sections" aria-labelledby={`callings-${level}`}>
        <h2 className="calling-level-heading" id={`callings-${level}`}>{callingLevelLabel(level)}</h2>
        {groups.map((organization) => <CallingGroup key={organization.id} organization={organization}
          callings={callings.filter((calling) => calling.organization_id === organization.id).sort(compareCallingOrder)}
          edit={edit} renderCalling={renderCalling} />)}
      </section>;
    })}
  </div>;
}

function CallingGroup({ organization, callings, edit, renderCalling }: {
  organization: Organization; callings: CallingType[]; edit: (state: EditorState) => void;
  renderCalling: (calling: CallingType) => ReactNode;
}) {
  const [reordering, setReordering] = useState(false);
  return <section aria-labelledby={`organization-${organization.id}`} className="calling-list">
    <div className="calling-section-heading">
      <h3 id={`organization-${organization.id}`}>{organization.name}</h3>
      {!reordering && <div className="toolbar">
        {callings.length > 1 && <button className="button" aria-label={`Reorder ${organization.name} callings`}
          onClick={() => setReordering(true)}>Reorder</button>}
        <button className="button" onClick={() => edit({ resource: "organizations", row: organization })}>
          <Pencil size={15} aria-hidden />Edit organization
        </button>
        <button className="button" onClick={() => edit({ resource: "calling_types", organization })}>
          <Plus size={16} aria-hidden />Add calling
        </button>
      </div>}
    </div>
    {reordering ? <ReorderList items={callings} instructions="Drag the handles or use the arrows to reorder callings in this organization."
        saveOrder={(ids) => saveCallingOrder(organization.id, ids)} close={() => setReordering(false)} />
      : callings.length > 0 ? callings.map(renderCalling)
        : <p className="panel calling-section-empty">No calling titles yet.</p>}
  </section>;
}

export function ReorderList({ items, instructions, saveOrder, close }: {
  items: { id: string; name: string }[]; instructions: string;
  saveOrder: (ids: string[]) => Promise<{ error: string | null }>; close: () => void;
}) {
  const [draft, setDraft] = useState(items);
  const [dragging, setDragging] = useState("");
  const [target, setTarget] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = useRef<HTMLUListElement>(null);
  const drag = useRef<{ id: string; pointer: number; x: number; y: number } | null>(null);
  const frame = useRef(0);
  const sourceIndex = draft.findIndex((item) => item.id === dragging);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= draft.length) return;
    const updated = [...draft];
    const [item] = updated.splice(from, 1);
    updated.splice(to, 0, item);
    setDraft(updated);
    setAnnouncement(`${item.name} moved to position ${to + 1}.`);
  }

  function targetAt(x: number, y: number) {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-item-id]");
    if (!row || !list.current?.contains(row)) return "";
    return row.dataset.itemId ?? "";
  }

  function monitorDrag() {
    const active = drag.current;
    if (!active) return;
    const scrollArea = list.current?.closest<HTMLElement>(".directory-content");
    const bounds = scrollArea?.getBoundingClientRect();
    const scrollable = scrollArea ?? window;
    const threshold = 70;
    if (active.y < (bounds?.top ?? 0) + threshold) scrollable.scrollBy(0, -14);
    else if (active.y > (bounds?.bottom ?? window.innerHeight) - threshold) scrollable.scrollBy(0, 14);
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
      move(draft.findIndex((item) => item.id === active.id), draft.findIndex((item) => item.id === destination));
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
      const result = await saveOrder(draft.map(({ id }) => id));
      if (result.error) setError(result.error);
      else close();
    } catch {
      setError("Could not save the order. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="panel calling-order">
    <p className="field-help">{instructions}</p>
    <ul ref={list} className="calling-order-list">
      {draft.map((item, index) => <li key={item.id} data-item-id={item.id}
        data-moving={item.id === dragging ? "" : undefined}
        data-drop={dragging && item.id === target && sourceIndex !== index ? (index < sourceIndex ? "before" : "after") : undefined}>
        <button type="button" className="icon-button calling-drag" tabIndex={-1} disabled={busy} aria-label={`Drag ${item.name}`}
          onPointerDown={(event) => start(event, item.id)}
          onPointerMove={(event) => {
            if (drag.current?.pointer !== event.pointerId) return;
            drag.current.x = event.clientX;
            drag.current.y = event.clientY;
          }}
          onPointerUp={(event) => stop(event, true)} onPointerCancel={stop} onLostPointerCapture={stop}>
          <GripVertical size={19} aria-hidden />
        </button>
        <span>{item.name}</span>
        <button className="icon-button" aria-label={`Move ${item.name} up`} disabled={busy || Boolean(dragging) || index === 0}
          onClick={() => move(index, index - 1)}><ArrowUp size={17} aria-hidden /></button>
        <button className="icon-button" aria-label={`Move ${item.name} down`} disabled={busy || Boolean(dragging) || index === draft.length - 1}
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
