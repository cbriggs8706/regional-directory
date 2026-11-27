"use client";

import { startAccessPreview } from "./access-actions";
import { RouteLink } from "./route-navigation";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  BookOpen, Building2, CalendarDays, ChevronDown, Copy, Ellipsis, FileText, Filter, House, Languages, LogOut, Mail, Pencil, Plus, Search, ShieldCheck, Tags, UserPlus, Users, X,
} from "lucide-react";
import { sendEmail, signOut, type SendResult } from "./actions";
import { Editor, Modal, type EditorState } from "./editor";
import { UnitsView } from "./units-view";
import { BuildingsView, LanguagesView, type DirectoryManagementSection } from "./directory-management";
import { OrganizationsView } from "./organizations-view";
import { UnitPageContent } from "./unit-page-content";
import { CallingGroups } from "./calling-groups";
import { AssignmentBuildings } from "./assignment-buildings";
import { MyCalendar } from "./my-calendar";
import { SharedCalendar } from "./shared-calendar";
import { FamilyHistoryDashboard } from "./family-history-dashboard";
import { ReportGenerator } from "./report-generator/report-generator";
import { PendingContent, SectionSkeleton } from "./pending-content";
import { PersonCard } from "./person-card";
import { AddMenu } from "./add-menu";
import type { FamilyHistoryLoad, UnitDetailLoad } from "./directory-page";
import { focusTypeLabels, type FocusType } from "../lib/focus-people";
import type { JournalReportData } from "../lib/journal-report";
import type { OrganizationDetail, OrganizationDirectory } from "../lib/organizations";
import {
  isAdminDirectoryTab, normalizeEmail, unitLineage, unitNameWithType, unitPath,
  type Assignment, type Contact, type Directory, type Unit,
} from "../lib/directory";

const primarySections = [
  { id: "dashboard", label: "Home", description: "Dashboard", Icon: House },
  { id: "people", label: "People", Icon: Users },
  { id: "units", label: "Units", Icon: Building2 },
  { id: "calendar", label: "Calendar", Icon: CalendarDays },
] as const;
const sections = [
  ...primarySections,
  { id: "visits", label: "My Calendar", description: "Your visits and private events", Icon: CalendarDays },
  { id: "callings", label: "Callings", Icon: Tags },
  { id: "access", label: "Admin", description: "Manage access", Icon: ShieldCheck },
] as const;
const moreLinks = [
  { id: "report-generator", label: "Report Generator", Icon: FileText },
] as const;
const adminLinks = [
  { id: "organizations", label: "Organizations", Icon: Building2 },
  { id: "buildings", label: "Buildings", Icon: Building2 },
  { id: "languages", label: "Languages", Icon: Languages },
] as const;
type Tab = typeof sections[number]["id"];
type Pending = { id: string; subject: string; sent: number; total: number };

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date));
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => Array.from(word)[0]).join("").toUpperCase();
}

function PeopleUnitOptions({ units }: { units: Map<string, Unit> }) {
  const sortedUnits = [...units.values()].sort((a, b) => unitPath(a, units).localeCompare(unitPath(b, units)));
  const groups = new Map<Unit | undefined, Unit[]>();
  for (const unit of sortedUnits) {
    const parent = units.get(unit.parent_id ?? "");
    const siblings = groups.get(parent) ?? [];
    siblings.push(unit);
    groups.set(parent, siblings);
  }

  function unitOptions(group: Unit[]) {
    return group.map((unit) => <option key={unit.id} value={unit.id}>{unitNameWithType(unit, "short")}</option>);
  }

  return <>
    <option value="">All units</option>
    {unitOptions(groups.get(undefined) ?? [])}
    {[...groups].map(([parent, children]) => parent && <Fragment key={parent.id}>
      <hr />
      <optgroup label={unitPath(parent, units, "dropdown")}>{unitOptions(children)}</optgroup>
    </Fragment>)}
  </>;
}

const callingFilterLevels = [
  { level: "ward", label: "Wards and branches" },
  { level: "stake", label: "Stakes" },
  { level: "council", label: "Coordinating councils" },
  { level: "region", label: "Regions" },
] as const;

function PeopleFilterMenu({ name, emptyLabel, heading, subtitle, Icon, count, onClear, children }: {
  name: string;
  emptyLabel: string;
  heading: string;
  subtitle?: string;
  Icon: typeof Filter;
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  const filter = useRef<HTMLDetailsElement>(null);
  const toggle = useRef<HTMLElement>(null);

  useEffect(() => {
    function closeOnOutsidePress(event: PointerEvent) {
      const menu = filter.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) {
        menu.open = false;
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress, true);
  }, []);

  return <details ref={filter} className="people-filter" onKeyDown={(event) => {
    if (event.key === "Escape" && event.currentTarget.open) {
      event.preventDefault();
      event.currentTarget.open = false;
      toggle.current?.focus({ preventScroll: true });
    }
  }}>
    <summary ref={toggle} className="button"><Icon size={16} aria-hidden />
      {count ? `${name} (${count})` : emptyLabel}
      <ChevronDown size={15} aria-hidden />
    </summary>
    <div className="filter-menu">
      <div className="filter-menu-heading"><strong>{heading}</strong>
        {count > 0 && <button className="text-button" onClick={onClear}>Clear</button>}
      </div>
      {subtitle && <p className="field-help">{subtitle}</p>}
      <div className="filter-menu-options">{children}</div>
    </div>
  </details>;
}

export function DirectoryApp({ unitId, managementSection, directory, admin, email, userId, preview, mailReady, pending, familyHistory, currentMonth, unitData, journalReport, organizationsPage, organizationDirectory, organizationDetail }: {
  unitId?: string; managementSection?: DirectoryManagementSection;
  organizationsPage?: boolean; organizationDirectory: OrganizationDirectory; organizationDetail: OrganizationDetail | null;
  directory: Directory; admin: boolean; email: string; userId: string; preview: boolean; mailReady: boolean; pending: Pending[];
  familyHistory: FamilyHistoryLoad | null;
  currentMonth: string;
  journalReport: { month: string; data: Promise<JournalReportData> } | null;
  unitData: UnitDetailLoad | null;
}) {
  const params = useSearchParams();
  const requestedTab = params.get("tab");
  const standalone = journalReport ? "report-generator" : organizationsPage ? "organizations" : managementSection;
  const tab = standalone ?? (unitId ? "units" : sections.find(({ id }) =>
    id === requestedTab && (admin || !isAdminDirectoryTab(id)))?.id ?? "dashboard");
  const browseUnitId = params.get("unit") ?? "";
  const [moreOpen, setMoreOpen] = useState(false);
  const [addHost, setAddHost] = useState<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [focusFilter, setFocusFilter] = useState<FocusType | "">("");
  const [callingFilter, setCallingFilter] = useState<string[]>([]);
  const [organizationTitleFilter, setOrganizationTitleFilter] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
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
  const buildings = new Map(directory.buildings.map((building) => [building.id, building]));
  const positions = new Map(directory.positions.map((position) => [position.id, position]));
  const active = new Map<string, Assignment[]>();
  const assignmentsByPosition = new Map<string, Assignment[]>();
  const councilCallingContacts = new Set<string>();
  const regionalCallingContacts = new Set<string>();
  for (const assignment of directory.assignments) {
    const position = positions.get(assignment.position_id);
    const unit = position && units.get(position.unit_id);
    if (unit) (unit.kind === "region" ? regionalCallingContacts : councilCallingContacts).add(assignment.contact_id);
    const history = assignmentsByPosition.get(assignment.position_id) ?? [];
    history.push(assignment);
    assignmentsByPosition.set(assignment.position_id, history);
    if (!assignment.released_on && position && !position.retired_on) {
      const assignments = active.get(assignment.contact_id) ?? [];
      assignments.push(assignment);
      active.set(assignment.contact_id, assignments);
    }
  }
  const organizations = new Map(organizationDirectory.organizations.map((organization) => [organization.id, organization]));
  const organizationTitleLabel = (title: OrganizationDirectory["titles"][number], organizationName: string) =>
    `${title.name} • ${organizationName}`;
  const organizationOptions = organizationDirectory.titles.flatMap((title) => {
    const organization = organizations.get(title.organization_id);
    return organization ? [{ id: title.id, label: organizationTitleLabel(title, organization.name) }] : [];
  }).sort((a, b) => a.label.localeCompare(b.label));
  const organizationTitles = new Map(organizationDirectory.titles.map((title) => [title.id, title]));
  const personOrganizations = new Map<string, { id: string; titleId: string; organizationId: string; agentId: string; label: string; active: boolean }[]>();
  for (const assignment of organizationDirectory.assignments) {
    const title = organizationTitles.get(assignment.title_id);
    const organization = title && organizations.get(title.organization_id);
    if (!title || !organization) continue;
    const records = personOrganizations.get(assignment.contact_id) ?? [];
    records.push({
      id: assignment.id, titleId: title.id, organizationId: organization.id, agentId: organization.agent_id,
      label: organizationTitleLabel(title, organization.name), active: assignment.active,
    });
    personOrganizations.set(assignment.contact_id, records);
  }
  const sortedTypes = [...directory.calling_types].sort((a, b) => a.name.localeCompare(b.name));
  const tags = new Set<string>();
  if (tab === "people" && !focusFilter) {
    for (const assignments of active.values()) {
      for (const assignment of assignments) {
        assignment.assignment_labels.forEach((label) => tags.add(label));
      }
    }
  }
  const sortedTags = [...tags].sort((a, b) => a.localeCompare(b));
  function canEditPerson(person: Contact) {
    if (admin) return true;
    if (person.focus_type) return units.has(person.ward_id ?? "");
    return units.has(person.home_ward_id ?? "") || councilCallingContacts.has(person.id)
      || Boolean(personOrganizations.get(person.id)?.some(({ agentId }) => units.has(agentId) && units.get(agentId)?.kind !== "region"));
  }

  const sortedPeople = directory.contacts.filter((person) =>
    canEditPerson(person) || (!person.focus_type && regionalCallingContacts.has(person.id)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const scopedUnitIds = new Set<string>();
  if (unitFilter) {
    for (const unit of directory.units) {
      if (unitLineage(unit, units).some((ancestor) => ancestor.id === unitFilter)) scopedUnitIds.add(unit.id);
    }
  }
  const needle = search.trim().toLowerCase();
  const roleFilterCount = callingFilter.length + organizationTitleFilter.length;
  const visible = sortedPeople.filter((person) => {
    if (needle && ![person.name, person.email, person.phone].some((value) => value?.toLowerCase().includes(needle))) return false;
    if (focusFilter) return person.focus_type === focusFilter && (!unitFilter || scopedUnitIds.has(person.ward_id ?? ""));
    if (!unitFilter && !roleFilterCount && !tagFilter.length) return true;
    const matchesOrganizationRole = personOrganizations.get(person.id)?.some((assignment) =>
      assignment.active && (!unitFilter || scopedUnitIds.has(assignment.agentId))
      && (!roleFilterCount || organizationTitleFilter.includes(assignment.titleId)));
    if (matchesOrganizationRole && !tagFilter.length) return true;
    if (person.focus_type) return !roleFilterCount && !tagFilter.length && scopedUnitIds.has(person.ward_id ?? "");
    if (!roleFilterCount && !tagFilter.length && scopedUnitIds.has(person.home_ward_id ?? "")) return true;
    return active.get(person.id)?.some((assignment) => {
      const position = positions.get(assignment.position_id);
      return position && (!unitFilter || scopedUnitIds.has(position.unit_id))
        && (!roleFilterCount || callingFilter.includes(position.calling_type_id) || matchesOrganizationRole)
        && (!tagFilter.length || assignment.assignment_labels.some((label) => tagFilter.includes(label)));
    });
  });
  const selectedPeople = sortedPeople.filter((person) => selected.has(person.id));
  const emailRecipients = selectedPeople.filter((person): person is Contact & { email: string } => Boolean(person.email));
  const addresses = [...new Set(emailRecipients.map((person) => normalizeEmail(person.email)))];
  const recipientCount = addresses.length;
  const addressList = addresses.join(", ");
  const allVisibleSelected = visible.every((person) => selected.has(person.id));
  const pendingMail = pending.filter((entry) => !dismissed.includes(entry.id));

  function tabHref(next: Tab) {
    const href = next === "dashboard" ? "/" : `/?tab=${next}`;
    return unitId && next === "units" ? `${href}&unit=${unitId}` : href;
  }

  function navigateTab(next: Tab, event: { preventDefault: () => void }) {
    setMoreOpen(false);
    if (next === tab && !unitId) {
      event.preventDefault();
      return;
    }
    if (!unitId && !standalone) {
      event.preventDefault();
      window.history.pushState(null, "", tabHref(next));
    }
    content.current?.scrollTo({ top: 0 });
  }

  function moreTabLink(section: typeof sections[number]) {
    const { id, label, Icon } = section;
    return <RouteLink key={id} href={tabHref(id)} prefetch={unitId || standalone ? undefined : false}
      aria-current={id === tab ? "page" : undefined} onNavigate={(event) => navigateTab(id, event)}>
      <Icon size={20} aria-hidden />
      <span>{label}{"description" in section && <small>{section.description}</small>}</span>
    </RouteLink>;
  }

  function morePageLink({ id, label, Icon }: typeof moreLinks[number] | typeof adminLinks[number]) {
    return <RouteLink key={id} href={`/${id}`} aria-current={id === tab ? "page" : undefined}
      onNavigate={() => {
        setMoreOpen(false);
        content.current?.scrollTo({ top: 0 });
      }}>
      <Icon size={20} aria-hidden />{label}
    </RouteLink>;
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

  return (
    <div className={tab === "units" || organizationDetail ? "directory-layout unit-workspace" : "directory-layout"}>
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

        {tab === "dashboard" && familyHistory && <PendingContent data={familyHistory}
          fallback={<SectionSkeleton label="Family History reports" chart />}>
          {(reports) => <FamilyHistoryDashboard councilScope={!admin} units={directory.units} {...reports} currentMonth={currentMonth} addHost={addHost} />}
        </PendingContent>}

        {tab === "people" && <section className="people-section" aria-labelledby="people-heading">
          <div className="section-heading">
            <h1 id="people-heading">People</h1>
          </div>

          <div className="panel">
            <div className="filters">
              <label className="search"><Search size={18} aria-hidden />
                <input aria-label="Search contacts" type="search" placeholder="Search contacts" value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>
              <select aria-label="Filter by person type" value={focusFilter}
                onChange={(event) => setFocusFilter(event.target.value as FocusType | "")}>
                <option value="">All people</option>
                <option value="person_of_interest">Persons of Interest</option>
                <option value="recent_convert">Recent Converts</option>
              </select>
              <select aria-label="Filter by unit" value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)}>
                <PeopleUnitOptions units={units} />
              </select>
              {!focusFilter && <PeopleFilterMenu name="Callings" emptyLabel="All callings" heading="Callings & organization assignments"
                Icon={Filter} count={roleFilterCount} onClear={() => {
                  setCallingFilter([]);
                  setOrganizationTitleFilter([]);
                }}>
                {sortedTypes.length ? callingFilterLevels.map(({ level, label }) => {
                  const callings = sortedTypes.filter((type) => type.level === level);
                  if (!callings.length) return null;
                  return <details className="calling-filter-group" key={level}>
                    <summary><ChevronDown size={15} aria-hidden />{label}</summary>
                    <div className="calling-filter-group-options">
                      {callings.map((type) => <label key={type.id} className="check">
                        <input type="checkbox" checked={callingFilter.includes(type.id)} onChange={(event) =>
                          setCallingFilter((prev) => event.target.checked ? [...prev, type.id] : prev.filter((id) => id !== type.id))} />
                        <span>{type.name}</span>
                      </label>)}
                    </div>
                  </details>;
                }) : <p className="muted">No callings yet.</p>}
                <details className="calling-filter-group">
                  <summary><ChevronDown size={15} aria-hidden />Organization assignments</summary>
                  <div className="calling-filter-group-options">
                    {organizationOptions.length ? organizationOptions.map(({ id, label }) => <label className="check" key={id}>
                      <input type="checkbox" checked={organizationTitleFilter.includes(id)} onChange={(event) =>
                        setOrganizationTitleFilter((prev) => event.target.checked ? [...prev, id] : prev.filter((value) => value !== id))} />
                      <span>{label}</span>
                    </label>) : <p className="muted">No organization assignment titles yet.</p>}
                  </div>
                </details>
              </PeopleFilterMenu>}
              {!focusFilter && <PeopleFilterMenu name="Leader Assignments" emptyLabel="All Leader Assignments" heading="Leader Assignments"
                subtitle="Counselors that have assignments in the following"
                Icon={Tags} count={tagFilter.length} onClear={() => setTagFilter([])}>
                {sortedTags.length ? sortedTags.map((tag) => <label className="check" key={tag}>
                  <input type="checkbox" checked={tagFilter.includes(tag)} onChange={(event) =>
                    setTagFilter((prev) => event.target.checked ? [...prev, tag] : prev.filter((label) => label !== tag))} />
                  <span>{tag}</span>
                </label>) : <p className="muted">No leader assignments on current callings.</p>}
              </PeopleFilterMenu>}
            </div>
            <div className="list-heading">
              <span>{visible.length} {visible.length === 1 ? "contact" : "contacts"}</span>
              {visible.length > 0 && <button type="button" className="button" onClick={() =>
                changeSelected(visible.map((person) => person.id), !allVisibleSelected)}>
                {allVisibleSelected ? "Deselect All" : "Select All"}
              </button>}
            </div>
            {visible.length === 0 ? (
              <div className="empty"><span><Users size={25} aria-hidden /></span>
                <h2>{sortedPeople.length ? "No matching contacts" : "No contacts yet"}</h2>
                <p>{sortedPeople.length ? "Try another search or clear a filter."
                  : admin ? "Add a contact to start your directory."
                  : "People with regional callings or links to your coordinating councils appear here."}</p>
              </div>
            ) : (
              <ul className="contact-list">
                {visible.map((person) => (
                  <PersonCard key={person.id} person={person} canEdit={canEditPerson(person)} className={selected.has(person.id) ? "selected" : undefined}>
                    <label className="contact-check">
                      <input type="checkbox" aria-label={`Select ${person.name}`}
                        checked={selected.has(person.id)}
                        onChange={(event) => changeSelected([person.id], event.target.checked)} />
                    </label>
                    <span className="avatar" aria-hidden>{initials(person.name)}</span>
                    <div className="contact-info">
                      <strong>{person.name}</strong>
                      {person.email && <span>{person.email}</span>}
                      {person.phone && <span>{person.phone}</span>}
                      {person.home_ward_id && units.has(person.home_ward_id) && <RouteLink href={`/units/${person.home_ward_id}`}>
                        Home Ward · {units.get(person.home_ward_id)?.name}
                      </RouteLink>}
                      <div className="chips">
                        {person.focus_type && person.ward_id && <>
                          <RouteLink className="chip" data-focus-type={person.focus_type} href={`/units/${person.ward_id}?section=focus`}>
                            {focusTypeLabels[person.focus_type]}
                          </RouteLink>
                          <RouteLink className="chip" href={`/units/${person.ward_id}?section=focus`}>
                            {units.get(person.ward_id)?.name}
                          </RouteLink>
                        </>}
                        {active.get(person.id)?.map((assignment) => {
                          const position = positions.get(assignment.position_id);
                          if (!position) return null;
                          const calling = types.get(position.calling_type_id);
                          const unit = units.get(position.unit_id);
                          const href = `/units/${position.unit_id}?section=callings`;
                          return <Fragment key={assignment.id}>
                            <RouteLink className="chip calling-chip" href={href}>
                              {calling?.name ?? assignment.calling_name}{unit && ` • ${unitNameWithType(unit, "short")}`}
                            </RouteLink>
                            {assignment.assignment_labels.map((label) => <RouteLink className="chip assignment-chip" key={label} href={href}>
                              {label}
                            </RouteLink>)}
                          </Fragment>;
                        })}
                        {personOrganizations.get(person.id)?.map(({ id, organizationId, label, active }) =>
                          <RouteLink className="chip calling-chip" key={id} href={`/organizations/${organizationId}?section=assignments`}
                            title={active ? undefined : "Inactive assignment"} aria-label={active ? undefined : `${label} (inactive)`}>
                            {label}
                          </RouteLink>)}
                      </div>
                    </div>
                    {canEditPerson(person) && <button className="icon-button" aria-label={`Edit ${person.name}`} onClick={() => setEditor({ resource: "contacts", row: person })}>
                      <Pencil size={17} />
                    </button>}
                  </PersonCard>
                ))}
              </ul>
            )}
          </div>
          <AddMenu host={addHost} label="Add to people" actions={[
            { label: "Add person", Icon: UserPlus, run: () => setEditor({ resource: "contacts" }) },
          ]} />
        </section>}

        {tab === "callings" && <section aria-labelledby="callings-heading">
          <div className="section-heading">
            <div><h1 id="callings-heading">Callings</h1><p>Manage organizations, callings, and their holders.</p></div>
            <button className="button primary" onClick={() => setEditor({ resource: "organizations" })}><Plus size={18} aria-hidden />Add organization</button>
          </div>
          {!directory.organizations.length && <p className="panel calling-section-empty">Add an organization to start creating callings.</p>}
          <CallingGroups organizations={directory.organizations} callings={directory.calling_types} edit={setEditor} renderCalling={(type) => {
            const callingPositions = directory.positions.filter((position) => position.calling_type_id === type.id);
            const names = directory.calling_names.filter((name) => name.calling_type_id === type.id).sort((a, b) => b.id - a.id);
            return (
              <details className="panel calling-group" key={type.id}>
                <summary><div><strong>{type.name}</strong><small>{callingPositions.length} {callingPositions.length === 1 ? "unit" : "units"}</small></div><ChevronDown size={18} aria-hidden /></summary>
                <div className="calling-body">
                  {names.length > 0 && <p className="muted">Previous titles: {names.map((name) => `${name.previous_name} (changed ${formatDate(name.changed_at)})`).join("; ")}</p>}
                  <div className="toolbar">
                    <button className="button" onClick={() => setEditor({ resource: "calling_types", row: type })}><Pencil size={15} aria-hidden />Edit calling</button>
                    <button className="button" onClick={() => setEditor({ resource: "positions", callingType: type })}><Plus size={16} aria-hidden />Add to unit</button>
                  </div>
                  {callingPositions.map((position) => {
                    const unit = units.get(position.unit_id);
                    const successor = position.successor_id ? positions.get(position.successor_id) : undefined;
                    const assignments = assignmentsByPosition.get(position.id) ?? [];
                    const current = assignments.filter((assignment) => !assignment.released_on);
                    const past = assignments.filter((assignment) => assignment.released_on)
                      .sort((a, b) => (b.released_on ?? "").localeCompare(a.released_on ?? ""));

                    function renderHolder(assignment: Assignment) {
                      const person = people.get(assignment.contact_id);
                      const name = person?.name;
                      return (
                        <PersonCard as="div" className="assignment" key={assignment.id} person={person}>
                          <div><strong>{name}</strong><small>{assignment.released_on ? `Released ${formatDate(assignment.released_on)}` : "Current"}
                            {assignment.sustained_on && ` · Sustained ${formatDate(assignment.sustained_on)}`}</small>
                            {assignment.calling_name !== type.name && <small>{assignment.calling_name}</small>}
                            {assignment.assignment_labels.length > 0 && <div className="chips">
                              {assignment.assignment_labels.map((label) => <span className="chip" key={label}>{label}</span>)}
                            </div>}
                            <AssignmentBuildings assignment={assignment} buildings={buildings} />
                          </div>
                          <button className="button" aria-label={`Edit assignment for ${name}`}
                            onClick={() => setEditor({ resource: "assignments", position, row: assignment })}>
                            {assignment.released_on ? "Edit" : "Edit / release"}
                          </button>
                        </PersonCard>
                      );
                    }

                    return (
                      <div className="position" key={position.id}>
                        <div className="position-heading"><div>
                          <h3>{unit && unitPath(unit, units)}</h3>
                          <p>{position.retired_on ? `Retired ${formatDate(position.retired_on)}` :
                            current.length ? `${current.length} current` : "Vacant"}</p>
                          {successor && <p>Replacement: {types.get(successor.calling_type_id)?.name} · {units.get(successor.unit_id)?.name}</p>}
                        </div>
                          <button className="icon-button" aria-label={`Edit calling in ${unit?.name}`}
                            onClick={() => setEditor({ resource: "positions", row: position })}><Pencil size={16} /></button>
                        </div>
                        {current.map(renderHolder)}
                        {!position.retired_on && <button className="text-button add-holder"
                          onClick={() => setEditor({ resource: "assignments", position })}>
                          <Plus size={16} aria-hidden />{current.length ? "Add another holder" : "Add holder"}
                        </button>}
                        {(past.length > 0 || position.retired_on) && <details>
                          <summary className="text-button"><ChevronDown size={16} aria-hidden />Past holders ({past.length})</summary>
                          {past.map(renderHolder)}
                          {position.retired_on && <button className="text-button add-holder"
                            onClick={() => setEditor({ resource: "assignments", position })}>
                            <Plus size={16} aria-hidden />Add past holder
                          </button>}
                        </details>}
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          }} />
        </section>}

        {tab === "units" && (detailUnit && unitData
          ? <UnitPageContent key={detailUnit.id} unit={detailUnit} directory={directory} edit={setEditor} data={unitData}
              currentMonth={currentMonth} userId={userId} addHost={addHost} admin={admin}
              organizationDirectory={organizationDirectory} />
          : <UnitsView key={browseUnitId} browseUnitId={browseUnitId} directory={directory} councilScope={!admin}
              organizationDirectory={organizationDirectory} />)}

        {tab === "organizations" && <OrganizationsView key={organizationDetail?.organization.id ?? "list"}
          directory={directory} records={organizationDirectory} detail={organizationDetail} addHost={addHost} admin={admin} />}
        {tab === "buildings" && <BuildingsView directory={directory} edit={setEditor} addHost={addHost} />}
        {tab === "languages" && <LanguagesView directory={directory} edit={setEditor} addHost={addHost} />}
        {journalReport && <ReportGenerator key={journalReport.month} {...journalReport} />}

        {tab === "calendar" && <SharedCalendar units={directory.units} stakeConferences={directory.stake_conferences}
          organizations={organizationDirectory.organizations} addHost={addHost} />}
        {tab === "visits" && <MyCalendar directory={directory} addHost={addHost} />}

        {tab === "access" && admin && <section aria-labelledby="access-heading">
          <div className="section-heading"><div><h1 id="access-heading">Access</h1><p>Assign coordinating councils to Google accounts.</p></div>
            <button className="button primary" onClick={() => setEditor({ resource: "directory_access" })}><Plus size={18} aria-hidden />Grant access</button></div>
          <div className="panel"><ul className="management-list">
            {directory.directory_access.map((entry) => {
              const councilNames = entry.directory_access_councils.flatMap(({ council_id }) => units.get(council_id)?.name ?? [])
                .sort((a, b) => a.localeCompare(b));
              return <li key={entry.email}>
                <div><strong>{entry.email}</strong>
                  <small>{entry.is_admin ? "Administrator · All councils" : councilNames.join(", ") || "No councils assigned"}</small>
                </div>
                {!entry.is_admin && <div className="access-actions">
                  <button className="button" onClick={() => setEditor({ resource: "directory_access", member: entry })}>Edit councils</button>
                  <form action={startAccessPreview}>
                    <input type="hidden" name="email" value={entry.email} />
                    <button className="button" type="submit">View as user</button>
                  </form>
                  <button className="button" onClick={() => setEditor({ resource: "directory_access", revoke: entry.email })}>Revoke</button>
                </div>}
              </li>;
            })}
          </ul></div>
        </section>}
      </main>
      </div>

      <footer className="directory-footer" ref={!preview && (detailUnit || tab === "dashboard" || tab === "people" || tab === "calendar" || tab === "visits" || managementSection || organizationsPage) ? setAddHost : undefined}>
        {selectedPeople.length > 0 && <aside className="selection-bar" aria-label="Contact selection">
          <div className="shell selection-inner">
            <div className="selection-summary">
              <strong role="status">{recipientCount > 0 && addressList === copiedAddresses
                ? `Copied ${recipientCount} ${recipientCount === 1 ? "address" : "addresses"}`
                : `${selectedPeople.length} ${selectedPeople.length === 1 ? "contact" : "contacts"} selected`}</strong>
              <button className="text-button" onClick={() => {
                setSelected(new Set());
                setCopiedAddresses("");
              }}>Clear selection</button>
            </div>
            {recipientCount > 0 && <div className="selection-actions">
              <button className="button primary" onClick={copyAddresses}><Copy size={17} aria-hidden />Copy email addresses</button>
              {mailReady && <button className="button" onClick={() => setCompose(true)}><Mail size={17} aria-hidden />Compose email</button>}
            </div>}
          </div>
        </aside>}
        <nav className="shell footer-nav" aria-label="Directory sections">
          {primarySections.map(({ id, label, Icon }) => (
            <RouteLink key={id} href={tabHref(id)} prefetch={unitId || standalone ? undefined : false}
              aria-current={id === tab ? "page" : undefined} onNavigate={(event) => navigateTab(id, event)}>
              <Icon size={22} aria-hidden />{label}
            </RouteLink>
          ))}
          <button type="button" aria-haspopup="dialog" aria-expanded={moreOpen}
            data-active={Boolean(standalone) || tab === "visits" || isAdminDirectoryTab(tab)}
            onClick={() => setMoreOpen(true)}>
            <Ellipsis size={22} aria-hidden />More
          </button>
        </nav>
      </footer>
      {moreOpen && <Modal title="More" close={() => setMoreOpen(false)}>
        <nav className="modal-body more-nav" aria-label="All directory sections">
          {sections.filter(({ id }) => !isAdminDirectoryTab(id)).map(moreTabLink)}
          {moreLinks.map(morePageLink)}
          {admin && <section className="more-nav-group" aria-labelledby="more-admin-heading">
            <h3 id="more-admin-heading">Admin</h3>
            {sections.filter(({ id }) => isAdminDirectoryTab(id)).map(moreTabLink)}
            {adminLinks.map(morePageLink)}
          </section>}
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
      {editor && <Editor state={editor} directory={directory} admin={admin} close={() => setEditor(null)} />}
      {compose && <Compose contacts={emailRecipients} pending={pendingMail} ready={mailReady} count={recipientCount}
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
            <ul className="recipient-list">{contacts.map((person) => <PersonCard key={person.id} person={person}><div><strong>{person.name}</strong><small>{person.email}</small></div>
              <button type="button" className="icon-button" onClick={() => remove(person.id)} aria-label={`Remove ${person.name}`}><X size={16} /></button>
            </PersonCard>)}</ul>
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
          <p>Select at least one contact with an email address to compose a message.</p>
          {issue && <p className="notice error" role="alert">{issue}</p>}
        </>}
      </div>
    </Modal>
  );
}
