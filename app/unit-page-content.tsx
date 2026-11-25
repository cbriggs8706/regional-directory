"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpen, CalendarDays, ChartNoAxesColumn, ChevronDown, ChevronRight, ChartLine, Clock3, Globe, History, Maximize2, Pencil, UserPlus } from "lucide-react";
import { abbreviatedUnitName, buildingPhotoUrl, formatBuildingAddress, hasSacramentMeeting, unitLabels, unitNameWithType, type Directory, type Unit } from "../lib/directory";
import { scopeWards, type FamilyHistoryReport } from "../lib/family-history";
import type { FocusActivityData } from "../lib/focus-people";
import type { GetInvolvedData } from "../lib/get-involved";
import type { UnitJournalData } from "../lib/unit-journal";
import { todayInVisitZone, type UnitVisitData } from "../lib/visits";
import { Modal, type EditorState } from "./editor";
import { AddMenu } from "./add-menu";
import { AddressLink } from "./address-link";
import { FocusPeople } from "./focus-people";
import { FamilyHistoryDashboard } from "./family-history-dashboard";
import { GetInvolvedReports } from "./get-involved-reports";
import { UnitCallings } from "./unit-callings";
import { UnitEvents } from "./unit-events";
import { UnitFacts } from "./unit-facts";
import { UnitJournal } from "./unit-journal";
import { UnitSectionHeading } from "./unit-section-heading";
import { StakeUnits } from "./stake-units";
import { VisitEditor, type VisitEditorEntry } from "./visit-editor";

const unitSections = ["overview", "reports", "get-involved", "units", "callings", "focus"] as const;
const defaultSection = unitSections[0];

export function UnitPageContent({ unit, directory, edit, familyHistory, journal, focusActivity, getInvolved, visits, userId, addHost }: {
  unit: Unit;
  directory: Directory;
  edit: (state: EditorState) => void;
  familyHistory: { reports: FamilyHistoryReport[]; loadError: string | null; currentMonth: string };
  journal: UnitJournalData | null;
  focusActivity: FocusActivityData | null;
  getInvolved: GetInvolvedData | null;
  visits: UnitVisitData | null;
  userId: string;
  addHost: HTMLElement | null;
}) {
  const searchParams = useSearchParams();
  const [showBuildingPhoto, setShowBuildingPhoto] = useState(false);
  const [reportView, setReportView] = useState<"aggregate" | "comparison">("aggregate");
  const [newEntry, setNewEntry] = useState<"journal" | "report" | "submitter-history" | "get-involved" | null>(null);
  const [visitEditor, setVisitEditor] = useState<VisitEditorEntry | null>(null);
  const [visitStatus, setVisitStatus] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const buildingCover = useRef<HTMLButtonElement>(null);
  const sectionNav = useRef<HTMLElement>(null);
  const currentSectionLink = useRef<HTMLAnchorElement>(null);
  const unitSwitcher = useRef<HTMLDetailsElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
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
  const isHigherUnit = isArea || unit.kind === "council";
  const sectionLabels = {
    overview: "Overview",
    callings: isStake ? "Stake Callings" : isWardOrBranch ? "Ward Callings" : "Callings",
    reports: isArea ? "Area FHAR" : isHigherUnit ? "Council FHAR" : isStake ? "Stake FHAR" : "Ward FHAR",
    "get-involved": "Get Involved",
    units: "Units",
    focus: "Focus People",
  };
  const sections = unitSections.filter((id) => (id !== "focus" || isWardOrBranch) && (id !== "units" || !isWardOrBranch));
  const requestedSection = searchParams.get("section");
  const section = sections.find((id) => id === requestedSection) ?? defaultSection;
  useEffect(() => {
    const nav = sectionNav.current;
    const current = currentSectionLink.current;
    if (!nav || !current) return;
    const start = current.offsetLeft;
    const end = start + current.offsetWidth;
    if (start < nav.scrollLeft) nav.scrollLeft = start;
    else if (end > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = end - nav.clientWidth;
  }, [section]);
  const building = directory.buildings.find(({ id }) => id === unit.building_id);
  const buildingPhoto = building?.photo_path ? buildingPhotoUrl(building) : null;
  const buildingAddress = building ? formatBuildingAddress(building) : null;
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
  const ancestors: Unit[] = [];
  const seen = new Set([unit.id]);
  let parent = parentUnit;
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    ancestors.unshift(parent);
    parent = units.get(parent.parent_id ?? "");
  }

  function sectionHref(next: typeof section) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === defaultSection) params.delete("section");
    else params.set("section", next);
    const query = params.toString();
    return `/units/${unit.id}${query ? `?${query}` : ""}`;
  }

  function showSection(next: typeof section) {
    if (next !== section || window.location.hash) window.history.replaceState(null, "", sectionHref(next));
  }

  function closeUnitSwitcher() {
    const switcher = unitSwitcher.current;
    if (!switcher) return;
    switcher.open = false;
    switcher.querySelector("summary")?.focus();
  }

  const scopedWards = scopeWards(directory.units, unit);
  const canAddReport = !familyHistory.loadError && scopedWards.length > 0;
  const canAddGetInvolved = getInvolved && !getInvolved.loadError && scopedWards.length > 0;

  function openEntry(next: NonNullable<typeof newEntry>, section: typeof unitSections[number]) {
    showSection(section);
    setNewEntry(next);
  }
  const canAddConference = isStake || (isWardOrBranch && directory.ward_conferences !== null);
  const wardConferences = isWardOrBranch
    ? directory.ward_conferences?.filter(({ unit_id }) => unit_id === unit.id) ?? null
    : [];

  return <div className="unit-page">
    {ancestors.length > 0 && <nav className="unit-ancestry" aria-label="Unit breadcrumb">
      <ol>
        {ancestors.map((ancestor, index) => <li key={ancestor.id}>
          {index > 0 && <span aria-hidden="true">/</span>}
          <Link href={`/units/${ancestor.id}`} prefetch={false} title={ancestor.name}>
            {abbreviatedUnitName(ancestor)}
          </Link>
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
                <Link href={`/units/${id}${section === defaultSection ? "" : `?section=${section}`}`} prefetch={false}
                  aria-current={id === unit.id ? "page" : undefined}
                  onNavigate={(event) => {
                    if (id === unit.id) {
                      event.preventDefault();
                      closeUnitSwitcher();
                    }
                  }}>{name}</Link>
              </li>)}
            </ul>
          </details>
        </li>}
      </ol>
    </nav>}
    <header className="panel unit-overview">
      {buildingPhoto && <div className="unit-building-hero">
        <button ref={buildingCover} type="button" className="unit-building-cover" aria-label="Enlarge building photo"
          aria-haspopup="dialog" onClick={() => setShowBuildingPhoto(true)}>
          <Image src={buildingPhoto} fill alt="" unoptimized />
          <span className="unit-building-cover-expand"><Maximize2 size={16} aria-hidden /></span>
        </button>
        <div className="unit-building-tags"><UnitFacts unit={unit} languagesById={languagesById} /></div>
      </div>}
      <div className="unit-heading-row">
        <h1 ref={heading} tabIndex={-1}>{unitNameWithType(unit)}</h1>
        <div className="unit-heading-actions">
          <button type="button" className="icon-button" aria-label={`Edit ${unitNameWithType(unit)}`} title="Edit unit"
            onClick={() => edit({ resource: "units", row: unit })}>
            <Pencil size={18} aria-hidden />
          </button>
          {unit.website_url && <a className="icon-button" href={unit.website_url} target="_blank" rel="noopener noreferrer"
            aria-label="Unit website" title="Unit website"><Globe size={19} aria-hidden /></a>}
        </div>
      </div>
      {buildingAddress && <p className="unit-heading-address"><AddressLink address={buildingAddress} /></p>}
      {!buildingPhoto && <UnitFacts unit={unit} languagesById={languagesById} />}
    </header>
    {showBuildingPhoto && buildingPhoto && <Modal title="Building photo" className="unit-building-modal"
      close={() => {
        setShowBuildingPhoto(false);
        requestAnimationFrame(() => buildingCover.current?.focus());
      }}>
      <div className="unit-building-modal-photo">
        <Image src={buildingPhoto} fill alt={`Building at ${buildingAddress}`} unoptimized />
      </div>
      {buildingAddress && <p className="unit-building-modal-address"><AddressLink address={buildingAddress} /></p>}
    </Modal>}
    <nav ref={sectionNav} className="unit-page-switch" aria-label="Unit sections">
      {sections.map((id) => (
        <Link key={id} ref={section === id ? currentSectionLink : undefined} href={sectionHref(id)} prefetch={false}
          aria-current={section === id ? "page" : undefined} onNavigate={(event) => { event.preventDefault(); showSection(id); }}>
          {sectionLabels[id]}
        </Link>
      ))}
    </nav>
    {section === "callings" && <UnitCallings unit={unit} directory={directory} edit={edit} title={sectionLabels.callings} />}
    {section === "reports" && <FamilyHistoryDashboard {...familyHistory} units={directory.units} fixedUnit={unit}
      comparisonUnits={comparisonUnits} viewControls={viewControls}
      entryDialog={{ open: newEntry === "report", close: () => setNewEntry(null) }}
      historyDialog={{ open: newEntry === "submitter-history", close: () => setNewEntry(null) }} />}
    {section === "get-involved" && getInvolved && <GetInvolvedReports
      wards={scopedWards.sort((a, b) => a.name.localeCompare(b.name))} unit={unit}
      comparison={comparisonUnits?.map((target) => ({ name: target.name, wards: scopeWards(directory.units, target) }))}
      data={getInvolved} currentMonth={familyHistory.currentMonth} viewControls={viewControls}
      entryDialog={{ open: newEntry === "get-involved", close: () => setNewEntry(null) }} />}
    {section === "focus" && <FocusPeople unit={unit} currentMonth={familyHistory.currentMonth} history={focusActivity} edit={edit}
      contacts={directory.contacts.filter((person) => person.focus_type && person.ward_id === unit.id)
        .sort((a, b) => a.name.localeCompare(b.name))} />}
    {section === "units" && (isStake
      ? <StakeUnits stake={unit} directory={directory} languagesById={languagesById} />
      : <section className="unit-tab-section" aria-labelledby="child-units-heading">
        <UnitSectionHeading id="child-units-heading" title="Units" unit={unit} />
        {childUnits.length ? <ul className="child-unit-grid">
          {childUnits.map((child) => <li key={child.id}>
            <Link href={`/units/${child.id}`} prefetch={false} className="panel child-unit-card">
              <span className="child-unit-caption">
                <span className="unit-node-title"><strong>{child.name}</strong><small>{unitLabels[child.kind]}</small></span>
                <ChevronRight size={19} aria-hidden />
              </span>
            </Link>
          </li>)}
        </ul> : <p className="panel empty">{isArea ? "This region has no coordinating councils yet." : "This coordinating council has no stakes yet."}</p>}
      </section>)}
    {section === "overview" && <section className="unit-tab-section" aria-labelledby="unit-overview-heading">
      <UnitSectionHeading id="unit-overview-heading" title="Overview" unit={unit} />
      {visitStatus && <p className="notice" role="status">{visitStatus}</p>}
      {visits && <UnitEvents unit={unit} stake={conferenceStake}
        conferences={directory.stake_conferences.filter(({ stake_id }) => stake_id === conferenceStake?.id)}
        wardConferences={wardConferences} visits={visits} userId={userId} edit={edit}
        openVisit={(event) => { setVisitStatus(""); setVisitEditor({ unit, day: event.event_date, event }); }} />}
      {journal && <UnitJournal unitId={unit.id} journal={journal} newEntryOpen={newEntry === "journal"} closeNewEntry={() => setNewEntry(null)} />}
      {unit.notes && <section className="panel unit-page-notes"><h2>Notes</h2><p className="unit-notes">{unit.notes}</p></section>}
    </section>}
    <AddMenu host={addHost} label="Add to unit" actions={[
      { label: "New journal entry", Icon: BookOpen, hidden: !journal || Boolean(journal.loadError), run: () => openEntry("journal", "overview") },
      { label: "Add focus person", Icon: UserPlus, hidden: !isWardOrBranch, run: () => {
        showSection("focus");
        edit({ resource: "contacts", ward: unit });
      } },
      { label: "Enter report", Icon: ChartNoAxesColumn, hidden: !canAddReport, run: () => openEntry("report", "reports") },
      { label: "Enter submitter history", Icon: History, hidden: !canAddReport, run: () => openEntry("submitter-history", "reports") },
      { label: "Enter Get Involved counts", Icon: ChartLine, hidden: !canAddGetInvolved, run: () => openEntry("get-involved", "get-involved") },
      { label: "Add conference", Icon: CalendarDays, hidden: !canAddConference, run: () => {
        showSection("overview");
        edit({ resource: isStake ? "stake_conferences" : "ward_conferences", unit });
      } },
      { label: "Schedule a visit", Icon: Clock3, run: () => {
        showSection("overview");
        setVisitStatus("");
        setVisitEditor({ unit, day: todayInVisitZone() });
      } },
    ]} />
    {visitEditor && <VisitEditor entry={visitEditor} editable={!visitEditor.event || visitEditor.event.owner_id === userId}
      building={building} close={() => setVisitEditor(null)} done={(_day, message) => {
        setVisitEditor(null);
        setVisitStatus(message);
      }} />}
  </div>;
}
