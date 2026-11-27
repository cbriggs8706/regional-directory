"use client";

import { useEffect, useRef, useState } from "react";
import { RouteLink } from "./route-navigation";
import { BookOpen, CalendarDays, ChartNoAxesColumn, ChevronDown, ChevronRight, ChartLine, Clock3, History, UserPlus } from "lucide-react";
import { abbreviatedUnitName, hasSacramentMeeting, unitFacebookUrls, unitLabels, unitLineage, unitNameWithType, type Directory, type Unit } from "../lib/directory";
import { scopeWards } from "../lib/family-history";
import { isOrganizationAgent, type OrganizationDirectory } from "../lib/organizations";
import { todayInVisitZone } from "../lib/visits";
import type { UnitDetailLoad } from "./directory-page";
import type { EditorState } from "./editor";
import { AddMenu } from "./add-menu";
import { BuildingPageHeader } from "./building-page-header";
import { FocusPeople } from "./focus-people";
import { FamilyHistoryDashboard } from "./family-history-dashboard";
import { GetInvolvedReports } from "./get-involved-reports";
import { OrganizationList } from "./organizations-view";
import { PageSectionTabs, usePageSection } from "./page-section-tabs";
import { PendingContent, SectionSkeleton } from "./pending-content";
import { UnitCallings } from "./unit-callings";
import { UnitEvents } from "./unit-events";
import { UnitFacts } from "./unit-facts";
import { UnitJournal } from "./unit-journal";
import { UnitSectionHeading } from "./unit-section-heading";
import { StakeUnits } from "./stake-units";
import { VisitEditor, type VisitEditorEntry } from "./visit-editor";

const unitSections = ["overview", "reports", "get-involved", "units", "callings", "focus", "stewardships"] as const;
const defaultSection = unitSections[0];

export function UnitPageContent({ unit, directory, edit, data, currentMonth, userId, addHost, admin, organizationDirectory }: {
  unit: Unit;
  directory: Directory;
  edit: (state: EditorState) => void;
  data: UnitDetailLoad;
  currentMonth: string;
  userId: string;
  admin: boolean;
  addHost: HTMLElement | null;
  organizationDirectory: OrganizationDirectory;
}) {
  const [reportView, setReportView] = useState<"aggregate" | "comparison">("aggregate");
  const [newEntry, setNewEntry] = useState<"journal" | "report" | "submitter-history" | "get-involved" | null>(null);
  const [visitEditor, setVisitEditor] = useState<VisitEditorEntry | null>(null);
  const [visitStatus, setVisitStatus] = useState("");
  const unitSwitcher = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function closeOnOutsidePress(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      const switcher = unitSwitcher.current;
      if (switcher?.open && !switcher.contains(event.target)) switcher.open = false;
    }
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, []);
  const isStake = unit.kind === "stake";
  const isWardOrBranch = hasSacramentMeeting(unit.kind);
  const isArea = unit.kind === "region";
  const isMemberArea = isArea && !admin;
  const isHigherUnit = isArea || unit.kind === "council";
  const sectionLabels = {
    overview: "Overview",
    callings: isStake ? "Stake Callings" : isWardOrBranch ? "Ward Callings" : "Callings",
    reports: isArea ? "Area FHAR" : isHigherUnit ? "Council FHAR" : isStake ? "Stake FHAR" : "Ward FHAR",
    "get-involved": "Get Involved",
    units: "Units",
    focus: "Focus People",
    stewardships: "Stewardships",
  };
  const sections = isMemberArea ? (["reports", "get-involved", "units", "callings"] as const) : unitSections.filter((id) => (id !== "focus" || isWardOrBranch) && (id !== "units" || !isWardOrBranch) &&
    (id !== "stewardships" || isOrganizationAgent(unit.kind)));
  const sectionNavigation = usePageSection<(typeof unitSections)[number]>(`/units/${unit.id}`, sections, isMemberArea ? "reports" : defaultSection);
  const { section, showSection } = sectionNavigation;
  const building = directory.buildings.find(({ id }) => id === unit.building_id);
  const languagesById = new Map(directory.languages.map((language) => [language.id, language]));
  const units = new Map(directory.units.map((entry) => [entry.id, entry]));
  const childUnits = directory.units.filter(({ parent_id, kind }) => parent_id === unit.id &&
    (isArea ? kind === "council" : isHigherUnit ? kind === "stake" : hasSacramentMeeting(kind)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const comparisonUnits = reportView === "comparison" && childUnits.length ? childUnits : undefined;
  const viewControls = childUnits.length > 0 && (
    <div className="unit-report-scopes" role="group" aria-label="Report view">
      <button type="button" className="button" aria-pressed={reportView === "aggregate"} onClick={() => setReportView("aggregate")}>Aggregate</button>
      <button type="button" className="button" aria-pressed={reportView === "comparison"} onClick={() => setReportView("comparison")}>Comparison</button>
    </div>
  );
  const parentUnit = units.get(unit.parent_id ?? "");
  const conferenceStake = isStake ? unit : isWardOrBranch && parentUnit?.kind === "stake" ? parentUnit : undefined;
  const stakeUnits = isWardOrBranch && conferenceStake ? directory.units
    .filter(({ parent_id, kind }) => parent_id === conferenceStake.id && hasSacramentMeeting(kind))
    .sort((a, b) => a.name.localeCompare(b.name)) : [];
  const lineage = unitLineage(unit, units);
  const ancestors = lineage.slice(0, -1);

  function closeUnitSwitcher() {
    const switcher = unitSwitcher.current;
    if (!switcher) return;
    switcher.open = false;
    switcher.querySelector("summary")?.focus();
  }

  const scopedWards = scopeWards(directory.units, unit);

  function openEntry(next: NonNullable<typeof newEntry>, section: typeof unitSections[number]) {
    showSection(section);
    setNewEntry(next);
  }
  return <div className="unit-page">
    {ancestors.length > 0 && <nav className="unit-ancestry" aria-label="Unit breadcrumb">
      <ol>
        {ancestors.map((ancestor, index) => <li key={ancestor.id}>
          {index > 0 && <span aria-hidden="true">/</span>}
          <RouteLink href={`/units/${ancestor.id}`} title={ancestor.name}>
            {abbreviatedUnitName(ancestor)}
          </RouteLink>
        </li>)}
        {stakeUnits.length > 1 && <li className="unit-ancestry-current">
          <span aria-hidden="true">/</span>
          <details ref={unitSwitcher} onKeyDown={(event) => {
            if (event.key === "Escape" && event.currentTarget.open) {
              event.preventDefault();
              closeUnitSwitcher();
            }
          }}>
            <summary aria-label={`Switch ward or branch. Current unit: ${unit.name}`}>
              <span>{unit.name}</span><ChevronDown size={15} aria-hidden />
            </summary>
            <ul className="panel unit-switcher-list" aria-label="Wards and branches">
              {stakeUnits.map(({ id, name }) => <li key={id}>
                <RouteLink href={`/units/${id}${section === defaultSection ? "" : `?section=${section}`}`}
                  aria-current={id === unit.id ? "page" : undefined}
                  onNavigate={(event) => {
                    if (id === unit.id) {
                      event.preventDefault();
                      closeUnitSwitcher();
                    }
                  }}>{name}</RouteLink>
              </li>)}
            </ul>
          </details>
        </li>}
      </ol>
    </nav>}
    <BuildingPageHeader name={unitNameWithType(unit)} recordLabel="Unit" building={building} website={unit.website_url}
      socialLinks={unitFacebookUrls(unit).map((url) => ({ channel: "facebook", url }))}
      facts={<UnitFacts unit={unit} languagesById={languagesById} />}
      edit={isMemberArea ? undefined : () => edit({ resource: "units", row: unit })} />
    <PageSectionTabs label="Unit sections" sections={sections} labels={sectionLabels} {...sectionNavigation} />
    {section === "callings" && <UnitCallings unit={unit} directory={directory} edit={edit} title={sectionLabels.callings} admin={admin} />}
    {section === "stewardships" && <section className="unit-tab-section" aria-labelledby="stewardships-heading">
      <UnitSectionHeading id="stewardships-heading" title="Stewardships" unit={unit} />
      {organizationDirectory.loadError ? <p className="notice error" role="alert">{organizationDirectory.loadError}</p> :
        <OrganizationList organizations={organizationDirectory.organizations.filter(({ agent_id }) => agent_id === unit.id)} />}
    </section>}
    {section === "reports" && <PendingContent data={data.familyHistory} fallback={<SectionSkeleton label={sectionLabels.reports} chart />}>
      {(reports) => <FamilyHistoryDashboard {...reports} units={directory.units} fixedUnit={unit} currentMonth={currentMonth}
        comparisonUnits={comparisonUnits} viewControls={viewControls}
        entryDialog={{ open: newEntry === "report", close: () => setNewEntry(null) }}
        historyDialog={{ open: newEntry === "submitter-history", close: () => setNewEntry(null) }} />}
    </PendingContent>}
    {section === "get-involved" && <PendingContent data={data.getInvolved} fallback={<SectionSkeleton label="Get Involved reports" chart />}>
      {(reports) => <GetInvolvedReports wards={[...scopedWards].sort((a, b) => a.name.localeCompare(b.name))} unit={unit}
        comparison={comparisonUnits?.map((target) => ({ name: target.name, wards: scopeWards(directory.units, target) }))}
        data={reports} currentMonth={currentMonth} viewControls={viewControls}
        entryDialog={{ open: newEntry === "get-involved", close: () => setNewEntry(null) }} />}
    </PendingContent>}
    {section === "focus" && <PendingContent data={data.focusActivity} fallback={<SectionSkeleton label="Focus People" />}>
      {(history) => <FocusPeople unit={unit} currentMonth={currentMonth} history={history} edit={edit}
        contacts={directory.contacts.filter((person) => person.focus_type && person.ward_id === unit.id)
          .sort((a, b) => a.name.localeCompare(b.name))} />}
    </PendingContent>}
    {section === "units" && (isStake
      ? <StakeUnits stake={unit} directory={directory} languagesById={languagesById} />
      : <section className="unit-tab-section" aria-labelledby="child-units-heading">
        <UnitSectionHeading id="child-units-heading" title="Units" unit={unit} />
        {childUnits.length ? <ul className="child-unit-grid">
          {childUnits.map((child) => <li key={child.id}>
            <RouteLink href={`/units/${child.id}`} className="panel child-unit-card">
              <span className="child-unit-caption">
                <span className="unit-node-title"><strong>{child.name}</strong><small>{unitLabels[child.kind]}</small></span>
                <ChevronRight size={19} aria-hidden />
              </span>
            </RouteLink>
          </li>)}
        </ul> : <p className="panel empty">{isMemberArea ? "You have no coordinating councils assigned in this area."
          : isArea ? "This region has no coordinating councils yet." : "This coordinating council has no stakes yet."}</p>}
      </section>)}
    {section === "overview" && <section className="unit-tab-section" aria-labelledby="unit-overview-heading">
      <UnitSectionHeading id="unit-overview-heading" title="Overview" unit={unit} />
      {visitStatus && <p className="notice" role="status">{visitStatus}</p>}
      <PendingContent data={data.events} fallback={<SectionSkeleton label="events and visits" />}>
        {([visits, wardConferences]) => <UnitEvents unit={unit} stake={conferenceStake}
          conferences={directory.stake_conferences.filter(({ stake_id }) => stake_id === conferenceStake?.id)}
          wardConferences={wardConferences} visits={visits} userId={userId} edit={edit}
          openVisit={(event) => { setVisitStatus(""); setVisitEditor({ unit, day: event.event_date, event }); }} />}
      </PendingContent>
      <PendingContent key={data.journalPage ?? 0} data={data.journal} fallback={<SectionSkeleton id="unit-journal" label="journal" />}>
        {(journal) => <UnitJournal unitId={unit.id} journal={journal} newEntryOpen={newEntry === "journal"} closeNewEntry={() => setNewEntry(null)} />}
      </PendingContent>
      {unit.notes && <section className="panel unit-page-notes"><h2>Notes</h2><p className="unit-notes">{unit.notes}</p></section>}
    </section>}
    <AddMenu host={addHost} label="Add to unit" actions={[
      { label: "New journal entry", Icon: BookOpen, hidden: isMemberArea, availableWhen: data.canAddJournal, run: () => openEntry("journal", "overview") },
      { label: "Add focus person", Icon: UserPlus, hidden: !isWardOrBranch, run: () => {
        showSection("focus");
        edit({ resource: "contacts", ward: unit });
      } },
      { label: "Enter report", Icon: ChartNoAxesColumn, availableWhen: data.canAddFamilyHistory, run: () => openEntry("report", "reports") },
      { label: "Enter submitter history", Icon: History, availableWhen: data.canAddFamilyHistory, run: () => openEntry("submitter-history", "reports") },
      { label: "Enter Get Involved counts", Icon: ChartLine, availableWhen: data.canAddGetInvolved, run: () => openEntry("get-involved", "get-involved") },
      { label: "Add conference", Icon: CalendarDays, hidden: !isStake && !isWardOrBranch,
        availableWhen: isStake ? undefined : data.canAddWardConference, run: () => {
        showSection("overview");
        edit({ resource: isStake ? "stake_conferences" : "ward_conferences", unit });
      } },
      { label: "Schedule a visit", Icon: Clock3, hidden: isMemberArea, run: () => {
        showSection("overview");
        setVisitStatus("");
        setVisitEditor({ unit, day: todayInVisitZone() });
      } },
    ]} />
    {visitEditor && <VisitEditor entry={visitEditor} editable={!visitEditor.event || visitEditor.event.owner_id === userId}
      building={building} parentUnit={parentUnit} eventScope={lineage} close={() => setVisitEditor(null)} done={(_day, message) => {
        setVisitEditor(null);
        setVisitStatus(message);
      }} />}
  </div>;
}
