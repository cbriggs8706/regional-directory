"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { deleteRecord, saveRecord, type Resource } from "./actions";
import {
  callingLevelLabel, callingLevels, parentKinds, unitLabels, unitPath,
  type Assignment, type CallingLevel, type CallingType, type Contact, type Directory, type Position, type Unit, type UnitKind,
} from "../lib/directory";

export type EditorState =
  | { resource: "contacts"; row?: Contact }
  | { resource: "units"; row?: Unit }
  | { resource: "calling_types"; row?: CallingType }
  | { resource: "positions"; row?: Position; callingType?: CallingType }
  | { resource: "assignments"; row?: Assignment; position: Position }
  | { resource: "directory_access"; revoke?: string };

const labels = {
  contacts: "Contact", units: "Unit", calling_types: "Calling type",
  positions: "Calling in unit", assignments: "Assignment", directory_access: "Access",
} satisfies Record<Resource, string>;

export function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby="modal-title" onCancel={(event) => { event.preventDefault(); close(); }}>
      <div className="modal-heading"><h2 id="modal-title">{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={close}><X size={20} /></button>
      </div>
      {children}
    </dialog>
  );
}

export function Editor({ state, directory, close }: { state: EditorState; directory: Directory; close: () => void }) {
  const row = "row" in state ? state.row : undefined;
  const resource = state.resource;
  const revoke = resource === "directory_access" ? state.revoke : undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(Boolean(revoke));
  const [kind, setKind] = useState<UnitKind>(state.resource === "units" ? state.row?.kind ?? "region" : "region");
  const [level, setLevel] = useState<CallingLevel>(
    (state.resource === "positions" ? state.row?.level ?? state.callingType?.level :
      state.resource === "calling_types" ? state.row?.level : undefined) ?? "ward",
  );
  const [retired, setRetired] = useState(Boolean(state.resource === "positions" && state.row?.retired_on));
  const units = new Map(directory.units.map((unit) => [unit.id, unit]));
  const sortedContacts = [...directory.contacts].sort((a, b) => a.name.localeCompare(b.name));
  const typeNames = new Map(directory.calling_types.map((type) => [type.id, type.name]));
  const hasAssignments = resource === "positions" && directory.assignments.some((assignment) => assignment.position_id === state.row?.id);
  const pastAssignment = state.resource === "assignments" && (Boolean(state.position.retired_on) ||
    (!state.position.multiple_holders && directory.assignments.some((assignment) => assignment.position_id === state.position.id
      && assignment.id !== state.row?.id && !assignment.released_on)));
  const lockType = resource === "calling_types" && directory.positions.some((position) => position.calling_type_id === state.row?.id);
  const lockKind = resource === "units" && (directory.units.some((unit) => unit.parent_id === state.row?.id)
    || directory.positions.some((position) => position.unit_id === state.row?.id));

  async function run(operation: () => Promise<{ error: string | null }>) {
    setBusy(true);
    setError("");
    try {
      const result = await operation();
      if (result.error) setError(result.error);
      else close();
    } catch {
      setError("The request could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const optional = (key: string) => value(key) || null;
    let values: object;
    switch (state.resource) {
      case "contacts": values = { name: value("name"), email: optional("email"), phone: optional("phone") }; break;
      case "units": values = { name: value("name"), kind, parent_id: kind === "region" ? null : optional("parent_id") }; break;
      case "calling_types": values = { name: value("name"), level }; break;
      case "positions":
        values = {
          unit_id: hasAssignments ? state.row?.unit_id : value("unit_id"),
          calling_type_id: hasAssignments ? state.row?.calling_type_id : value("calling_type_id"),
          level, multiple_holders: data.has("multiple_holders"), retired_on: optional("retired_on"),
          successor_id: retired ? optional("successor_id") : null,
        };
        break;
      case "assignments":
        values = { position_id: state.position.id, contact_id: state.row?.contact_id ?? value("contact_id"),
          sustained_on: optional("sustained_on"), released_on: optional("released_on") };
        break;
      case "directory_access": values = { email: value("email") }; break;
    }
    await run(() => saveRecord(resource, row?.id ?? null, values));
  }

  return (
    <Modal title={revoke ? "Revoke access" : resource === "directory_access" ? "Grant access" :
      row ? `Edit ${labels[resource].toLowerCase()}` : `Add ${labels[resource].toLowerCase()}`} close={() => { if (!busy) close(); }}>
      {confirmDelete ? (
        <div className="modal-body">
          <p>{revoke ? `Remove directory access for ${revoke}?` : `Permanently delete this ${labels[resource].toLowerCase()}?`}</p>
          {error && <p className="notice error" role="alert">{error}</p>}
          <div className="form-actions">
            <button type="button" className="button" disabled={busy} onClick={() => revoke ? close() : setConfirmDelete(false)}>Cancel</button>
            <button type="button" className="button danger" disabled={busy} onClick={() => {
              const id = row?.id ?? revoke;
              if (id) void run(() => deleteRecord(resource, id));
            }}>{busy ? "Working…" : revoke ? "Revoke access" : "Delete record"}</button>
          </div>
        </div>
      ) : (
        <form className="modal-body stack" onSubmit={submit}>
          {state.resource === "contacts" && <>
            <label>Full name<input name="name" defaultValue={state.row?.name} maxLength={150} required /></label>
            <label>Email <span className="optional">optional</span><input name="email" type="email" defaultValue={state.row?.email ?? ""} maxLength={254} /></label>
            <label>Phone <span className="optional">optional</span><input name="phone" type="tel" defaultValue={state.row?.phone ?? ""} maxLength={50} /></label>
          </>}
          {state.resource === "units" && <>
            <label>Unit name<input name="name" defaultValue={state.row?.name} maxLength={150} required /></label>
            <label>Unit level<select value={kind} disabled={lockKind} onChange={(event) => setKind(event.target.value as UnitKind)}>
              {Object.entries(unitLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            {kind !== "region" && <label>Parent {unitLabels[parentKinds[kind]].toLowerCase()}
              <select key={kind} name="parent_id" defaultValue={kind === state.row?.kind ? state.row.parent_id ?? "" : ""} required>
                <option value="">Choose a parent unit</option>
                {directory.units.filter((unit) => unit.kind === parentKinds[kind]).map((unit) =>
                  <option key={unit.id} value={unit.id}>{unitPath(unit, units)}</option>)}
              </select>
            </label>}
          </>}
          {(state.resource === "calling_types" || state.resource === "positions") && (
            <label>Calling level<select value={level} disabled={hasAssignments || lockType || Boolean(state.resource === "positions" && state.callingType)}
              onChange={(event) => setLevel(event.target.value as CallingLevel)}>
              {callingLevels.map((value) => <option key={value} value={value}>{callingLevelLabel(value)}</option>)}
            </select></label>
          )}
          {state.resource === "calling_types" && <label>Calling title
            <input name="name" defaultValue={state.row?.name} maxLength={150} required />
          </label>}
          {state.resource === "positions" && <>
            <label>Calling type<select key={`type-${level}`} name="calling_type_id" required disabled={hasAssignments}
              defaultValue={state.row?.calling_type_id ?? state.callingType?.id ?? ""}>
              <option value="">Choose a calling type</option>
              {directory.calling_types.filter((type) => type.level === level).map((type) =>
                <option key={type.id} value={type.id}>{type.name}</option>)}
            </select></label>
            <label>Unit<select key={`unit-${level}`} name="unit_id" required disabled={hasAssignments}
              defaultValue={state.row?.unit_id ?? ""}>
              <option value="">Choose a unit</option>
              {directory.units.filter((unit) => unit.level === level).map((unit) =>
                <option key={unit.id} value={unit.id}>{unitPath(unit, units)}</option>)}
            </select></label>
            <label className="check"><input name="multiple_holders" type="checkbox" defaultChecked={state.row?.multiple_holders} />
              Allow multiple current holders
            </label>
            {state.row && <>
              <label className="check"><input type="checkbox" checked={retired} onChange={(event) => setRetired(event.target.checked)} />
                Retire this calling in this unit
              </label>
              {retired && <>
                <label>Retirement date<input name="retired_on" type="date" defaultValue={state.row.retired_on ?? ""} required /></label>
                <label>Replacement calling <span className="optional">optional</span>
                  <select name="successor_id" defaultValue={state.row.successor_id ?? ""}>
                    <option value="">No replacement</option>
                    {directory.positions.filter((position) => position.id === state.row?.successor_id ||
                      (position.id !== state.row?.id && !position.retired_on)).map((position) =>
                      <option key={position.id} value={position.id}>{typeNames.get(position.calling_type_id)} · {units.get(position.unit_id)?.name}</option>)}
                  </select>
                </label>
              </>}
            </>}
          </>}
          {state.resource === "assignments" && <>
            <label>Contact<select name="contact_id" defaultValue={state.row?.contact_id ?? ""} disabled={Boolean(state.row)} required>
              <option value="">Choose a contact</option>
              {sortedContacts.map((contact) => <option key={contact.id} value={contact.id}>
                {contact.name}{contact.email ? ` · ${contact.email}` : ""}
              </option>)}
            </select></label>
            <label>Sustained date <span className="optional">optional</span><input type="date" name="sustained_on" defaultValue={state.row?.sustained_on ?? ""} /></label>
            <label>Released date {!pastAssignment && <span className="optional">optional</span>}
              <input type="date" name="released_on" defaultValue={state.row?.released_on ?? ""} required={pastAssignment} />
            </label>
            {!pastAssignment && <p className="field-help">Leave the released date blank for a current holder.</p>}
          </>}
          {state.resource === "directory_access" && <label>Google account email<input name="email" type="email" maxLength={254} required /></label>}
          {error && <p className="notice error" role="alert">{error}</p>}
          <div className="form-actions">
            {row && <button type="button" className="button text-danger push" disabled={busy} onClick={() => {
              setError(""); setConfirmDelete(true);
            }}>Delete</button>}
            <button type="button" className="button" disabled={busy} onClick={close}>Cancel</button>
            <button className="button primary" disabled={busy}>{busy ? "Saving…" : resource === "directory_access" ? "Grant access" : "Save changes"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
