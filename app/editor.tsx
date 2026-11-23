"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { addCallingHolder, deleteRecord, saveRecord, type Resource } from "./actions";
import {
  callingLevelLabel, callingLevels, hasSacramentMeeting, parentKinds, supportsFhAssignment, unitLabels, unitPath,
  type Assignment, type Building, type CallingLevel, type CallingType, type Contact, type Directory, type Language, type Position,
  type StakeConference, type Unit, type UnitKind,
} from "../lib/directory";

export type EditorState =
  | { resource: "contacts"; row?: Contact }
  | { resource: "units"; row?: Unit; parent?: Unit }
  | { resource: "buildings"; row?: Building }
  | { resource: "stake_conferences"; row?: StakeConference; stake: Unit }
  | { resource: "languages"; row?: Language }
  | { resource: "calling_types"; row?: CallingType }
  | { resource: "positions"; row?: Position; callingType?: CallingType }
  | { resource: "assignments"; row?: Assignment; position: Position }
  | { resource: "assignments"; row?: never; position?: never; unit: Unit; callingType: CallingType }
  | { resource: "directory_access"; revoke?: string };

const labels = {
  contacts: "Contact", units: "Unit", buildings: "Building", languages: "Language", calling_types: "Calling type",
  stake_conferences: "Stake conference",
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

function ContactFields({ contact }: { contact?: Contact }) {
  const [fields, setFields] = useState({
    name: contact?.name ?? "",
    phone: contact?.phone ?? "",
    email: contact?.email ?? "",
  });
  const [pasteError, setPasteError] = useState("");

  function pasteSheetRow(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t")) return;
    event.preventDefault();

    const row = text.replace(/(?:\r\n|\r|\n)$/, "");
    const cells = row.split("\t");
    if (cells.length !== 3 || /[\r\n]/.test(row)) {
      setPasteError("Copy the Name, Phone, and Email cells from one row.");
      return;
    }

    const [name, phone, email] = cells.map((cell) => cell.trim().replace(/^"(.*)"$/, (_, value: string) => value.replace(/""/g, '"')));
    setFields({ name, phone, email });
    setPasteError("");
  }

  return <>
    <label>Full name
      <input name="name" value={fields.name} maxLength={150} required
        onChange={(event) => {
          setFields({ ...fields, name: event.target.value });
          setPasteError("");
        }}
        onPaste={contact ? undefined : pasteSheetRow} aria-describedby={contact ? undefined : "contact-paste-help"} />
      {!contact && <span className="field-help paste-help" id="contact-paste-help">
        Paste one Google Sheets row here in Name, Phone, Email order.
      </span>}
    </label>
    {pasteError && <p className="notice error" role="alert">{pasteError}</p>}
    <label>Phone <span className="optional">optional</span>
      <input name="phone" type="tel" value={fields.phone} maxLength={50}
        onChange={(event) => setFields({ ...fields, phone: event.target.value })} />
    </label>
    <label>Email <span className="optional">optional</span>
      <input name="email" type="email" value={fields.email} maxLength={254}
        onChange={(event) => setFields({ ...fields, email: event.target.value })} />
    </label>
  </>;
}

export function Editor({ state, directory, close }: { state: EditorState; directory: Directory; close: () => void }) {
  const row = "row" in state ? state.row : undefined;
  const resource = state.resource;
  const revoke = resource === "directory_access" ? state.revoke : undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(Boolean(revoke));
  const [kind, setKind] = useState<UnitKind>(
    state.resource === "units" ? state.row?.kind ?? (state.parent ? "council" : "region") : "region",
  );
  const canHaveWebsite = kind === "stake" || hasSacramentMeeting(kind);
  const [unitLanguage, setUnitLanguage] = useState(state.resource === "units" ? state.row?.language_id ?? "" : "");
  const [sacramentFirst, setSacramentFirst] = useState(
    state.resource !== "units" || state.row?.sacrament_meeting_first == null ? ""
      : state.row.sacrament_meeting_first ? "yes" : "no",
  );
  const [conferenceStart, setConferenceStart] = useState(state.resource === "stake_conferences" ? state.row?.begins_on ?? "" : "");
  const [hasSubCongregation, setHasSubCongregation] = useState(state.resource === "units" && Boolean(state.row?.has_sub_congregation));
  const [subCongregationLanguage, setSubCongregationLanguage] = useState(
    state.resource === "units" ? state.row?.sub_congregation_language_id ?? "" : "",
  );
  const [level, setLevel] = useState<CallingLevel>(
    (state.resource === "positions" ? state.row?.level ?? state.callingType?.level :
      state.resource === "calling_types" ? state.row?.level : undefined) ?? "ward",
  );
  const [retired, setRetired] = useState(Boolean(state.resource === "positions" && state.row?.retired_on));
  const [newContact, setNewContact] = useState(false);
  const assignmentLevel = state.resource === "assignments"
    ? (state.position ? state.position.level : state.callingType.level)
    : undefined;
  const units = new Map(directory.units.map((unit) => [unit.id, unit]));
  const sortedContacts = [...directory.contacts].sort((a, b) => a.name.localeCompare(b.name));
  const typeNames = new Map(directory.calling_types.map((type) => [type.id, type.name]));
  const languages = [...directory.languages].sort((a, b) => a.name.localeCompare(b.name));
  const hasAssignments = resource === "positions" && directory.assignments.some((assignment) => assignment.position_id === state.row?.id);
  const pastAssignment = state.resource === "assignments" && state.position && (Boolean(state.position.retired_on) ||
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
      case "units": {
        const meeting = hasSacramentMeeting(kind);
        const first = optional("sacrament_meeting_first");
        values = {
          name: value("name"), kind, parent_id: kind === "region" ? null : optional("parent_id"),
          website_url: canHaveWebsite ? optional("website_url") : null,
          building_id: optional("building_id"),
          language_id: meeting ? optional("language_id") : null,
          has_sub_congregation: meeting && hasSubCongregation,
          sub_congregation_language_id: meeting && hasSubCongregation ? optional("sub_congregation_language_id") : null,
          sacrament_meeting_time: meeting ? optional("sacrament_meeting_time") : null,
          sacrament_meeting_first: meeting && first !== null ? first === "yes" : null,
          first_meeting_time: meeting && first === "no" ? optional("first_meeting_time") : null,
          council_meeting_time: meeting ? optional("council_meeting_time") : null,
          notes: meeting ? optional("notes") : null,
        };
        break;
      }
      case "buildings":
        values = { address: value("address") };
        break;
      case "stake_conferences":
        values = { stake_id: state.stake.id, begins_on: value("begins_on"), ends_on: value("ends_on") };
        break;
      case "languages": values = { name: value("name") }; break;
      case "calling_types": values = { name: value("name"), level }; break;
      case "positions":
        values = {
          unit_id: hasAssignments ? state.row?.unit_id : value("unit_id"),
          calling_type_id: hasAssignments ? state.row?.calling_type_id : value("calling_type_id"),
          level, multiple_holders: data.has("multiple_holders"), retired_on: optional("retired_on"),
          successor_id: retired ? optional("successor_id") : null,
        };
        break;
      case "assignments": {
        const details = {
          sustained_on: optional("sustained_on"), released_on: optional("released_on"),
          fh_assignment: Boolean(assignmentLevel && supportsFhAssignment(assignmentLevel) && data.has("fh_assignment")),
        };
        if (!state.row) {
          const unitId = state.position ? state.position.unit_id : state.unit.id;
          const callingTypeId = state.position ? state.position.calling_type_id : state.callingType.id;
          await run(() => addCallingHolder({
            unit_id: unitId, calling_type_id: callingTypeId, ...details,
            contact_id: newContact ? null : optional("contact_id"),
            new_contact_name: newContact ? optional("name") : null,
            new_contact_phone: newContact ? optional("phone") : null,
            new_contact_email: newContact ? optional("email") : null,
          }));
          return;
        }
        values = { position_id: state.position.id, contact_id: state.row.contact_id, ...details };
        break;
      }
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
          {state.resource === "contacts" && <ContactFields contact={state.row} />}
          {state.resource === "units" && <>
            <label>Unit name<input name="name" defaultValue={state.row?.name} maxLength={150} required /></label>
            <label>Unit level<select value={kind} disabled={lockKind} onChange={(event) => setKind(event.target.value as UnitKind)}>
              {Object.entries(unitLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            {kind !== "region" && <label>Parent {unitLabels[parentKinds[kind]].toLowerCase()}
              <select key={kind} name="parent_id" defaultValue={kind === state.row?.kind
                ? state.row.parent_id ?? ""
                : state.parent?.kind === parentKinds[kind] ? state.parent.id : ""} required>
                <option value="">Choose a parent unit</option>
                {directory.units.filter((unit) => unit.kind === parentKinds[kind]).map((unit) =>
                  <option key={unit.id} value={unit.id}>{unitPath(unit, units)}</option>)}
              </select>
            </label>}
            {canHaveWebsite && <label>Website URL <span className="optional">optional</span>
              <input name="website_url" type="url" autoCapitalize="none" placeholder="https://"
                maxLength={2048} defaultValue={state.row?.website_url ?? ""} />
            </label>}
            <label>Building <span className="optional">optional</span>
              <select name="building_id" defaultValue={state.row?.building_id ?? ""}>
                <option value="">Choose a building</option>
                {[...directory.buildings].sort((a, b) => a.address.localeCompare(b.address)).map((building) =>
                  <option key={building.id} value={building.id}>{building.address}</option>)}
              </select>
            </label>
            {hasSacramentMeeting(kind) && <>
              <label>Language<select name="language_id" value={unitLanguage} onChange={(event) => {
                const selectedLanguage = event.target.value;
                setUnitLanguage(selectedLanguage);
                if (selectedLanguage === subCongregationLanguage) setSubCongregationLanguage("");
              }}>
                <option value="">Not set</option>
                {languages.map((language) =>
                  <option key={language.id} value={language.id}>{language.name}</option>)}
              </select></label>
              <label className="check">
                <input type="checkbox" checked={hasSubCongregation} onChange={(event) => setHasSubCongregation(event.target.checked)} />
                Has a sub-congregation that speaks another language
              </label>
              {hasSubCongregation && <label>Sub-congregation language
                <select name="sub_congregation_language_id" value={subCongregationLanguage} required
                  onChange={(event) => setSubCongregationLanguage(event.target.value)}>
                  <option value="">Choose a language</option>
                  {languages.filter((language) => language.id !== unitLanguage).map((language) =>
                    <option key={language.id} value={language.id}>{language.name}</option>)}
                </select>
              </label>}
              <label>Sacrament meeting start time
                <input name="sacrament_meeting_time" type="time" defaultValue={state.row?.sacrament_meeting_time?.slice(0, 5)} />
              </label>
              <label>Is sacrament meeting first?
                <select name="sacrament_meeting_first" value={sacramentFirst}
                  onChange={(event) => setSacramentFirst(event.target.value)}>
                  <option value="">Not set</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              {sacramentFirst === "no" && <label>First meeting start time
                <input name="first_meeting_time" type="time" defaultValue={state.row?.first_meeting_time?.slice(0, 5)} />
              </label>}
              <label>{unitLabels[kind]} council start time
                <input name="council_meeting_time" type="time" defaultValue={state.row?.council_meeting_time?.slice(0, 5)} />
              </label>
              <label>Notes <span className="optional">optional</span>
                <textarea name="notes" rows={3} maxLength={2000} defaultValue={state.row?.notes ?? ""} />
              </label>
            </>}
          </>}
          {state.resource === "buildings" && <>
            <label>Street address <input name="address" maxLength={300} required defaultValue={state.row?.address} /></label>
          </>}
          {state.resource === "stake_conferences" && <>
            <p>{state.stake.name}</p>
            <label>Begin date
              <input type="date" name="begins_on" value={conferenceStart} onChange={(event) => setConferenceStart(event.target.value)} required />
            </label>
            <label>End date
              <input type="date" name="ends_on" defaultValue={state.row?.ends_on} min={conferenceStart || undefined} required />
            </label>
          </>}
          {state.resource === "languages" && <label>Language name
            <input name="name" defaultValue={state.row?.name} maxLength={150} required />
          </label>}
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
            <p>{state.position
              ? `${typeNames.get(state.position.calling_type_id)} · ${units.get(state.position.unit_id)?.name}`
              : `${state.callingType.name} · ${state.unit.name}`}</p>
            <label>Person<select name="contact_id" defaultValue={state.row?.contact_id ?? ""} disabled={Boolean(state.row)} required
              onChange={(event) => setNewContact(event.target.value === "new")}>
              <option value="">Choose a contact</option>
              {!state.row && <option value="new">Add a new person</option>}
              {sortedContacts.map((contact) => <option key={contact.id} value={contact.id}>
                {contact.name}{contact.email ? ` · ${contact.email}` : ""}
              </option>)}
            </select></label>
            {newContact && <ContactFields />}
            {assignmentLevel && supportsFhAssignment(assignmentLevel) && <label className="check">
              <input name="fh_assignment" type="checkbox" defaultChecked={state.row?.fh_assignment} />
              FH Assignment
            </label>}
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
