"use client";

import { useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Building2, ChevronDown, Eye, Pencil, Plus } from "lucide-react";
import { buildingPhotoUrl, formatBuildingAddress, hasSacramentMeeting, unitLabels, unitPath, type Building, type Language, type StakeConference, type Unit } from "../lib/directory";
import { addStakeUnits } from "./actions";
import { Modal, type EditorState } from "./editor";
import { UnitConferences } from "./unit-conferences";
import { UnitFacts } from "./unit-facts";

type UnitTreeProps = {
  childrenByParent: Map<string, Unit[]>;
  conferencesByStake: Map<string, StakeConference[]>;
  languageNames: Map<string, string>;
  buildingAddresses: Map<string, string>;
  edit: (state: EditorState) => void;
  browsePath: Set<string>;
};

function ViewUnitLink({ unit }: { unit: Unit }) {
  return <Link href={`/units/${unit.id}`} className="icon-button unit-view-link" prefetch={false}
    aria-label={`View ${unit.name}`} title={`View ${unit.name}`}><Eye size={19} aria-hidden /></Link>;
}

function UnitNode({ unit, childrenByParent, conferencesByStake, languageNames, buildingAddresses, edit, browsePath }: UnitTreeProps & { unit: Unit }) {
  const [expanded, setExpanded] = useState(browsePath.has(unit.id));
  const [addingUnits, setAddingUnits] = useState(false);
  const [addResult, setAddResult] = useState("");
  const children = childrenByParent.get(unit.id) ?? [];
  const childListId = `unit-children-${unit.id}`;
  const leaf = hasSacramentMeeting(unit.kind);
  const isStake = unit.kind === "stake";
  const canExpand = unit.kind === "council" || isStake || children.length > 0;
  const conferences = conferencesByStake.get(unit.id) ?? [];
  const address = unit.building_id ? buildingAddresses.get(unit.building_id) : undefined;
  const childType = unit.kind === "council" ? "stake" : "unit";
  const title = (
    <span className="unit-node-title">
      <strong>{unit.name}</strong>
      <small>{unitLabels[unit.kind]}{!leaf && ` · ${children.length} ${childType}${children.length === 1 ? "" : "s"}`}</small>
      <UnitFacts unit={unit} languageNames={languageNames} address={address} />
    </span>
  );
  return (
    <li className={`unit-node unit-node-${unit.kind}`}>
      <div className="unit-node-row">
        {canExpand
          ? <button type="button" className="unit-card unit-toggle" aria-expanded={expanded}
            aria-controls={childListId} onClick={() => setExpanded((open) => !open)}>
            {title}<ChevronDown size={20} aria-hidden />
          </button>
          : <Link href={`/units/${unit.id}`} className="unit-card" prefetch={false}>
            {title}<Eye size={19} aria-hidden />
          </Link>}
        <div className="unit-card-actions">
          {canExpand && <ViewUnitLink unit={unit} />}
          <button type="button" className="icon-button" aria-label={`Edit ${unit.name}`}
            onClick={() => edit({ resource: "units", row: unit })}><Pencil size={17} aria-hidden /></button>
        </div>
      </div>
      {addResult && <p className="notice unit-add-result" role="status">{addResult}</p>}
      {canExpand && <div id={childListId} hidden={!expanded}>
        {isStake && <div className="unit-stake-tools"><button type="button" className="button"
          aria-label={`Add units to ${unit.name}`} onClick={() => {
            setAddResult("");
            setAddingUnits(true);
          }}>
          <Plus size={16} aria-hidden />Add units
        </button></div>}
        {isStake && <UnitConferences unit={unit} conferences={conferences} edit={edit} />}
        {children.length > 0 ? <ul className="unit-children">
          {children.map((child) => <UnitNode key={child.id} unit={child} childrenByParent={childrenByParent}
            conferencesByStake={conferencesByStake} languageNames={languageNames} buildingAddresses={buildingAddresses}
            edit={edit} browsePath={browsePath} />)}
        </ul> : <p className="muted unit-stake-tools">No {childType}s yet.</p>}
      </div>}
      {addingUnits && <AddStakeUnits stake={unit} close={() => setAddingUnits(false)} onSaved={(added, skipped) => {
        setExpanded(true);
        setAddingUnits(false);
        setAddResult(`Added ${added} ${added === 1 ? "unit" : "units"}.${skipped ? ` Skipped ${skipped} ${skipped === 1 ? "duplicate" : "duplicates"}.` : ""}`);
      }} />}
    </li>
  );
}

function AddStakeUnits({ stake, close, onSaved }: {
  stake: Unit;
  close: () => void;
  onSaved: (added: number, skipped: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await addStakeUnits(stake.id, form);
      if (result.error !== null) setError(result.error);
      else onSaved(result.added, result.skipped);
    } catch {
      setError("Could not save the units. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add wards and branches" close={() => { if (!busy) close(); }}>
      <form className="modal-body stack" onSubmit={submit}>
        <p>Add units to <strong>{stake.name}</strong>. Type or paste one name per line.</p>
        <label>Wards<textarea name="wards" rows={5} disabled={busy} /></label>
        <label>Branches<textarea name="branches" rows={3} disabled={busy} /></label>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="button" onClick={close} disabled={busy}>Cancel</button>
          <button className="button primary" disabled={busy}>{busy ? "Adding…" : "Add units"}</button>
        </div>
      </form>
    </Modal>
  );
}

export function UnitsView({ units, buildings, languages, conferences, edit, browseUnitId }: {
  units: Unit[]; languages: Language[]; conferences: StakeConference[]; edit: UnitTreeProps["edit"];
  buildings: Building[];
  browseUnitId: string;
}) {
  const [regionId, setRegionId] = useState("");
  const languageSettings = useRef<HTMLDetailsElement>(null);
  const buildingSettings = useRef<HTMLDetailsElement>(null);
  const regions: Unit[] = [];
  const childrenByParent = new Map<string, Unit[]>();
  const conferencesByStake = new Map<string, StakeConference[]>();
  const languageNames = new Map(languages.map((language) => [language.id, language.name]));
  const buildingAddresses = new Map(buildings.map((building) => [building.id, formatBuildingAddress(building)]));
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));

  for (const unit of [...units].sort((a, b) => a.name.localeCompare(b.name))) {
    if (unit.kind === "region") {
      regions.push(unit);
    } else if (unit.parent_id) {
      const siblings = childrenByParent.get(unit.parent_id) ?? [];
      siblings.push(unit);
      childrenByParent.set(unit.parent_id, siblings);
    }
  }
  for (const conference of conferences) {
    const dates = conferencesByStake.get(conference.stake_id) ?? [];
    dates.push(conference);
    conferencesByStake.set(conference.stake_id, dates);
  }

  const browsePath = new Set<string>();
  let ancestor = unitsById.get(browseUnitId);
  let browseRegionId = "";
  while (ancestor && !browsePath.has(ancestor.id)) {
    browsePath.add(ancestor.id);
    if (ancestor.kind === "region") browseRegionId = ancestor.id;
    ancestor = unitsById.get(ancestor.parent_id ?? "");
  }

  const region = regions.find((entry) => entry.id === (regionId || browseRegionId)) ?? regions[0];
  const councils = region ? childrenByParent.get(region.id) ?? [] : [];

  function openSettings(settings: HTMLDetailsElement | null) {
    if (!settings) return;
    settings.open = true;
    settings.querySelector("summary")?.focus({ preventScroll: true });
    settings.scrollIntoView({ block: "nearest" });
  }

  return (
    <section aria-labelledby="units-heading">
      <div className="section-heading">
        <div><h1 id="units-heading">Units</h1><p>Browse coordinating councils, stakes, wards, and branches.</p></div>
        <button className="button primary" onClick={() => edit({ resource: "units", parent: region })}>
          <Plus size={18} aria-hidden />Add unit
        </button>
      </div>
      {region && <div className="unit-region">
        <div className="unit-region-name">
          {regions.length > 1 && <label>Browse region
            <select value={region.id} onChange={(event) => setRegionId(event.target.value)}>
              {regions.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label>}
          <div className="unit-node-row">
            <Link href={`/units/${region.id}`} className="unit-card" prefetch={false}>
              <span className="unit-node-title"><strong>{region.name}</strong><small>Region</small></span>
              <Eye size={19} aria-hidden />
            </Link>
            <div className="unit-card-actions">
              <button className="icon-button" aria-label={`Edit region ${region.name}`}
                onClick={() => edit({ resource: "units", row: region })}><Pencil size={17} aria-hidden /></button>
            </div>
          </div>
        </div>
        <div className="toolbar">
          <button className="button" onClick={() => openSettings(buildingSettings.current)}>Manage buildings</button>
          <button className="button" onClick={() => openSettings(languageSettings.current)}>Manage languages</button>
        </div>
      </div>}
      {region && councils.length > 0 ? <ul className="unit-councils" aria-label="Coordinating councils" key={region.id}>
        {councils.map((unit) => <UnitNode key={unit.id} unit={unit} childrenByParent={childrenByParent}
          conferencesByStake={conferencesByStake} languageNames={languageNames} buildingAddresses={buildingAddresses}
          edit={edit} browsePath={browsePath} />)}
      </ul> : <div className="panel empty">
        <span><Building2 size={25} aria-hidden /></span>
        <h2>{region ? "No coordinating councils yet" : "No region yet"}</h2>
        <p>{region ? "Add a coordinating council to start organizing this region." : "Add a region to start organizing your units."}</p>
      </div>}
      <details className="panel calling-group language-settings" ref={buildingSettings}>
        <summary><strong>Buildings</strong><ChevronDown size={18} aria-hidden /></summary>
        <div className="calling-body">
          <div className="toolbar">
            <button className="button" onClick={() => edit({ resource: "buildings" })}>
              <Plus size={16} aria-hidden />Add building
            </button>
          </div>
          {buildings.length > 0 && <ul className="panel management-list">
            {[...buildings].sort((a, b) => a.address.localeCompare(b.address)).map((building) => (
              <li key={building.id}>
                {building.photo_path && <Image className="building-photo-thumbnail" src={buildingPhotoUrl(building)}
                  width={64} height={52} alt="" unoptimized />}
                <div><strong>{buildingAddresses.get(building.id)}</strong>
                  {building.agent_stake_id && <small>Agent Stake · {unitsById.get(building.agent_stake_id)?.name}</small>}
                  {units.filter((unit) => unit.building_id === building.id).map((unit) =>
                    <small key={unit.id}>{unitPath(unit, unitsById)}</small>)}
                </div>
                <button className="icon-button" aria-label={`Edit building at ${buildingAddresses.get(building.id)}`}
                  onClick={() => edit({ resource: "buildings", row: building })}><Pencil size={17} /></button>
              </li>
            ))}
          </ul>}
        </div>
      </details>
      <details ref={languageSettings} className="panel calling-group language-settings">
        <summary><strong>Languages</strong><ChevronDown size={18} aria-hidden /></summary>
        <div className="calling-body">
          <div className="toolbar">
            <button className="button" onClick={() => edit({ resource: "languages" })}>
              <Plus size={16} aria-hidden />Add language
            </button>
          </div>
          {languages.length > 0 && <ul className="panel management-list">
            {[...languages].sort((a, b) => a.name.localeCompare(b.name)).map((language) => (
              <li key={language.id}>
                <div><strong>{language.name}</strong></div>
                <button className="icon-button" aria-label={`Edit language ${language.name}`}
                  onClick={() => edit({ resource: "languages", row: language })}><Pencil size={17} /></button>
              </li>
            ))}
          </ul>}
        </div>
      </details>
    </section>
  );
}
