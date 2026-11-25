"use client";

import { RouteLink } from "./route-navigation";
import { BookOpen, Building2, CalendarDays, ChevronDown, ChevronRight, Pencil, Plus, Tags, UserRound } from "lucide-react";
import { useState } from "react";
import { abbreviatedUnitName, compareCallingOrder, unitLineage, unitNameWithType, type Directory } from "../lib/directory";
import { journalEntryDateLabel } from "../lib/journal-report";
import { agentLabel, agentName, type DirectoryOrganization, type OrganizationDetail, type OrganizationDirectory, type OrganizationEvent } from "../lib/organizations";
import { formatVisitTime, visitClock } from "../lib/visits";
import { AddMenu } from "./add-menu";
import { BuildingPageHeader } from "./building-page-header";
import { ReorderList } from "./calling-groups";
import { PageSectionTabs, usePageSection } from "./page-section-tabs";
import { PendingContent, SectionSkeleton } from "./pending-content";
import { saveOrganizationTitleOrder } from "./organization-actions";
import { OrganizationEditor, type OrganizationEditorState } from "./organization-editor";
import { UnitJournal } from "./unit-journal";
import { PageSectionHeading } from "./unit-section-heading";
import { PersonCard } from "./person-card";

const sections = ["overview", "assignments"] as const;
const sectionLabels = { overview: "Overview", assignments: "Assignments" };

export function OrganizationList({ organizations, units }: { organizations: DirectoryOrganization[]; units?: Directory["units"] }) {
  if (!organizations.length) return <p className="notice">No organizations yet.</p>;
  const agents = new Map(units?.map((unit) => [unit.id, unit]));
  return <ul className="panel management-list">
    {[...organizations].sort((a, b) => a.name.localeCompare(b.name)).map((organization) => {
      const agent = agents.get(organization.agent_id);
      return <li className="organization-list-row" key={organization.id}>
        <RouteLink href={`/organizations/${organization.id}`}>
          <Building2 size={20} aria-hidden />
          <span><strong>{organization.name}</strong>
            <small>{organization.type}{agent && ` · ${agentLabel(organization.agent_kind)}: ${agentName(agent)}`}</small>
          </span>
          <ChevronRight size={18} aria-hidden />
        </RouteLink>
      </li>;
    })}
  </ul>;
}

export function OrganizationsView({ directory, records, detail, addHost }: {
  directory: Directory; records: OrganizationDirectory; detail: OrganizationDetail | null; addHost: HTMLElement | null;
}) {
  const [editor, setEditor] = useState<OrganizationEditorState | null>(null);
  const [newJournalEntry, setNewJournalEntry] = useState(false);
  const organization = detail?.organization;
  const sectionNavigation = usePageSection(organization ? `/organizations/${organization.id}` : "/organizations", sections, "overview");
  const { section, showSection } = sectionNavigation;
  const units = new Map(directory.units.map((unit) => [unit.id, unit]));
  const agent = units.get(organization?.agent_id ?? "");
  const lineage = agent ? unitLineage(agent, units) : [];
  const building = directory.buildings.find(({ id }) => id === organization?.building_id);
  if (records.loadError) return <section aria-labelledby="organizations-heading">
    <div className="section-heading"><h1 id="organizations-heading">Organizations</h1></div>
    <p className="notice error" role="alert">{records.loadError}</p>
  </section>;

  return <>
    {detail && organization ? <div className="unit-page">
      <nav className="unit-ancestry" aria-label="Organization breadcrumb">
        <ol>
          {lineage.map((unit, index) => <li key={unit.id}>
            {index > 0 && <span aria-hidden="true">/</span>}
            <RouteLink href={`/units/${unit.id}${unit.id === agent?.id ? "?section=stewardships" : ""}`}
              title={unitNameWithType(unit)}>
              {unit.kind === "region" || unit.kind === "council" ? abbreviatedUnitName(unit) : unitNameWithType(unit)}
            </RouteLink>
          </li>)}
          {!agent && <li><RouteLink href="/organizations">Organizations</RouteLink></li>}
          <li><span aria-hidden="true">/</span><span aria-current="page">{organization.name}</span></li>
        </ol>
      </nav>
      <BuildingPageHeader name={organization.name} recordLabel="Organization" building={building}
        website={organization.website_url} facts={<span className="chips"><span className="chip">{organization.type}</span></span>}
        edit={() => setEditor({ resource: "directory_organizations", row: organization })}>
        {agent && <p className="unit-heading-address"><strong>{agentLabel(organization.agent_kind)}</strong>{" · "}
          <RouteLink href={`/units/${agent.id}?section=stewardships`}>{agentName(agent)}</RouteLink></p>}
      </BuildingPageHeader>
      <PageSectionTabs label="Organization sections" sections={sections} labels={sectionLabels} {...sectionNavigation} />
      {section === "overview" && <section className="unit-tab-section" aria-labelledby="organization-overview-heading">
        <PageSectionHeading id="organization-overview-heading" title="Overview" name={organization.name} />
        <PendingContent data={detail.events} fallback={<SectionSkeleton label="events" />}>
          {({ rows, error }) => <OrganizationEvents events={rows} loadError={error ? "Could not load events." : null} edit={(row) =>
            setEditor({ resource: "organization_events", organizationId: organization.id, row })} />}
        </PendingContent>
        <PendingContent key={detail.journalPage ?? 0} data={detail.journal} fallback={<SectionSkeleton id="unit-journal" label="journal" />}>
          {(journal) => <UnitJournal organizationId={organization.id} journal={journal}
            newEntryOpen={newJournalEntry} closeNewEntry={() => setNewJournalEntry(false)} />}
        </PendingContent>
        {organization.notes && <section className="panel unit-page-notes">
          <h2>Notes</h2><p className="unit-notes">{organization.notes}</p>
        </section>}
      </section>}
      {section === "assignments" && <OrganizationAssignments organizationId={organization.id} name={organization.name}
        contacts={directory.contacts} records={records} setEditor={setEditor} />}
      <AddMenu host={addHost} label="Add organization records" actions={[
        { label: "Add assignment title", Icon: Tags, run: () => {
          showSection("assignments");
          setEditor({ resource: "organization_titles", organizationId: organization.id });
        } },
        { label: "Add event", Icon: CalendarDays, availableWhen: detail.canAddEvent,
          run: () => {
            showSection("overview");
            setEditor({ resource: "organization_events", organizationId: organization.id });
          } },
        { label: "Add journal entry", Icon: BookOpen, availableWhen: detail.canAddJournal, run: () => {
          showSection("overview");
          setNewJournalEntry(true);
        } },
      ]} />
    </div> : <section aria-labelledby="organizations-heading">
      <div className="section-heading"><h1 id="organizations-heading">Organizations</h1></div>
      <OrganizationList organizations={records.organizations} units={directory.units} />
      <AddMenu host={addHost} label="Add options" actions={[
        { label: "Add organization", Icon: Building2, run: () => setEditor({ resource: "directory_organizations" }) },
      ]} />
    </section>}
    {editor && <OrganizationEditor state={editor} directory={directory} close={() => setEditor(null)} />}
  </>;
}

function OrganizationAssignments({ organizationId, name, contacts, records, setEditor }: {
  organizationId: string;
  name: string;
  contacts: Directory["contacts"];
  records: OrganizationDirectory;
  setEditor: (state: OrganizationEditorState) => void;
}) {
  const [reordering, setReordering] = useState(false);
  const titles = records.titles.filter(({ organization_id }) => organization_id === organizationId)
    .sort(compareCallingOrder);
  const people = new Map(contacts.map((person) => [person.id, person]));

  return <section className="unit-tab-section" aria-labelledby="organization-assignments-heading">
    <PageSectionHeading id="organization-assignments-heading" title="Assignments" name={name} />
    {!reordering && titles.length > 1 && <div className="toolbar">
      <button type="button" className="button" aria-label="Reorder assignment titles"
        onClick={() => setReordering(true)}>Reorder</button>
    </div>}
    {reordering ? <ReorderList items={titles} instructions="Drag the handles or use the arrows to reorder assignment titles."
      saveOrder={(ids) => saveOrganizationTitleOrder(organizationId, ids)} close={() => setReordering(false)} />
      : titles.length ? <div className="calling-list unit-callings-list">
        {titles.map((title) => {
          const holders = records.assignments.filter(({ title_id }) => title_id === title.id)
            .sort((a, b) => Number(b.active) - Number(a.active) ||
              (people.get(a.contact_id)?.name ?? "").localeCompare(people.get(b.contact_id)?.name ?? ""));
          const active = holders.filter((holder) => holder.active);
          const inactive = holders.filter((holder) => !holder.active);
          function holderCard(holder: typeof holders[number]) {
            const person = people.get(holder.contact_id);
            return <PersonCard className="panel unit-holder-card" key={holder.id} person={person}>
              <span className="unit-holder-icon"><UserRound size={17} aria-hidden /></span>
              <div className="unit-holder-info">
                <strong>{person?.name ?? "Person unavailable"}</strong>
                <span className="unit-holder-calling">{title.name}</span>
                {person?.email && <small>{person.email}</small>}
                {person?.phone && <small>{person.phone}</small>}
              </div>
              <button type="button" className="icon-button" aria-label={`Edit ${title.name} assignment for ${person?.name ?? "person"}`}
                onClick={() => setEditor({ resource: "assignment_status", organizationId: title.organization_id, row: holder })}>
                <Pencil size={16} aria-hidden />
              </button>
            </PersonCard>;
          }
          return <section className="unit-calling" key={title.id} aria-labelledby={`assignment-title-${title.id}`}>
            <header className="unit-calling-heading">
              <h3 id={`assignment-title-${title.id}`}>{title.name}</h3>
              <button type="button" className="icon-button" aria-label={`Edit ${title.name} title`}
                onClick={() => setEditor({ resource: "organization_titles", organizationId, row: title })}>
                <Pencil size={16} aria-hidden />
              </button>
            </header>
            <ul className="unit-holder-grid" aria-label={`${title.name} holders and vacancies`}>
              {active.map(holderCard)}
              <li className="panel unit-holder-vacant">
                <button type="button" className="unit-vacancy-content unit-vacancy-add" aria-label={`Assign a person as ${title.name}`}
                  onClick={() => setEditor({ resource: "organization_assignments", organizationId, title, holders })}>
                  <span className="unit-holder-icon"><Plus size={19} aria-hidden /></span>
                  <strong>{active.length ? "Add another person" : title.name}</strong>
                </button>
              </li>
            </ul>
            {inactive.length > 0 && <details className="unit-calling-details">
              <summary className="text-button"><ChevronDown size={16} aria-hidden />Inactive assignments ({inactive.length})</summary>
              <ul className="unit-holder-grid" aria-label={`Inactive ${title.name} assignments`}>{inactive.map(holderCard)}</ul>
            </details>}
          </section>;
        })}
      </div> : <p className="panel empty">Add an assignment title to start assigning people.</p>}
  </section>;
}

function OrganizationEvents({ events, loadError, edit }: {
  events: OrganizationEvent[]; loadError: string | null; edit: (event: OrganizationEvent) => void;
}) {
  const { today, minute } = visitClock();
  const sorted = [...events].sort((a, b) => a.event_date.localeCompare(b.event_date) ||
    (a.start_minute ?? -1) - (b.start_minute ?? -1) || a.title.localeCompare(b.title));
  const past = sorted.filter((event) => event.event_date < today || (event.event_date === today &&
    (event.end_minute ?? event.start_minute ?? 1440) < minute));
  const pastIds = new Set(past.map(({ id }) => id));
  const upcoming = sorted.filter(({ id }) => !pastIds.has(id));

  function eventRow(event: OrganizationEvent) {
    return <li key={event.id}>
      <CalendarDays size={18} aria-hidden />
      <div><strong>{event.title}</strong>
        <span><time dateTime={event.event_date}>{journalEntryDateLabel(event.event_date)}</time>
          {event.start_minute !== null && ` · ${formatVisitTime(event.start_minute)}`}
          {event.end_minute !== null && ` – ${formatVisitTime(event.end_minute)}`}</span>
        {event.notes && <p className="unit-notes">{event.notes}</p>}
      </div>
      <button type="button" className="icon-button" aria-label={`Edit ${event.title}`} onClick={() => edit(event)}>
        <Pencil size={16} aria-hidden />
      </button>
    </li>;
  }

  return <section className="panel unit-events" aria-labelledby="organization-events-heading">
    <h2 id="organization-events-heading">Events</h2>
    {loadError ? <p className="notice error" role="alert">{loadError}</p> : <>
      {upcoming.length ? <ul className="management-list unit-event-list">{upcoming.map(eventRow)}</ul> :
        <p className="muted">No upcoming events.</p>}
      {past.length > 0 && <details className="unit-event-history">
        <summary>Past events</summary>
        <ul className="management-list unit-event-list">{past.reverse().map(eventRow)}</ul>
      </details>}
    </>}
  </section>;
}
