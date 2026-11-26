"use client";

import { useRef, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { useRouteNavigation } from "./route-navigation";
import { formatBuildingAddress, unitPath, type Directory } from "../lib/directory";
import {
  agentLabel, isOrganizationAgent, type DirectoryOrganization, type OrganizationAssignment,
  type OrganizationEvent, type OrganizationTitle,
} from "../lib/organizations";
import { socialChannels, type SocialLink } from "../lib/social-links";
import { journalNotesMaxLength } from "../lib/unit-journal";
import { todayInVisitZone } from "../lib/visits";
import { ContactFields, HomeWardField, Modal } from "./editor";
import { removeOrganizationRecord, saveOrganizationRecord } from "./organization-actions";

export type OrganizationEditorState =
  | { resource: "directory_organizations"; row?: DirectoryOrganization }
  | { resource: "organization_titles"; organizationId: string; row?: OrganizationTitle }
  | { resource: "organization_assignments"; organizationId: string; title: OrganizationTitle; holders: OrganizationAssignment[] }
  | { resource: "assignment_status"; organizationId: string; row: OrganizationAssignment }
  | { resource: "organization_events"; organizationId: string; row?: OrganizationEvent };

const resourceLabels = {
  directory_organizations: "organization",
  organization_titles: "assignment title",
  organization_assignments: "assignment",
  assignment_status: "assignment",
  organization_events: "event",
};

function SocialLinkFields({ links = [], busy }: { links?: SocialLink[]; busy: boolean }) {
  const [fields, setFields] = useState(() => links.map((link, id) => ({ id, channel: link.channel as string, url: link.url })));
  const nextId = useRef(fields.length);

  return <fieldset>
    <legend>Social media <span className="optional">optional</span></legend>
    {fields.map(({ id, channel, url }, index) => <div className="organization-social-link stack" key={id}>
      <label>Channel
        <select name="social_channel" defaultValue={channel} required>
          <option value="" disabled>Choose a channel</option>
          {Object.entries(socialChannels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>URL
        <input name="social_url" type="url" autoCapitalize="none" placeholder="https://" maxLength={2048}
          defaultValue={url} required />
      </label>
      <button type="button" className="text-button" disabled={busy} aria-label={`Remove social link ${index + 1}`}
        onClick={() => setFields((current) => current.filter((field) => field.id !== id))}>
        <X size={16} aria-hidden /> Remove link
      </button>
    </div>)}
    <button type="button" className="text-button" disabled={busy} onClick={() => {
      const id = nextId.current++;
      setFields((current) => [...current, { id, channel: "", url: "" }]);
    }}><Plus size={16} aria-hidden /> Add social link</button>
  </fieldset>;
}

export function OrganizationEditor({ state, directory, close }: {
  state: OrganizationEditorState; directory: Directory; close: () => void;
}) {
  const navigate = useRouteNavigation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newContact, setNewContact] = useState(false);
  const { resource } = state;
  const row = "row" in state ? state.row : undefined;
  const label = resourceLabels[resource];
  const units = new Map(directory.units.map((unit) => [unit.id, unit]));
  const agents = directory.units.filter(({ kind }) => isOrganizationAgent(kind)).map((unit) => ({
    id: unit.id,
    kind: unit.kind,
    name: unitPath(unit, units, "dropdown"),
  })).sort((a, b) => a.name.localeCompare(b.name));
  const availablePeople = resource === "organization_assignments"
    ? directory.contacts.filter(({ id }) => !state.holders.some(({ contact_id }) => contact_id === id))
      .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const org = resource === "directory_organizations" ? state.row : undefined;
  const event = resource === "organization_events" ? state.row : undefined;
  const canDelete = Boolean(row);

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (busy) return;
    const form = new FormData(formEvent.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (confirmDelete && row && resource !== "organization_assignments") {
        const result = await removeOrganizationRecord({
          resource: resource === "assignment_status" ? "organization_assignments" : resource,
          id: row.id, organizationId: "organizationId" in state ? state.organizationId : row.id,
        });
        if (result.error) { setError(result.error); return; }
        if (resource === "directory_organizations") navigate("/organizations");
      } else {
        let input;
        switch (resource) {
          case "directory_organizations": {
            const urls = form.getAll("social_url");
            const socialLinks = form.getAll("social_channel").map((channel, index) => ({ channel, url: urls[index] }));
            input = { resource, id: state.row?.id, values: {
              name: form.get("name"), type: form.get("type"), agent_id: form.get("agent_id"),
              agent_kind: agents.find(({ id }) => id === form.get("agent_id"))?.kind,
              building_id: form.get("building_id") || null,
              website_url: String(form.get("website_url")).trim(), notes: form.get("notes"),
              ...(socialLinks.length || org?.social_links?.length ? { social_links: socialLinks } : {}),
            } };
            break;
          }
          case "organization_titles":
            input = { resource, id: state.row?.id, organizationId: state.organizationId, values: { name: form.get("name") } };
            break;
          case "organization_assignments":
            input = { resource, organizationId: state.organizationId, values: {
              title_id: state.title.id, active: form.has("active"),
              ...(newContact ? { new_contact: {
                name: form.get("name"), phone: form.get("phone") || null,
                email: form.get("email") || null, home_ward_id: form.get("home_ward_id") || null,
              } } : { contact_id: form.get("contact_id") }),
            } };
            break;
          case "assignment_status":
            input = { resource, organizationId: state.organizationId, id: state.row.id,
              titleId: state.row.title_id, active: form.has("active") };
            break;
          case "organization_events":
            input = { resource, id: state.row?.id, organizationId: state.organizationId, values: {
              title: form.get("title"), event_date: form.get("event_date"), notes: form.get("notes"),
              end_date: form.get("end_date") || null,
            } };
            break;
        }
        const result = await saveOrganizationRecord(input);
        if (result.error) { setError(result.error); return; }
        if (resource === "directory_organizations" && !row) navigate(`/organizations/${result.id}`);
      }
      close();
    } catch {
      setError("Could not make this change. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={confirmDelete ? `Delete ${label}` : row ? `Edit ${label}` : `Add ${label}`}
    close={() => { if (!busy) close(); }}>
    <form className="modal-body stack" onSubmit={submit}>
      {confirmDelete ? <p>{resource === "assignment_status"
        ? "Delete this assignment? The person will still appear in People."
        : `Delete this ${label}?`}</p> : <>
        {resource === "directory_organizations" && <>
          <label>Name<input name="name" defaultValue={org?.name} maxLength={150} required /></label>
          <label>Type<input name="type" defaultValue={org?.type} placeholder="FamilySearch Center or Temple" maxLength={100} required /></label>
          <label>Agent
            <select name="agent_id" defaultValue={org?.agent_id ?? ""} required>
              <option value="" disabled>Select an Area, Coordinating Council, or Stake</option>
              {agents.map(({ id, kind, name }) => isOrganizationAgent(kind) &&
                <option key={id} value={id}>{name} · {agentLabel(kind)}</option>)}
            </select>
          </label>
          <label>Building <span className="optional">optional</span>
            <select name="building_id" defaultValue={org?.building_id ?? ""}>
              <option value="">Select a building</option>
              {[...directory.buildings].sort((a, b) => a.address.localeCompare(b.address)).map((building) =>
                <option key={building.id} value={building.id}>{formatBuildingAddress(building)}</option>)}
            </select>
          </label>
          <label>Website <span className="optional">optional</span>
            <input name="website_url" type="url" maxLength={2048} defaultValue={org?.website_url ?? ""} />
          </label>
          <SocialLinkFields links={org?.social_links} busy={busy} />
          <label>Notes <span className="optional">optional</span>
            <textarea name="notes" rows={4} maxLength={journalNotesMaxLength} defaultValue={org?.notes ?? ""} />
          </label>
        </>}
        {resource === "organization_titles" && <label>Title
          <input name="name" maxLength={150} defaultValue={state.row?.name} required />
        </label>}
        {resource === "organization_assignments" && <>
          <p>{state.title.name}</p>
          <label>Person
            <select name="contact_id" defaultValue="" required onChange={(event) => setNewContact(event.target.value === "new")}>
              <option value="" disabled>Select a person</option>
              <option value="new">Add a new person</option>
              {availablePeople.map(({ id, name, email, phone }) => <option key={id} value={id}>
                {[name, email || phone].filter(Boolean).join(" · ")}
              </option>)}
            </select>
          </label>
          {newContact && <><ContactFields /><HomeWardField units={directory.units} /></>}
        </>}
        {resource === "assignment_status" && <p>{directory.contacts.find(({ id }) => id === state.row.contact_id)?.name}</p>}
        {(resource === "organization_assignments" || resource === "assignment_status") && <label className="check">
          <input type="checkbox" name="active" defaultChecked={resource === "assignment_status" ? state.row.active : true} />Active
        </label>}
        {resource === "organization_events" && <>
          <label>Title<input name="title" maxLength={150} defaultValue={event?.title} required /></label>
          <label>Start date<input name="event_date" type="date" min="0001-01-01" max="9999-12-31"
            defaultValue={event?.event_date ?? todayInVisitZone()} required /></label>
          <label>End date <span className="optional">optional</span>
            <input name="end_date" type="date" min="0001-01-01" max="9999-12-31" defaultValue={event?.end_date ?? ""} />
          </label>
          <label>Notes <span className="optional">optional</span>
            <textarea name="notes" rows={4} maxLength={journalNotesMaxLength} defaultValue={event?.notes ?? ""} />
          </label>
        </>}
      </>}
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="form-actions">
        {canDelete && !confirmDelete && <button type="button" className="button danger" disabled={busy} onClick={() => {
          setError("");
          setConfirmDelete(true);
        }}>Delete</button>}
        <button type="button" className="button" disabled={busy} onClick={() => {
          if (confirmDelete) { setError(""); setConfirmDelete(false); }
          else close();
        }}>Cancel</button>
        <button type="submit" className={confirmDelete ? "button danger" : "button primary"} disabled={busy || (resource === "directory_organizations" && !agents.length)}>
          {busy ? (confirmDelete ? "Deleting…" : "Saving…") : confirmDelete ? "Delete" : "Save"}
        </button>
      </div>
    </form>
  </Modal>;
}
