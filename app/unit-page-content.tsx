"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Building2, ChartNoAxesColumn, ExternalLink, Pencil, Tags, Users } from "lucide-react";
import { buildingPhotoUrl, formatBuildingAddress, hasSacramentMeeting, unitLabels, type Directory, type Unit } from "../lib/directory";
import type { FamilyHistoryReport } from "../lib/family-history";
import type { FocusActivityData } from "../lib/focus-people";
import type { UnitJournalData } from "../lib/unit-journal";
import type { EditorState } from "./editor";
import { FocusPeople } from "./focus-people";
import { FamilyHistoryDashboard } from "./family-history-dashboard";
import { UnitCallings } from "./unit-callings";
import { UnitConferences } from "./unit-conferences";
import { UnitFacts } from "./unit-facts";
import { UnitJournal } from "./unit-journal";
import { StakeUnits } from "./stake-units";

const unitSections = [
  { id: "callings", Icon: Tags },
  { id: "reports", Icon: ChartNoAxesColumn },
  { id: "units", Icon: Building2 },
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
  const heading = useRef<HTMLHeadingElement>(null);
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
  const requestedSection = searchParams.get("section");
  const section = requestedSection === "units" && isStake ? "units"
    : requestedSection === "focus" && isWardOrBranch ? "focus"
    : requestedSection === "reports" && hasReports ? "reports" : "callings";
  const building = directory.buildings.find(({ id }) => id === unit.building_id);
  const languageNames = new Map(directory.languages.map(({ id, name }) => [id, name]));
  const units = new Map(directory.units.map((entry) => [entry.id, entry]));
  const parentUnit = units.get(unit.parent_id ?? "");
  const conferenceStake = isStake ? unit : isWardOrBranch && parentUnit?.kind === "stake" ? parentUnit : undefined;
  const ancestors: string[] = [];
  const seen = new Set([unit.id]);
  let parent = parentUnit;
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    const name = parent.kind === "region" || parent.kind === "council"
      ? parent.name.trim().split(/\s+/).map((word) => Array.from(word)[0]).join("").toUpperCase()
      : parent.name;
    ancestors.unshift(name);
    parent = units.get(parent.parent_id ?? "");
  }

  function showSection(next: typeof section) {
    if (next === section) return;
    const url = new URL(window.location.href);
    if (next === "callings") url.searchParams.delete("section");
    else url.searchParams.set("section", next);
    window.history.replaceState(null, "", url);
  }

  return <div className="unit-page">
    <div className="toolbar">
      <Link href={`/?tab=units&unit=${unit.id}`} className="button"><ArrowLeft size={18} aria-hidden />Back to units</Link>
    </div>
    <header className="panel unit-overview">
      {ancestors.length > 0 && <p className="unit-ancestry">{ancestors.join(" / ")}</p>}
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
        {building.photo_path
          ? <Image className="unit-overview-building-photo" src={buildingPhotoUrl(building)} width={110} height={72} alt="" unoptimized />
          : <span className="unit-overview-building-icon"><Building2 size={22} aria-hidden /></span>}
        <div>
          <small>Assigned building</small>
          <p>{formatBuildingAddress(building)}</p>
        </div>
      </div>}
      <UnitFacts unit={unit} languageNames={languageNames} />
      {unit.website_url && <div className="toolbar">
        <a className="button" href={unit.website_url} target="_blank" rel="noopener noreferrer">
          Unit website <ExternalLink size={17} aria-hidden />
        </a>
      </div>}
      {unit.notes && <section className="unit-page-notes"><h2>Notes</h2><p className="unit-notes">{unit.notes}</p></section>}
    </header>
    {journal && <UnitJournal unitId={unit.id} journal={journal} />}
    {(conferenceStake || isWardOrBranch) && <div className="unit-conference-panels">
      {conferenceStake && <UnitConferences unit={conferenceStake}
        conferences={directory.stake_conferences.filter(({ stake_id }) => stake_id === conferenceStake.id)}
        edit={isStake ? edit : undefined} />}
      {isWardOrBranch && <UnitConferences unit={unit}
        conferences={directory.ward_conferences?.filter(({ unit_id }) => unit_id === unit.id) ?? null} edit={edit} />}
    </div>}
    {hasReports && <div className="unit-page-switch" role="group" aria-label="Unit sections">
      {unitSections.filter(({ id }) => isStake ? id !== "focus" : id !== "units").map(({ id, Icon }) => (
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
