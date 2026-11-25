"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { focusTypes, focusTypeLabels, type FocusType } from "../lib/focus-people";
import { addCallingHolder, addStakeUnits, deleteRecord, saveBuilding, saveRecord, saveSchedulerAssignment, type Resource } from "./actions";
import {
  buildingPhotoMaxBytes, buildingPhotoTypes, buildingPhotoUrl, formatBuildingAddress,
  callingLevelLabel, callingLevels, callingPath, compareCallingOrder, hasSacramentMeeting, isBuildingScheduler, parentKinds, unitLabels, unitPath,
  type Assignment, type Building, type CallingLevel, type CallingType, type Contact, type Directory, type Language, type Organization, type Position,
  type Conference, type Unit, type UnitKind,
} from "../lib/directory";
import { languageColor, languageColors, type LanguageColor } from "../lib/language-colors";
import { standardCallingGroups, type StandardCalling } from "../lib/standard-callings";

export type EditorState =
  | { resource: "contacts"; row?: Contact; ward?: Unit }
  | { resource: "units"; row?: Unit; parent?: Unit }
  | { resource: "buildings"; row?: Building }
  | { resource: "stake_conferences" | "ward_conferences"; row?: Conference; unit: Unit }
  | { resource: "languages"; row?: Language }
  | { resource: "organizations"; row?: Organization; defaults?: Pick<Organization, "name" | "level"> }
  | { resource: "calling_types"; row?: CallingType; organization?: Organization }
  | { resource: "positions"; row?: Position; callingType?: CallingType }
  | { resource: "assignments"; row?: Assignment; position: Position }
  | { resource: "assignments"; row?: never; position?: never; unit: Unit; callingType: CallingType }
  | { resource: "assignments"; row?: never; position?: never; unit: Unit; callingType?: never; standardRole: StandardCalling }
  | { resource: "directory_access"; revoke?: string };

const labels = {
  contacts: "Contact", units: "Unit", buildings: "Building", languages: "Language", organizations: "Organization", calling_types: "Calling type",
  stake_conferences: "Stake conference", ward_conferences: "Ward conference",
  positions: "Calling in unit", assignments: "Assignment", directory_access: "Access",
} satisfies Record<Resource, string>;

export function Modal({ title, close, children, className }: {
  title: string; close: () => void; children: ReactNode; className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} className={className} aria-labelledby="modal-title" onCancel={(event) => { event.preventDefault(); close(); }}>
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
  const conference = state.resource === "stake_conferences" || state.resource === "ward_conferences" ? state : undefined;
  const contact = state.resource === "contacts" ? state.row : undefined;
  const ward = state.resource === "contacts" ? state.ward : undefined;
  const [focusType, setFocusType] = useState<FocusType | "">(contact?.focus_type ?? (ward ? "recent_convert" : ""));
  const stake = state.resource === "units" && state.row?.kind === "stake" ? state.row : undefined;
  const recordLabel = conference ? `${unitLabels[conference.unit.kind]} conference` : focusType ? "Focus person" : stake ? "Stake" : labels[resource];
  const revoke = resource === "directory_access" ? state.revoke : undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unitAddError, setUnitAddError] = useState("");
  const [unitAddStatus, setUnitAddStatus] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(Boolean(revoke));
  const [kind, setKind] = useState<UnitKind>(
    state.resource === "units" ? state.row?.kind ?? (state.parent ? "council" : "region") : "region",
  );
  const canHaveWebsite = kind === "stake" || hasSacramentMeeting(kind);
  const [unitLanguage, setUnitLanguage] = useState(state.resource === "units" ? state.row?.language_id ?? "" : "");
  const [badgeColor, setBadgeColor] = useState(state.resource === "languages" ? languageColor(state.row) ?? "gray" : "gray");
  const [sacramentFirst, setSacramentFirst] = useState(
    state.resource !== "units" || state.row?.sacrament_meeting_first == null ? ""
      : state.row.sacrament_meeting_first ? "yes" : "no",
  );
  const [conferenceStart, setConferenceStart] = useState(conference?.row?.begins_on ?? "");
  const [hasSubCongregation, setHasSubCongregation] = useState(state.resource === "units" && Boolean(state.row?.has_sub_congregation));
  const [subCongregationLanguage, setSubCongregationLanguage] = useState(
    state.resource === "units" ? state.row?.sub_congregation_language_id ?? "" : "",
  );
  const [level, setLevel] = useState<CallingLevel>(
    (state.resource === "positions" ? state.row?.level ?? state.callingType?.level :
      state.resource === "calling_types" ? state.row?.level ?? state.organization?.level :
      state.resource === "organizations" ? state.row?.level ?? state.defaults?.level : undefined) ?? "ward",
  );
  const [retired, setRetired] = useState(Boolean(state.resource === "positions" && state.row?.retired_on));
  const [newContact, setNewContact] = useState(false);
  const types = new Map(directory.calling_types.map((type) => [type.id, type]));
  const assignmentType = state.resource === "assignments"
    ? (state.position ? types.get(state.position.calling_type_id) : state.callingType)
    : undefined;
  const canAssignBuildings = isBuildingScheduler(assignmentType, directory.calling_names);
  const buildingOptions = canAssignBuildings ? directory.buildings.map((building) => ({
    id: building.id, address: formatBuildingAddress(building),
  })).sort((a, b) => a.address.localeCompare(b.address)) : [];
  const units = new Map(directory.units.map((unit) => [unit.id, unit]));
  const assignmentContactId = state.resource === "assignments" ? state.row?.contact_id : undefined;
  const sortedContacts = directory.contacts.filter((person) => !person.focus_type || person.id === assignmentContactId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const organizations = new Map(directory.organizations.map((organization) => [organization.id, organization]));
  const levelOrganizations = directory.organizations.filter((organization) => organization.level === level).sort(compareCallingOrder);
  const typeNames = new Map(directory.calling_types.map((type) => [type.id, callingPath(type, organizations)]));
  const languages = [...directory.languages].sort((a, b) => a.name.localeCompare(b.name));
  const hasAssignments = resource === "positions" && directory.assignments.some((assignment) => assignment.position_id === state.row?.id);
  const pastAssignment = state.resource === "assignments" && state.position && (Boolean(state.position.retired_on) ||
    (!state.position.multiple_holders && directory.assignments.some((assignment) => assignment.position_id === state.position.id
      && assignment.id !== state.row?.id && !assignment.released_on)));
  const lockLevel = (state.resource === "calling_types" && directory.positions.some((position) => position.calling_type_id === state.row?.id)) ||
    (state.resource === "organizations" && directory.calling_types.some((type) => type.organization_id === state.row?.id));
  const lockKind = resource === "units" && (directory.units.some((unit) => unit.parent_id === state.row?.id)
    || directory.positions.some((position) => position.unit_id === state.row?.id)
    || directory.buildings.some((building) => building.agent_stake_id && building.agent_stake_id === state.row?.id));

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

  async function submitStakeUnits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stake || busy) return;
    const form = event.currentTarget;
    setBusy(true);
    setUnitAddError("");
    setUnitAddStatus("");
    try {
      const result = await addStakeUnits(stake.id, new FormData(form));
      if (result.error !== null) {
        setUnitAddError(result.error);
      } else {
        form.reset();
        const message = `Added ${result.added} ${result.added === 1 ? "unit" : "units"}.`;
        setUnitAddStatus(result.skipped ? `${message} Skipped ${result.skipped} ${result.skipped === 1 ? "duplicate" : "duplicates"}.` : message);
      }
    } catch {
      setUnitAddError("Could not save the units. Please try again.");
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
      case "contacts": {
        const contactDetails = { email: optional("email"), phone: optional("phone") };
        values = focusType ? {
          ...contactDetails, focus_type: focusType, first_name: value("first_name"), last_name: value("last_name"),
          ward_id: value("ward_id"), is_whatsapp: data.has("is_whatsapp"), baptized_on: optional("baptized_on"),
          helper_number: optional("helper_number"), pid: optional("pid"),
        } : { ...contactDetails, name: value("name") };
        break;
      }
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
      case "buildings": {
        const photo = data.get("photo");
        if (photo instanceof File && photo.name && (photo.size === 0 || photo.size > buildingPhotoMaxBytes ||
          !Object.hasOwn(buildingPhotoTypes, photo.type))) {
          setError("Choose a JPEG, PNG, or WebP picture up to 4 MB.");
          return;
        }
        await run(() => saveBuilding(state.row?.id ?? null, data));
        return;
      }
      case "stake_conferences":
      case "ward_conferences":
        values = {
          [state.resource === "stake_conferences" ? "stake_id" : "unit_id"]: state.unit.id,
          begins_on: value("begins_on"), ends_on: value("ends_on"),
        };
        break;
      case "languages": values = { name: value("name"), color: badgeColor }; break;
      case "organizations":
        values = { name: value("name"), level, sort_order: optional("sort_order") === null ? null : Number(value("sort_order")) };
        break;
      case "calling_types":
        values = { name: value("name"), level, organization_id: value("organization_id"),
          default_multiple_holders: data.has("default_multiple_holders") };
        break;
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
          assignment_labels: [...new Set(value("assignment_labels").split(",").map((label) => label.trim()).filter(Boolean))],
        };
        const buildingIds = canAssignBuildings ? data.getAll("building_ids") : undefined;
        if (!state.row) {
          const unitId = state.position ? state.position.unit_id : state.unit.id;
          const callingTypeId = state.position ? state.position.calling_type_id : state.callingType?.id;
          const standardRole = "standardRole" in state ? state.standardRole : undefined;
          await run(() => addCallingHolder({
            unit_id: unitId, calling_type_id: callingTypeId, standard_role: standardRole, ...details,
            contact_id: newContact ? null : optional("contact_id"),
            new_contact_name: newContact ? optional("name") : null,
            new_contact_phone: newContact ? optional("phone") : null,
            new_contact_email: newContact ? optional("email") : null,
            building_ids: buildingIds ?? [],
          }));
          return;
        }
        if (buildingIds) {
          const assignmentId = state.row.id;
          await run(() => saveSchedulerAssignment({ assignment_id: assignmentId, ...details, building_ids: buildingIds }));
          return;
        }
        values = { position_id: state.position.id, contact_id: state.row.contact_id, ...details };
        break;
      }
      case "directory_access": values = { email: value("email") }; break;
    }
    await run(() => saveRecord(state.resource, row?.id ?? null, values));
  }

  return (
    <Modal title={revoke ? "Revoke access" : resource === "directory_access" ? "Grant access" :
      row ? `Edit ${recordLabel.toLowerCase()}` : `Add ${recordLabel.toLowerCase()}`} close={() => { if (!busy) close(); }}>
      {confirmDelete ? (
        <div className="modal-body">
          <p>{revoke ? `Remove directory access for ${revoke}?` : `Permanently delete this ${recordLabel.toLowerCase()}?`}</p>
          {error && <p className="notice error" role="alert">{error}</p>}
          <div className="form-actions">
            <button type="button" className="button" disabled={busy} onClick={() => revoke ? close() : setConfirmDelete(false)}>Cancel</button>
            <button type="button" className="button danger" disabled={busy} onClick={() => {
              const id = row?.id ?? revoke;
              if (id) void run(() => deleteRecord(resource, id));
            }}>{busy ? "Working…" : revoke ? "Revoke access" : "Delete record"}</button>
          </div>
        </div>
      ) : <>
        <form className="modal-body stack" onSubmit={submit}>
          {state.resource === "contacts" && <>
            <label>Person type
              <select value={focusType} onChange={(event) => setFocusType(event.target.value as FocusType | "")}>
                {!contact?.focus_type && !ward && <option value="">Directory contact</option>}
                {focusTypes.map((type) => <option key={type} value={type}>{focusTypeLabels[type]}</option>)}
              </select>
            </label>
            {focusType ? <>
              <label>First name<input name="first_name" autoComplete="given-name" defaultValue={contact?.first_name ?? ""} maxLength={148} required /></label>
              <label>Last name<input name="last_name" autoComplete="family-name" defaultValue={contact?.last_name ?? ""} maxLength={148} required /></label>
              <label>Ward or branch
                <select name="ward_id" defaultValue={contact?.ward_id ?? ward?.id ?? ""} required>
                  <option value="">Choose a ward or branch</option>
                  {directory.units.filter(({ kind }) => hasSacramentMeeting(kind))
                    .map((unit) => ({ unit, path: unitPath(unit, units) }))
                    .sort((a, b) => a.path.localeCompare(b.path))
                    .map(({ unit }) => <option key={unit.id} value={unit.id}>{unitPath(unit, units, "dropdown")}</option>)}
                </select>
              </label>
              <label>Date Baptized <span className="optional">optional</span>
                <input name="baptized_on" type="date" defaultValue={contact?.baptized_on ?? ""} min="0001-01-01" max="9999-12-31" />
              </label>
              <label>Phone <span className="optional">optional</span>
                <input name="phone" type="tel" autoComplete="tel" maxLength={50} defaultValue={contact?.phone ?? ""} />
              </label>
              <label className="check">
                <input name="is_whatsapp" type="checkbox" defaultChecked={contact?.is_whatsapp} /> Uses WhatsApp
              </label>
              <label>Email <span className="optional">optional</span>
                <input name="email" type="email" autoComplete="email" maxLength={254} defaultValue={contact?.email ?? ""} />
              </label>
              <label>Helper number <span className="optional">optional</span>
                <input name="helper_number" type="text" inputMode="numeric" pattern="[0-9]+" defaultValue={contact?.helper_number ?? ""} />
              </label>
              <label>PID <span className="optional">optional</span>
                <input name="pid" type="text" pattern="[A-Za-z0-9]+" defaultValue={contact?.pid ?? ""} />
              </label>
            </> : <ContactFields contact={contact} />}
          </>}
          {state.resource === "units" && <>
            <label>Unit name<input name="name" defaultValue={state.row?.name} maxLength={150} required /></label>
            <label>Unit level<select value={kind} disabled={busy || lockKind} onChange={(event) => setKind(event.target.value as UnitKind)}>
              {Object.entries(unitLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            {kind !== "region" && <label>Parent {unitLabels[parentKinds[kind]].toLowerCase()}
              <select key={kind} name="parent_id" defaultValue={kind === state.row?.kind
                ? state.row.parent_id ?? ""
                : state.parent?.kind === parentKinds[kind] ? state.parent.id : ""} required>
                <option value="">Choose a parent unit</option>
                {directory.units.filter((unit) => unit.kind === parentKinds[kind]).map((unit) =>
                  <option key={unit.id} value={unit.id}>{unitPath(unit, units, "dropdown")}</option>)}
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
                  <option key={building.id} value={building.id}>{formatBuildingAddress(building)}</option>)}
              </select>
            </label>
            {hasSacramentMeeting(kind) && <>
              <label>Language<select name="language_id" value={unitLanguage}
                data-language-color={languageColor(languages.find((language) => language.id === unitLanguage))} onChange={(event) => {
                const selectedLanguage = event.target.value;
                setUnitLanguage(selectedLanguage);
                if (selectedLanguage === subCongregationLanguage) setSubCongregationLanguage("");
              }}>
                <option value="">Not set</option>
                {languages.map((language) =>
                  <option key={language.id} value={language.id} data-language-color={languageColor(language)}>{language.name}</option>)}
              </select></label>
              <label className="check">
                <input type="checkbox" checked={hasSubCongregation} onChange={(event) => setHasSubCongregation(event.target.checked)} />
                Has a sub-congregation that speaks another language
              </label>
              {hasSubCongregation && <label>Sub-congregation language
                <select name="sub_congregation_language_id" value={subCongregationLanguage} required
                  data-language-color={languageColor(languages.find((language) => language.id === subCongregationLanguage))}
                  onChange={(event) => setSubCongregationLanguage(event.target.value)}>
                  <option value="">Choose a language</option>
                  {languages.filter((language) => language.id !== unitLanguage).map((language) =>
                    <option key={language.id} value={language.id} data-language-color={languageColor(language)}>{language.name}</option>)}
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
            <label>Street address
              <input name="address" autoComplete="address-line1" maxLength={300} required defaultValue={state.row?.address} />
            </label>
            <label>City
              <input name="city" autoComplete="address-level2" maxLength={150} required defaultValue={state.row?.city ?? ""} />
            </label>
            <div className="building-address-fields">
              <label>State
                <input name="state" autoComplete="address-level1" autoCapitalize="characters" pattern="[A-Za-z]{2}"
                  title="Two-letter state abbreviation" maxLength={2} required defaultValue={state.row?.state ?? "ID"} />
              </label>
              <label>ZIP code
                <input name="zip_code" autoComplete="postal-code" pattern="[0-9]{5}(-[0-9]{4})?"
                  title="Five digits, or ZIP+4" maxLength={10} required defaultValue={state.row?.zip_code ?? ""} />
              </label>
            </div>
            <label>Agent Stake <span className="optional">optional</span>
              <select name="agent_stake_id" defaultValue={state.row?.agent_stake_id ?? ""}>
                <option value="">Choose a stake</option>
                {directory.units.filter((unit) => unit.kind === "stake")
                  .map((unit) => ({ unit, path: unitPath(unit, units) }))
                  .sort((a, b) => a.path.localeCompare(b.path))
                  .map(({ unit }) => <option key={unit.id} value={unit.id}>{unitPath(unit, units, "dropdown")}</option>)}
              </select>
            </label>
            {state.row?.photo_path && <Image className="building-photo-preview" src={buildingPhotoUrl(state.row)}
              width={480} height={240} alt="Current building picture" unoptimized />}
            <label>{state.row?.photo_path ? "Replace picture" : "Building picture"} <span className="optional">optional</span>
              <input name="photo" type="file" accept={Object.keys(buildingPhotoTypes).join(",")}
                aria-describedby="building-photo-help" />
              <span className="field-help" id="building-photo-help">JPEG, PNG, or WebP up to 4 MB.</span>
            </label>
          </>}
          {conference && <>
            <p>{conference.unit.name}</p>
            <label>Begin date
              <input type="date" name="begins_on" value={conferenceStart} onChange={(event) => setConferenceStart(event.target.value)} required />
            </label>
            <label>End date
              <input type="date" name="ends_on" defaultValue={conference.row?.ends_on} min={conferenceStart || undefined} required />
            </label>
          </>}
          {state.resource === "languages" && <>
            <label>Language name
              <input name="name" defaultValue={state.row?.name} maxLength={150} required />
            </label>
            <label>Badge color
              <select value={badgeColor} data-language-color={badgeColor}
                onChange={(event) => setBadgeColor(event.target.value as LanguageColor)}>
                {languageColors.map((color) => <option key={color} value={color} data-language-color={color}>
                  {color[0].toUpperCase() + color.slice(1)}
                </option>)}
              </select>
            </label>
          </>}
          {(state.resource === "organizations" || state.resource === "calling_types" || state.resource === "positions") && (
            <label>Calling level<select value={level} disabled={hasAssignments || lockLevel || Boolean(state.resource === "positions" && state.callingType)}
              onChange={(event) => setLevel(event.target.value as CallingLevel)}>
              {callingLevels.map((value) => <option key={value} value={value}>{callingLevelLabel(value)}</option>)}
            </select></label>
          )}
          {state.resource === "organizations" && <>
            <label>Organization name<input name="name" defaultValue={state.row?.name ?? state.defaults?.name} maxLength={150} required /></label>
            <label>Display order <span className="optional">optional</span>
              <input name="sort_order" type="number" min={1} max={2147483647} defaultValue={state.row?.sort_order ?? ""} />
              <span className="field-help">Lower numbers appear first. Organizations without a number appear alphabetically at the end.</span>
            </label>
          </>}
          {state.resource === "calling_types" && <>
            <label>Calling title<input name="name" defaultValue={state.row?.name} maxLength={150} required /></label>
            <label>Organization
              <select key={level} name="organization_id" required
                defaultValue={level === state.row?.level ? state.row.organization_id : level === state.organization?.level ? state.organization.id : ""}>
                <option value="">Choose an organization</option>
                {levelOrganizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
              </select>
              {levelOrganizations.length === 0 && <span className="field-help">Add an organization for this level first.</span>}
            </label>
            <label className="check"><input name="default_multiple_holders" type="checkbox" defaultChecked={state.row?.default_multiple_holders} />
              Allow multiple current holders by default
            </label>
            {state.row && <p className="field-help">Edit the calling in a unit to change its existing holder limit.</p>}
          </>}
          {state.resource === "positions" && <>
            <label>Calling type<select key={`type-${level}`} name="calling_type_id" required disabled={hasAssignments}
              defaultValue={state.row?.calling_type_id ?? state.callingType?.id ?? ""}>
              <option value="">Choose a calling type</option>
              {directory.calling_types.filter((type) => type.level === level).map((type) =>
                <option key={type.id} value={type.id}>{typeNames.get(type.id)}</option>)}
            </select></label>
            <label>Unit<select key={`unit-${level}`} name="unit_id" required disabled={hasAssignments}
              defaultValue={state.row?.unit_id ?? ""}>
              <option value="">Choose a unit</option>
              {directory.units.filter((unit) => unit.level === level).map((unit) =>
                <option key={unit.id} value={unit.id}>{unitPath(unit, units, "dropdown")}</option>)}
            </select></label>
            <label className="check"><input name="multiple_holders" type="checkbox" defaultChecked={state.row?.multiple_holders ?? state.callingType?.default_multiple_holders} />
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
              : `${state.callingType ? callingPath(state.callingType, organizations)
                : standardCallingGroups[state.standardRole.group].roles[state.standardRole.index]} · ${state.unit.name}`}</p>
            <label>Person<select name="contact_id" defaultValue={state.row?.contact_id ?? ""} disabled={Boolean(state.row)} required
              onChange={(event) => setNewContact(event.target.value === "new")}>
              <option value="">Choose a contact</option>
              {!state.row && <option value="new">Add a new person</option>}
              {sortedContacts.map((contact) => <option key={contact.id} value={contact.id}>
                {contact.name}{contact.email ? ` · ${contact.email}` : ""}
              </option>)}
            </select></label>
            {newContact && <ContactFields />}
            {canAssignBuildings && <fieldset>
              <legend>Buildings <span className="optional">optional</span></legend>
              {buildingOptions.length ? <div className="assignment-building-options">
                {buildingOptions.map(({ id, address }) => <label className="check" key={id}>
                  <input name="building_ids" type="checkbox" value={id}
                    defaultChecked={state.row?.assignment_buildings?.some(({ building_id }) => building_id === id)} />
                  {address}
                </label>)}
              </div> : <p className="field-help">Add buildings under Units → Buildings.</p>}
            </fieldset>}
            <label>Assignments <span className="optional">optional, comma-separated</span>
              <input name="assignment_labels" defaultValue={state.row?.assignment_labels.join(", ")} />
            </label>
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
        {stake && kind === "stake" && <form className="modal-body stack stake-add-units" onSubmit={submitStakeUnits}>
          <fieldset disabled={busy}>
            <legend>Add wards and branches</legend>
            <p className="field-help">Type or paste one unit name per line.</p>
            <label>Wards<textarea name="wards" rows={3} /></label>
            <label>Branches<textarea name="branches" rows={3} /></label>
            {unitAddError && <p className="notice error" role="alert">{unitAddError}</p>}
            {unitAddStatus && <p className="notice" role="status">{unitAddStatus}</p>}
            <div className="form-actions"><button type="submit" className="button primary">Add units</button></div>
          </fieldset>
        </form>}
      </>}
    </Modal>
  );
}
