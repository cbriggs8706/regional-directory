"use client";

import { useState, type FormEvent } from "react";
import {
  BookOpen, Building2, ChevronDown, Filter, LogOut, Mail, Pencil, Plus, Search, ShieldCheck, Tags, Users, X,
} from "lucide-react";
import { sendEmail, signOut, type SendResult } from "./actions";
import { Editor, Modal, type EditorState } from "./editor";
import {
  callingLevelLabel, normalizeEmail, unitLabels, unitPath, type Assignment, type Contact, type Directory,
} from "../lib/directory";

const tabs = [
  { id: "people", label: "People", Icon: Users },
  { id: "callings", label: "Callings", Icon: Tags },
  { id: "units", label: "Units", Icon: Building2 },
  { id: "access", label: "Access", Icon: ShieldCheck },
] as const;
type Tab = typeof tabs[number]["id"];
type Pending = { id: string; subject: string; sent: number; total: number };

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date));
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => Array.from(word)[0]).join("").toUpperCase();
}

export function DirectoryApp({ directory, admin, email, mailReady, pending }: {
  directory: Directory; admin: boolean; email: string; mailReady: boolean; pending: Pending[];
}) {
  const [tab, setTab] = useState<Tab>("people");
  const [search, setSearch] = useState("");
  const [callingFilter, setCallingFilter] = useState<string[]>([]);
  const [unitFilter, setUnitFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [compose, setCompose] = useState(false);
  const [message, setMessage] = useState("");
  const [dismissed, setDismissed] = useState<string[]>([]);

  const units = new Map(directory.units.map((unit) => [unit.id, unit]));
  const people = new Map(directory.contacts.map((contact) => [contact.id, contact]));
  const types = new Map(directory.calling_types.map((type) => [type.id, type]));
  const positions = new Map(directory.positions.map((position) => [position.id, position]));
  const active = new Map<string, Assignment[]>();
  const assignmentsByPosition = new Map<string, Assignment[]>();
  for (const assignment of directory.assignments) {
    const position = positions.get(assignment.position_id);
    const history = assignmentsByPosition.get(assignment.position_id) ?? [];
    history.push(assignment);
    assignmentsByPosition.set(assignment.position_id, history);
    if (!assignment.released_on && position && !position.retired_on) {
      const assignments = active.get(assignment.contact_id) ?? [];
      assignments.push(assignment);
      active.set(assignment.contact_id, assignments);
    }
  }
  const sortedUnits = [...directory.units].sort((a, b) => unitPath(a, units).localeCompare(unitPath(b, units)));
  const sortedTypes = [...directory.calling_types].sort((a, b) => a.name.localeCompare(b.name));
  const sortedPeople = [...directory.contacts].sort((a, b) => a.name.localeCompare(b.name));
  const scopedUnitIds = new Set<string>();
  if (unitFilter) {
    for (const unit of sortedUnits) {
      let node = units.get(unit.id);
      while (node) {
        if (node.id === unitFilter) { scopedUnitIds.add(unit.id); break; }
        node = node.parent_id ? units.get(node.parent_id) : undefined;
      }
    }
  }
  const needle = search.trim().toLowerCase();
  const visible = sortedPeople.filter((person) => {
    if (needle && ![person.name, person.email, person.phone].some((value) => value?.toLowerCase().includes(needle))) return false;
    if (!unitFilter && !callingFilter.length) return true;
    return active.get(person.id)?.some((assignment) => {
      const position = positions.get(assignment.position_id);
      return position && (!unitFilter || scopedUnitIds.has(position.unit_id))
        && (!callingFilter.length || callingFilter.includes(position.calling_type_id));
    });
  });
  const selectedPeople = sortedPeople.filter((person) => selected.has(person.id) && person.email);
  const recipientCount = new Set(selectedPeople.map((person) => normalizeEmail(person.email!))).size;
  const emailable = visible.filter((person) => person.email);
  const pendingMail = pending.filter((entry) => !dismissed.includes(entry.id));

  function changeSelected(ids: string[], enabled: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => enabled ? next.add(id) : next.delete(id));
      return next;
    });
  }

  function assignmentLine(assignment: Assignment) {
    const position = positions.get(assignment.position_id);
    const currentTitle = position && types.get(position.calling_type_id)?.name;
    return { title: currentTitle ?? assignment.calling_name, unit: position && units.get(position.unit_id)?.name };
  }

  return (
    <>
      <header className="site-header">
        <div className="shell header-inner">
          <button className="brand" onClick={() => setTab("people")}><span className="brand-icon"><BookOpen size={22} aria-hidden /></span>
            <span>Regional Directory</span>
          </button>
          <div className="account">
            <button className="button header-email" onClick={() => setCompose(true)}>
              <Mail size={17} aria-hidden /><span>Email</span>
              {pendingMail.length > 0 && <span className="pending-dot" aria-label="Unfinished email" />}
            </button>
            <form action={signOut}><button className="icon-button" aria-label="Sign out" title={`Sign out of ${email}`}><LogOut size={19} /></button></form>
          </div>
        </div>
      </header>

      <main className="shell workspace">
        <nav className="tabs" aria-label="Directory sections">
          {tabs.filter((item) => item.id !== "access" || admin).map(({ id, label, Icon }) => (
            <button key={id} className={id === tab ? "active" : ""} aria-current={id === tab ? "page" : undefined} onClick={() => setTab(id)}>
              <Icon size={17} aria-hidden />{label}
            </button>
          ))}
        </nav>
        {message && <div className="notice status-line" role="status">{message}
          <button className="icon-button" aria-label="Dismiss status" onClick={() => setMessage("")}><X size={16} /></button>
        </div>}

        {tab === "people" && <section aria-labelledby="people-heading">
          <div className="section-heading">
            <div><h1 id="people-heading">People</h1><p>Find contacts by name, calling, or unit.</p></div>
            <button className="button primary" onClick={() => setEditor({ resource: "contacts" })}><Plus size={18} aria-hidden />Add contact</button>
          </div>

          <div className="panel">
            <div className="filters">
              <label className="search"><Search size={18} aria-hidden />
                <input aria-label="Search contacts" type="search" placeholder="Search contacts" value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>
              <details className="calling-filter">
                <summary className="button"><Filter size={16} aria-hidden />{callingFilter.length ? `Callings (${callingFilter.length})` : "All callings"}
                  <ChevronDown size={15} aria-hidden />
                </summary>
                <div className="filter-menu">
                  <div className="filter-menu-heading"><strong>Filter by calling</strong>
                    {callingFilter.length > 0 && <button className="text-button" onClick={() => setCallingFilter([])}>Clear</button>}
                  </div>
                  {sortedTypes.length ? sortedTypes.map((type) => <label key={type.id} className="check">
                    <input type="checkbox" checked={callingFilter.includes(type.id)} onChange={(event) =>
                      setCallingFilter((prev) => event.target.checked ? [...prev, type.id] : prev.filter((id) => id !== type.id))} />
                    <span>{type.name}<small>{callingLevelLabel(type.level)}</small></span>
                  </label>) : <p className="muted">No callings yet.</p>}
                  <button className="text-button" onClick={(event) => {
                    const filter = event.currentTarget.closest("details");
                    if (filter) { filter.open = false; filter.querySelector("summary")?.focus(); }
                  }}>Done</button>
                </div>
              </details>
              <select aria-label="Filter by unit" className="unit-filter" value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)}>
                <option value="">All units</option>
                {sortedUnits.map((unit) => <option key={unit.id} value={unit.id}>{unitPath(unit, units)}</option>)}
              </select>
            </div>
            <div className="list-heading">
              <span>{visible.length} {visible.length === 1 ? "contact" : "contacts"}</span>
              {emailable.length > 0 && <button className="text-button" onClick={() =>
                changeSelected(emailable.map((person) => person.id), !emailable.every((person) => selected.has(person.id)))}>
                {emailable.every((person) => selected.has(person.id)) ? "Deselect all shown" : "Select all shown with email"}
              </button>}
            </div>
            {visible.length === 0 ? (
              <div className="empty"><span><Users size={25} aria-hidden /></span>
                <h2>{directory.contacts.length ? "No matching contacts" : "No contacts yet"}</h2>
                <p>{directory.contacts.length ? "Try another search or clear a filter." : "Add a contact to start your directory."}</p>
              </div>
            ) : (
              <ul className="contact-list">
                {visible.map((person) => (
                  <li key={person.id} className={selected.has(person.id) && person.email ? "selected" : ""}>
                    <label className="contact-check">
                      <input type="checkbox" aria-label={`Select ${person.name} for email`} disabled={!person.email}
                        title={person.email ? undefined : "This contact has no email address"}
                        checked={Boolean(person.email && selected.has(person.id))}
                        onChange={(event) => changeSelected([person.id], event.target.checked)} />
                    </label>
                    <span className="avatar" aria-hidden>{initials(person.name)}</span>
                    <div className="contact-info">
                      <strong>{person.name}</strong>
                      {person.email && <span>{person.email}</span>}
                      {person.phone && <a href={`tel:${person.phone}`}>{person.phone}</a>}
                      <div className="chips">{active.get(person.id)?.map((assignment) => {
                        const { title, unit } = assignmentLine(assignment);
                        return <span className="chip" key={assignment.id}>{title} · {unit}</span>;
                      })}</div>
                    </div>
                    <button className="icon-button" aria-label={`Edit ${person.name}`} onClick={() => setEditor({ resource: "contacts", row: person })}>
                      <Pencil size={17} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>}

        {tab === "callings" && <section aria-labelledby="callings-heading">
          <div className="section-heading">
            <div><h1 id="callings-heading">Callings</h1><p>Manage calling titles, current holders, and past assignments.</p></div>
            <button className="button primary" onClick={() => setEditor({ resource: "calling_types" })}><Plus size={18} aria-hidden />Add calling type</button>
          </div>
          {sortedTypes.length === 0 ? (
            <div className="panel empty"><span><Tags size={25} aria-hidden /></span><h2>No callings yet</h2>
              <p>Create a calling type, then add it to the units where it applies.</p></div>
          ) : (
            <div className="calling-list">
              {sortedTypes.map((type) => {
                const callingPositions = directory.positions.filter((position) => position.calling_type_id === type.id);
                const names = directory.calling_names.filter((name) => name.calling_type_id === type.id).sort((a, b) => b.id - a.id);
                return (
                  <details className="panel calling-group" key={type.id}>
                    <summary><div><strong>{type.name}</strong><small>{callingLevelLabel(type.level)} · {callingPositions.length} {callingPositions.length === 1 ? "unit" : "units"}</small></div><ChevronDown size={18} aria-hidden /></summary>
                    <div className="calling-body">
                      {names.length > 0 && <p className="muted">Previous titles: {names.map((name) => `${name.previous_name} (changed ${formatDate(name.changed_at)})`).join("; ")}</p>}
                      <div className="toolbar">
                        <button className="button" onClick={() => setEditor({ resource: "calling_types", row: type })}><Pencil size={15} aria-hidden />Edit title</button>
                        <button className="button" onClick={() => setEditor({ resource: "positions", callingType: type })}><Plus size={16} aria-hidden />Add to unit</button>
                      </div>
                      {callingPositions.map((position) => {
                        const unit = units.get(position.unit_id);
                        const successor = position.successor_id ? positions.get(position.successor_id) : undefined;
                        const assignments = [...(assignmentsByPosition.get(position.id) ?? [])].sort((a, b) =>
                          (b.released_on ?? "9999").localeCompare(a.released_on ?? "9999"));
                        const currentCount = assignments.filter((assignment) => !assignment.released_on).length;
                        return (
                          <div className="position" key={position.id}>
                            <div className="position-heading"><div>
                              <h3>{unit && unitPath(unit, units)}</h3>
                              <p>{position.retired_on ? `Retired ${formatDate(position.retired_on)}` :
                                `${currentCount ? `${currentCount} current` : "Vacant"} · ${position.multiple_holders ? "Multiple holders allowed" : "One holder"}`}</p>
                              {successor && <p>Replacement: {types.get(successor.calling_type_id)?.name} · {units.get(successor.unit_id)?.name}</p>}
                            </div>
                              <button className="icon-button" aria-label={`Edit calling in ${unit?.name}`}
                                onClick={() => setEditor({ resource: "positions", row: position })}><Pencil size={16} /></button>
                            </div>
                            {assignments.map((assignment) => {
                              const name = people.get(assignment.contact_id)?.name;
                              return (
                                <div className="assignment" key={assignment.id}>
                                  <div><strong>{name}</strong><small>{assignment.released_on ? `Released ${formatDate(assignment.released_on)}` : "Current"}
                                    {assignment.sustained_on && ` · Sustained ${formatDate(assignment.sustained_on)}`}
                                    {assignment.calling_name !== type.name && ` · Assigned as ${assignment.calling_name}`}</small></div>
                                  <button className="button" aria-label={`Edit assignment for ${name}`}
                                    onClick={() => setEditor({ resource: "assignments", position, row: assignment })}>
                                    {assignment.released_on ? "Edit" : "Edit / release"}
                                  </button>
                                </div>
                              );
                            })}
                            <button className="text-button add-holder" onClick={() => setEditor({ resource: "assignments", position })}>
                              <Plus size={16} aria-hidden />{position.retired_on || (!position.multiple_holders && currentCount) ? "Add past assignment" : "Add holder"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </section>}

        {tab === "units" && <section aria-labelledby="units-heading">
          <div className="section-heading"><div><h1 id="units-heading">Units</h1><p>Manage regions, coordinating councils, stakes, wards, and branches.</p></div>
            <button className="button primary" onClick={() => setEditor({ resource: "units" })}><Plus size={18} aria-hidden />Add unit</button></div>
          <div className="panel">
            {sortedUnits.length === 0 ? <div className="empty"><span><Building2 size={25} aria-hidden /></span>
              <h2>No units yet</h2><p>Add your region, then add its coordinating councils, stakes, and wards.</p></div> :
              <ul className="management-list">{sortedUnits.map((unit) => (
                <li key={unit.id}><div><strong>{unit.name}</strong><small>{unitLabels[unit.kind]}{unit.parent_id && ` · ${unitPath(units.get(unit.parent_id)!, units)}`}</small></div>
                  <button className="icon-button" aria-label={`Edit ${unit.name}`} onClick={() => setEditor({ resource: "units", row: unit })}><Pencil size={17} /></button></li>
              ))}</ul>}
          </div>
        </section>}

        {tab === "access" && admin && <section aria-labelledby="access-heading">
          <div className="section-heading"><div><h1 id="access-heading">Access</h1><p>Manage which Google accounts can use the directory.</p></div>
            <button className="button primary" onClick={() => setEditor({ resource: "directory_access" })}><Plus size={18} aria-hidden />Grant access</button></div>
          <div className="panel"><ul className="management-list">
            {directory.directory_access.map((entry) => <li key={entry.email}>
              <div><strong>{entry.email}</strong><small>{entry.is_admin ? "Administrator" : "Directory member"}</small></div>
              {!entry.is_admin && <button className="button" onClick={() => setEditor({ resource: "directory_access", revoke: entry.email })}>Revoke</button>}
            </li>)}
          </ul></div>
        </section>}
      </main>

      {recipientCount > 0 && <aside className="selection-bar" aria-label="Email selection">
        <div className="shell selection-inner"><div><strong>{recipientCount} {recipientCount === 1 ? "recipient" : "recipients"} selected</strong>
          <button className="text-button" onClick={() => setSelected(new Set())}>Clear selection</button></div>
          <button className="button primary" onClick={() => setCompose(true)}><Mail size={17} aria-hidden />Compose email</button>
        </div>
      </aside>}
      {editor && <Editor state={editor} directory={directory} close={() => setEditor(null)} />}
      {compose && <Compose contacts={selectedPeople} pending={pendingMail} ready={mailReady} count={recipientCount}
        close={(clearSelection) => {
          setCompose(false);
          if (clearSelection) setSelected(new Set());
        }} remove={(id) => changeSelected([id], false)}
        finish={(result, id, newDraft) => {
          setDismissed((previous) => [...previous, id]);
          if (newDraft) setSelected(new Set());
          setCompose(false);
          setMessage(`Resend accepted ${result.sent} ${result.sent === 1 ? "email" : "emails"}.`);
        }} />}
    </>
  );
}

function Compose({ contacts, pending, ready, count, close, remove, finish }: {
  contacts: Contact[]; pending: Pending[]; ready: boolean; count: number; close: (clearSelection: boolean) => void; remove: (id: string) => void;
  finish: (result: SendResult, id: string, newDraft: boolean) => void;
}) {
  const [local, setLocal] = useState<{ id: string; subject: string; sent?: number; total: number } | null>(null);
  const [snapshot, setSnapshot] = useState<{ id: string; subject: string; body: string; contacts: { id: string; email: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState("");
  const remaining = pending.filter((draft) => draft.id !== local?.id);
  const drafts = local ? [local, ...remaining] : remaining;
  const currentInProgress = Boolean(local && local.id === snapshot?.id);
  const closeCompose = () => { if (!busy) close(currentInProgress); };

  async function deliver(payload: { id: string }, subject: string, total: number, newDraft: boolean) {
    setBusy(true);
    setIssue("");
    try {
      const result = await sendEmail(payload);
      if (!result.error) finish(result, payload.id, newDraft);
      else {
        setIssue(result.error);
        if (result.saved) setLocal({ id: payload.id, subject, sent: result.sent, total: result.total });
        if (!result.saved && newDraft) setSnapshot(null);
      }
    } catch {
      setLocal({ id: payload.id, subject, total });
      setIssue("The send could not be confirmed. Resume to check its status.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !ready || !count || currentInProgress) return;
    const data = new FormData(event.currentTarget);
    const payload = {
      id: crypto.randomUUID(), subject: String(data.get("subject") ?? ""), body: String(data.get("body") ?? ""),
      contacts: contacts.flatMap((contact) => contact.email ? [{ id: contact.id, email: contact.email }] : []),
    };
    setSnapshot(payload);
    void deliver(payload, payload.subject, count, true);
  }

  return (
    <Modal title="Email" close={closeCompose}>
      <div className="modal-body stack">
        {!ready && <p className="notice">Email sending is unavailable until Resend is configured.</p>}
        {drafts.length > 0 && <section className="unfinished" aria-label="Unfinished sends">
          <h3>Unfinished sends</h3>
          {drafts.map((draft) => <div className="assignment" key={draft.id}><div>
            <strong>{draft.subject}</strong><small>{draft.sent === undefined ? "Status unconfirmed" : `${draft.sent} of ${draft.total} accepted by Resend`}</small></div>
            <button className="button" disabled={!ready || busy} onClick={() => {
              const isCurrent = draft.id === snapshot?.id;
              void deliver(isCurrent ? snapshot : { id: draft.id }, draft.subject, draft.total, isCurrent);
            }}>Resume</button>
          </div>)}
        </section>}
        {count ? <form className="stack" onSubmit={submit}>
          <fieldset disabled={busy || currentInProgress}>
            <legend>{count} {count === 1 ? "recipient" : "recipients"}</legend>
            <ul className="recipient-list">{contacts.map((person) => <li key={person.id}><div><strong>{person.name}</strong><small>{person.email}</small></div>
              <button type="button" className="icon-button" onClick={() => remove(person.id)} aria-label={`Remove ${person.name}`}><X size={16} /></button>
            </li>)}</ul>
            <p className="field-help">Each address receives one private copy.</p>
            <label>Subject<input name="subject" maxLength={200} required /></label>
            <label>Message<textarea name="body" rows={6} maxLength={20000} required /></label>
          </fieldset>
          {issue && <p className="notice error" role="alert">{issue}</p>}
          <div className="form-actions">
            <button type="button" className="button" disabled={busy} onClick={closeCompose}>Close</button>
            <button className="button primary" disabled={busy || !ready || currentInProgress}>
              <Mail size={17} aria-hidden />{busy ? "Sending…" : `Send ${count === 1 ? "email" : `${count} emails`}`}
            </button>
          </div>
        </form> : <>
          <p>Select people from the directory or filter by calling and select everyone shown with an email address.</p>
          {issue && <p className="notice error" role="alert">{issue}</p>}
        </>}
      </div>
    </Modal>
  );
}
