"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, ChartLine, ChartNoAxesColumn, ChevronRight, ExternalLink, Maximize2, Pencil, Tags, Users } from "lucide-react";
import { abbreviatedUnitName, buildingPhotoUrl, formatBuildingAddress, hasSacramentMeeting, unitLabels, type Directory, type Unit } from "../lib/directory";
import { scopeWards, type FamilyHistoryReport } from "../lib/family-history";
import type { FocusActivityData } from "../lib/focus-people";
import type { GetInvolvedData } from "../lib/get-involved";
import type { UnitJournalData } from "../lib/unit-journal";
import { Modal, type EditorState } from "./editor";
import { FocusPeople } from "./focus-people";
import { FamilyHistoryDashboard } from "./family-history-dashboard";
import { GetInvolvedReports } from "./get-involved-reports";
import { UnitCallings } from "./unit-callings";
import { UnitConferences } from "./unit-conferences";
import { UnitFacts } from "./unit-facts";
import { UnitJournal } from "./unit-journal";
import { StakeUnits } from "./stake-units";

const unitSections = [
  { id: "reports", Icon: ChartNoAxesColumn },
  { id: "get-involved", Icon: ChartLine },
  { id: "units", Icon: Building2 },
  { id: "callings", Icon: Tags },
  { id: "focus", Icon: Users },
] as const;

export function UnitPageContent({ unit, directory, edit, familyHistory, journal, focusActivity, getInvolved }: {
  unit: Unit;
  directory: Directory;
  edit: (state: EditorState) => void;
  familyHistory: { reports: FamilyHistoryReport[]; loadError: string | null; currentMonth: string };
  journal: UnitJournalData | null;
  focusActivity: FocusActivityData | null;
  getInvolved: GetInvolvedData | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showBuildingPhoto, setShowBuildingPhoto] = useState(false);
  const [reportView, setReportView] = useState<"aggregate" | "comparison">("aggregate");
  const heading = useRef<HTMLHeadingElement>(null);
  const buildingCover = useRef<HTMLButtonElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const isStake = unit.kind === "stake";
  const isWardOrBranch = hasSacramentMeeting(unit.kind);
  const isArea = unit.kind === "region";
  const isHigherUnit = isArea || unit.kind === "council";
  const sectionLabels = {
    callings: isStake ? "Stake Callings" : isWardOrBranch ? "Ward Callings" : "Callings",
    reports: isArea ? "Area FHAR" : isHigherUnit ? "Council FHAR" : isStake ? "Stake FHAR" : "Ward FHAR",
    "get-involved": "Get Involved",
    units: "Units",
    focus: "Focus People",
  };
  const sections = unitSections.filter(({ id }) => (id !== "focus" || isWardOrBranch) && (id !== "units" || !isWardOrBranch));
  const defaultSection = "reports";
  const requestedSection = searchParams.get("section");
  const section = sections.find(({ id }) => id === requestedSection)?.id ?? defaultSection;
  const building = directory.buildings.find(({ id }) => id === unit.building_id);
  const buildingPhoto = building?.photo_path ? buildingPhotoUrl(building) : null;
  const buildingAddress = building ? formatBuildingAddress(building) : null;
  const languageNames = new Map(directory.languages.map(({ id, name }) => [id, name]));
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

  function showSection(next: typeof section) {
    if (next === section) return;
    const url = new URL(window.location.href);
    if (next === defaultSection) url.searchParams.delete("section");
    else url.searchParams.set("section", next);
    window.history.replaceState(null, "", url);
  }

  return <div className="unit-page">
    <header className="panel unit-overview">
      {ancestors.length > 0 && <nav className="unit-ancestry" aria-label="Unit breadcrumb">
        <ol>
          {ancestors.map((ancestor, index) => <li key={ancestor.id}>
            {index > 0 && <span aria-hidden="true">/</span>}
            <Link href={`/units/${ancestor.id}`} prefetch={false} title={ancestor.name}>
              {abbreviatedUnitName(ancestor)}
            </Link>
          </li>)}
          <li className="unit-ancestry-current" aria-current="page">
            <span aria-hidden="true">/</span>
            {stakeUnits.length > 1 ? <select aria-label={`Switch ward or branch in ${conferenceStake?.name}`} value={unit.id}
              onChange={(event) => router.push(`/units/${event.target.value}${section === defaultSection ? "" : `?section=${section}`}`)}>
              {stakeUnits.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select> : <span>{unit.name}</span>}
          </li>
        </ol>
      </nav>}
      <div className="section-heading">
        <div>
          <h1 ref={heading} tabIndex={-1}>{unit.name}</h1>
          <p>{unitLabels[unit.kind]}</p>
        </div>
        <button className="button" aria-label={`Edit ${unit.name}`} onClick={() => edit({ resource: "units", row: unit })}>
          <Pencil size={17} aria-hidden />Edit unit
        </button>
      </div>
      {building && <div className="unit-overview-building">
        {buildingPhoto && <button ref={buildingCover} type="button" className="unit-building-cover" aria-label="Enlarge building photo"
          aria-haspopup="dialog" onClick={() => setShowBuildingPhoto(true)}>
          <Image src={buildingPhoto} fill alt="" unoptimized />
          <span className="unit-building-cover-expand"><Maximize2 size={19} aria-hidden /></span>
        </button>}
        <div className="unit-building-caption">
          {!buildingPhoto && <span className="unit-overview-building-icon"><Building2 size={22} aria-hidden /></span>}
          <div>
            <small>Assigned building</small>
            <p>{buildingAddress}</p>
          </div>
        </div>
      </div>}
      <UnitFacts unit={unit} languageNames={languageNames} />
      {unit.website_url && <div className="toolbar">
        <a className="button" href={unit.website_url} target="_blank" rel="noopener noreferrer">
          Unit website <ExternalLink size={17} aria-hidden />
        </a>
      </div>}
      {unit.notes && <section className="unit-page-notes"><h2>Notes</h2><p className="unit-notes">{unit.notes}</p></section>}
      {(conferenceStake || isWardOrBranch) && <div className="unit-conference-panels">
        {conferenceStake && <UnitConferences unit={conferenceStake}
          conferences={directory.stake_conferences.filter(({ stake_id }) => stake_id === conferenceStake.id)}
          edit={isStake ? edit : undefined} />}
        {isWardOrBranch && <UnitConferences unit={unit}
          conferences={directory.ward_conferences?.filter(({ unit_id }) => unit_id === unit.id) ?? null} edit={edit} />}
      </div>}
    </header>
    {showBuildingPhoto && buildingPhoto && <Modal title="Assigned building" className="unit-building-modal"
      close={() => {
        setShowBuildingPhoto(false);
        requestAnimationFrame(() => buildingCover.current?.focus());
      }}>
      <div className="unit-building-modal-photo">
        <Image src={buildingPhoto} fill alt={`Building at ${buildingAddress}`} unoptimized />
      </div>
      <p className="unit-building-modal-address">{buildingAddress}</p>
    </Modal>}
    {journal && <UnitJournal unitId={unit.id} journal={journal} />}
    <div className="unit-page-switch" role="group" aria-label="Unit sections">
      {sections.map(({ id, Icon }) => (
        <button key={id} className="button" aria-pressed={section === id} onClick={() => showSection(id)}>
          <Icon size={19} aria-hidden />{sectionLabels[id]}
        </button>
      ))}
    </div>
    {section === "callings" && <UnitCallings unit={unit} directory={directory} edit={edit} title={sectionLabels.callings} />}
    {section === "reports" && <FamilyHistoryDashboard {...familyHistory} units={directory.units} fixedUnit={unit}
      comparisonUnits={comparisonUnits} viewControls={viewControls} />}
    {section === "get-involved" && getInvolved && <GetInvolvedReports
      wards={scopeWards(directory.units, unit).sort((a, b) => a.name.localeCompare(b.name))}
      scopeName={unit.name}
      comparison={comparisonUnits?.map((target) => ({ name: target.name, wards: scopeWards(directory.units, target) }))}
      data={getInvolved} currentMonth={familyHistory.currentMonth} viewControls={viewControls} />}
    {section === "focus" && <FocusPeople unit={unit} currentMonth={familyHistory.currentMonth} history={focusActivity} edit={edit}
      contacts={directory.contacts.filter((person) => person.focus_type && person.ward_id === unit.id)
        .sort((a, b) => a.name.localeCompare(b.name))} />}
    {section === "units" && (isStake
      ? <StakeUnits stake={unit} units={directory.units} buildings={directory.buildings} languageNames={languageNames} />
      : <section aria-labelledby="child-units-heading">
        <h2 id="child-units-heading" className="unit-section-heading">Units</h2>
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
  </div>;
}
