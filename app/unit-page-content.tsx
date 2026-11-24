"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Building2, ChartNoAxesColumn, ExternalLink, Maximize2, Pencil, Tags, Users } from "lucide-react";
import { abbreviatedUnitName, buildingPhotoUrl, formatBuildingAddress, hasSacramentMeeting, unitLabels, type Directory, type Unit } from "../lib/directory";
import type { FamilyHistoryReport } from "../lib/family-history";
import type { FocusActivityData } from "../lib/focus-people";
import type { UnitJournalData } from "../lib/unit-journal";
import { Modal, type EditorState } from "./editor";
import { FocusPeople } from "./focus-people";
import { FamilyHistoryDashboard } from "./family-history-dashboard";
import { UnitCallings } from "./unit-callings";
import { UnitConferences } from "./unit-conferences";
import { UnitFacts } from "./unit-facts";
import { UnitJournal } from "./unit-journal";
import { StakeUnits } from "./stake-units";

const unitSections = [
  { id: "reports", Icon: ChartNoAxesColumn },
  { id: "units", Icon: Building2 },
  { id: "callings", Icon: Tags },
  { id: "focus", Icon: Users },
] as const;

export function UnitPageContent({ unit, directory, edit, familyHistory, journal, focusActivity }: {
  unit: Unit;
  directory: Directory;
  edit: (state: EditorState) => void;
  familyHistory: { reports: FamilyHistoryReport[]; loadError: string | null; currentMonth: string };
  journal: UnitJournalData | null;
  focusActivity: FocusActivityData | null;
}) {
  const searchParams = useSearchParams();
  const [showBuildingPhoto, setShowBuildingPhoto] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const buildingCover = useRef<HTMLButtonElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const isStake = unit.kind === "stake";
  const isWardOrBranch = hasSacramentMeeting(unit.kind);
  const hasReports = isStake || isWardOrBranch;
  const sectionLabels = {
    callings: isStake ? "Stake Callings" : hasReports ? "Ward Callings" : "Callings",
    reports: isStake ? "Stake Reports" : "Ward Report",
    units: "Units",
    focus: "Focus People",
  };
  const sections = hasReports ? unitSections.filter(({ id }) => isStake ? id !== "focus" : id !== "units") : [];
  const defaultSection = sections[0]?.id ?? "callings";
  const requestedSection = searchParams.get("section");
  const section = sections.find(({ id }) => id === requestedSection)?.id ?? defaultSection;
  const building = directory.buildings.find(({ id }) => id === unit.building_id);
  const buildingPhoto = building?.photo_path ? buildingPhotoUrl(building) : null;
  const buildingAddress = building ? formatBuildingAddress(building) : null;
  const languageNames = new Map(directory.languages.map(({ id, name }) => [id, name]));
  const units = new Map(directory.units.map((entry) => [entry.id, entry]));
  const parentUnit = units.get(unit.parent_id ?? "");
  const conferenceStake = isStake ? unit : isWardOrBranch && parentUnit?.kind === "stake" ? parentUnit : undefined;
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
    <div className="toolbar">
      <Link href={`/?tab=units&unit=${unit.id}`} className="button"><ArrowLeft size={18} aria-hidden />Back to units</Link>
    </div>
    <header className="panel unit-overview">
      {ancestors.length > 0 && <nav className="unit-ancestry" aria-label="Unit breadcrumb">
        <ol>
          {ancestors.map((ancestor, index) => <li key={ancestor.id}>
            {index > 0 && <span aria-hidden="true">/</span>}
            <Link href={`/units/${ancestor.id}`} prefetch={false} title={ancestor.name}>
              {abbreviatedUnitName(ancestor)}
            </Link>
          </li>)}
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
    {hasReports && <div className="unit-page-switch" role="group" aria-label="Unit sections">
      {sections.map(({ id, Icon }) => (
        <button key={id} className="button" aria-pressed={section === id} onClick={() => showSection(id)}>
          <Icon size={19} aria-hidden />{sectionLabels[id]}
        </button>
      ))}
    </div>}
    {section === "callings" && <UnitCallings unit={unit} directory={directory} edit={edit} title={sectionLabels.callings} />}
    {section === "reports" && <FamilyHistoryDashboard {...familyHistory} units={directory.units} fixedUnit={unit} title={sectionLabels.reports} />}
    {section === "focus" && <FocusPeople unit={unit} currentMonth={familyHistory.currentMonth} history={focusActivity} edit={edit}
      contacts={directory.contacts.filter((person) => person.focus_type && person.ward_id === unit.id)
        .sort((a, b) => a.name.localeCompare(b.name))} />}
    {section === "units" && <StakeUnits stake={unit} units={directory.units} buildings={directory.buildings} languageNames={languageNames} />}
  </div>;
}
