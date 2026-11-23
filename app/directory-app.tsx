"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import {
  BookOpen, Building2, CalendarDays, ChevronDown, Copy, Ellipsis, Filter, House, LogOut, Mail, Pencil, Plus, Search, ShieldCheck, Tags, Users, X,
} from "lucide-react";
import { sendEmail, signOut, type SendResult } from "./actions";
import { Editor, Modal, type EditorState } from "./editor";
import { UnitsView } from "./units-view";
import { UnitPageContent } from "./unit-page-content";
import { CallingGroups } from "./calling-groups";
import { VisitPlanner } from "./visit-planner";
import { FamilyHistoryDashboard } from "./family-history-dashboard";
import type { FamilyHistoryReport } from "../lib/family-history";
import { focusTypeLabels, type FocusActivityData } from "../lib/focus-people";
import type { UnitJournalData } from "../lib/unit-journal";
import {
  callingAncestors, callingLevelLabel, callingPath, normalizeEmail, supportsCallingHierarchy, unitLabels, unitPath,
  type Assignment, type Contact, type Directory,
} from "../lib/directory";

const primarySections = [
  { id: "dashboard", label: "Home", description: "Dashboard", Icon: House },
  { id: "people", label: "People", Icon: Users },
  { id: "units", label: "Units", Icon: Building2 },
  { id: "visits", label: "Calendar", description: "Visits", Icon: CalendarDays },
] as const;
const sections = [
  ...primarySections,
  { id: "callings", label: "Callings", Icon: Tags },
  { id: "access", label: "Admin", description: "Manage access", Icon: ShieldCheck },
] as const;
type Tab = typeof sections[number]["id"];
type Pending = { id: string; subject: string; sent: number; total: number };

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date));
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => Array.from(word)[0]).join("").toUpperCase();
}

export function DirectoryApp({ unitId, directory, admin, email, userId, mailReady, pending, familyHistory, journal, focusActivity }: {
  unitId?: string; directory: Directory; admin: boolean; email: string; userId: string; mailReady: boolean; pending: Pending[];
  familyHistory: { reports: FamilyHistoryReport[]; loadError: string | null; currentMonth: string };
  journal: UnitJournalData | null;
  focusActivity: FocusActivityData | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const requestedTab = params.get("tab");
  const tab = unitId ? "units" : sections.find(({ id }) =>
    id === requestedTab && (id !== "access" || admin))?.id ?? "dashboard";
  const browseUnitId = params.get("unit") ?? "";
  const [moreOpen, setMoreOpen] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [callingFilter, setCallingFilter] = useState<string[]>([]);
  const [unitFilter, setUnitFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [compose, setCompose] = useState(false);
  const [copiedAddresses, setCopiedAddresses] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const [message, setMessage] = useState("");
  const [dismissed, setDismissed] = useState<string[]>([]);

  const units = new Map(directory.units.map((unit) => [unit.id, unit]));
  const detailUnit = unitId ? units.get(unitId) : undefined;
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
    if (person.focus_type) return !callingFilter.length && scopedUnitIds.has(person.ward_id ?? "");
    return active.get(person.id)?.some((assignment) => {
      const position = positions.get(assignment.position_id);
      return position && (!unitFilter || scopedUnitIds.has(position.unit_id))
        && (!callingFilter.length || callingFilter.includes(position.calling_type_id));
    });
  });
  const selectedPeople = sortedPeople.filter((person): person is Contact & { email: string } =>
    selected.has(person.id) && Boolean(person.email),
  );
  const addresses = [...new Set(selectedPeople.map((person) => normalizeEmail(person.email)))];
  const recipientCount = addresses.length;
  const addressList = addresses.join(", ");
  const emailable = visible.filter((person) => person.email);
  const pendingMail = pending.filter((entry) => !dismissed.includes(entry.id));

  function navigate(next: Tab) {
    setMoreOpen(false);
    if (next === tab && !unitId) return;
    const href = next === "dashboard" ? "/" : `/?tab=${next}`;
    const destination = unitId && next === "units" ? `${href}&unit=${unitId}` : href;
    if (unitId) router.push(destination);
    else window.history.pushState(null, "", destination);
    content.current?.scrollTo({ top: 0 });
  }

  function changeSelected(ids: string[], enabled: boolean) {
    setCopiedAddresses("");
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => enabled ? next.add(id) : next.delete(id));
      return next;
    });
  }

  async function copyAddresses() {
    try {
      await navigator.clipboard.writeText(addressList);
      setCopiedAddresses(addressList);
    } catch {
      setManualCopy(addressList);
    }
  }

  function assignmentLine(assignment: Assignment) {
    const position = positions.get(assignment.position_id);
    const current = position && types.get(position.calling_type_id);
    const currentTitle = current && callingPath(current, types);
    return { title: currentTitle ?? assignment.calling_name, unit: position && units.get(position.unit_id)?.name };
  }

  return (
    <div className={tab === "units" ? "directory-layout unit-workspace" : "directory-layout"}>
      <div className="directory-content" ref={content}>
      <header className="site-header">
        <div className="shell header-inner">
          <div className="brand"><span className="brand-icon"><BookOpen size={22} aria-hidden /></span>
            <span>Regional Directory</span>
          </div>
          <div className="account">
            {mailReady && <button className="button header-email" onClick={() => setCompose(true)}>
              <Mail size={17} aria-hidden /><span>Email</span>
              {pendingMail.length > 0 && <span className="pending-dot" aria-label="Unfinished email" />}
            </button>}
            <form action={signOut}><button className="icon-button" aria-label="Sign out" title={`Sign out of ${email}`}><LogOut size={19} /></button></form>
          </div>
        </div>
      </header>

      <main className="shell workspace">
        {message && <div className="notice status-line" role="status">{message}
          <button className="icon-button" aria-label="Dismiss status" onClick={() => setMessage("")}><X size={16} /></button>
        </div>}

        {tab === "dashboard" && <FamilyHistoryDashboard units={directory.units} {...familyHistory} />}

        {tab === "people" && <section aria-labelledby="people-heading">
          <div className="section-heading">
            <div><h1 id="people-heading">People</h1><p>Find people by name, calling, or unit.</p></div>
            <button className="button primary" onClick={() => setEditor({ resource: "contacts" })}><Plus size={18} aria-hidden />Add person</button>
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
                    <span>{type.name}<small>{[callingLevelLabel(type.level), ...callingAncestors(type, types).map((entry) => entry.name)].join(" · ")}</small></span>
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
                      <div className="chips">
                        {person.focus_type && <span className="chip">{focusTypeLabels[person.focus_type]}</span>}
                        {person.focus_type && person.ward_id && <Link className="chip" href={`/units/${person.ward_id}?section=focus`}>
                          {units.get(person.ward_id)?.name}
                        </Link>}
                        {active.get(person.id)?.map((assignment) => {
                          const { title, unit } = assignmentLine(assignment);
                          return <span className="chip" key={assignment.id}>{title} · {unit}</span>;
                        })}
                      </div>
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
          <CallingGroups callings={sortedTypes} renderCalling={(type) => {
            const callingPositions = directory.positions.filter((position) => position.calling_type_id === type.id);
            const names = directory.calling_names.filter((name) => name.calling_type_id === type.id).sort((a, b) => b.id - a.id);
            return (
              <details className="panel calling-group" key={type.id}>
                <summary><div><strong>{type.name}</strong><small>{callingPositions.length} {callingPositions.length === 1 ? "unit" : "units"}</small></div><ChevronDown size={18} aria-hidden /></summary>
                <div className="calling-body">
                  {names.length > 0 && <p className="muted">Previous titles: {names.map((name) => `${name.previous_name} (changed ${formatDate(name.changed_at)})`).join("; ")}</p>}
                  <div className="toolbar">
                    <button className="button" onClick={() => setEditor({ resource: "calling_types", row: type })}><Pencil size={15} aria-hidden />Edit title</button>
                    {supportsCallingHierarchy(type.level) && <button className="button" onClick={() => setEditor({ resource: "calling_types", parent: type })}>
                      <Plus size={16} aria-hidden />Add child calling
                    </button>}
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
                                {assignment.calling_name !== type.name && ` · Assigned as ${assignment.calling_name}`}</small>
                                {type.parent_calling_type_id && assignment.fh_assignment && <span className="chip">FH Assignment</span>}
                              </div>
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
          }} />
        </section>}

        {tab === "units" && (detailUnit
          ? <UnitPageContent key={detailUnit.id} unit={detailUnit} directory={directory} edit={setEditor} familyHistory={familyHistory} journal={journal} focusActivity={focusActivity} />
          : <UnitsView key={browseUnitId} browseUnitId={browseUnitId} units={directory.units} buildings={directory.buildings}
              languages={directory.languages} conferences={directory.stake_conferences} edit={setEditor} />)}

        {tab === "visits" && <VisitPlanner directory={directory} userId={userId} />}

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
      </div>

      <footer className="directory-footer">
        {recipientCount > 0 && <aside className="selection-bar" aria-label="Email selection">
          <div className="shell selection-inner">
            <div className="selection-summary">
              <strong role="status">{addressList === copiedAddresses
                ? `Copied ${recipientCount} ${recipientCount === 1 ? "address" : "addresses"}`
                : `${recipientCount} ${recipientCount === 1 ? "recipient" : "recipients"} selected`}</strong>
              <button className="text-button" onClick={() => {
                setSelected(new Set());
                setCopiedAddresses("");
              }}>Clear selection</button>
            </div>
            <div className="selection-actions">
              <button className="button primary" onClick={copyAddresses}><Copy size={17} aria-hidden />Copy email addresses</button>
              {mailReady && <button className="button" onClick={() => setCompose(true)}><Mail size={17} aria-hidden />Compose email</button>}
            </div>
          </div>
        </aside>}
        <nav className="shell footer-nav" aria-label="Directory sections">
          {primarySections.map(({ id, label, Icon }) => (
            <button key={id} type="button" aria-current={id === tab ? "page" : undefined} onClick={() => navigate(id)}>
              <Icon size={22} aria-hidden />{label}
            </button>
          ))}
          <button type="button" aria-haspopup="dialog" aria-expanded={moreOpen} data-active={tab === "callings" || tab === "access"}
            onClick={() => setMoreOpen(true)}>
            <Ellipsis size={22} aria-hidden />More
          </button>
        </nav>
      </footer>
      {moreOpen && <Modal title="More" close={() => setMoreOpen(false)}>
        <nav className="modal-body more-nav" aria-label="All directory sections">
          {sections.filter(({ id }) => id !== "access" || admin).map((section) => {
            const { id, label, Icon } = section;
            return <button key={id} type="button" aria-current={id === tab ? "page" : undefined} onClick={() => navigate(id)}>
              <Icon size={20} aria-hidden />
              <span>{label}{"description" in section && <small>{section.description}</small>}</span>
            </button>;
          })}
        </nav>
      </Modal>}
      {manualCopy && <Modal title="Copy email addresses" close={() => setManualCopy("")}>
        <div className="modal-body stack">
          <p>Copy the addresses below, then paste them into Gmail.</p>
          <label>Email addresses
            <textarea readOnly rows={5} value={manualCopy} onFocus={(event) => event.currentTarget.select()} />
          </label>
        </div>
      </Modal>}
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
    </div>
  );
}

function Compose({ contacts, pending, ready, count, close, remove, finish }: {
  contacts: Contact[]; pending: Pending[];
 ready: boolean; count: number; close: (clearSelection: boolean) => void; remove: (id: string) => void;
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
