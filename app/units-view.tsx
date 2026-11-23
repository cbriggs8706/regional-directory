"use client";

import { useRef, useState, type FormEvent } from "react";
import { Building2, ChevronDown, ExternalLink, Pencil, Plus } from "lucide-react";
import { hasSacramentMeeting, unitLabels, unitPath, type Building, type Language, type StakeConference, type Unit } from "../lib/directory";
import { addStakeUnits } from "./actions";
import { Modal, type EditorState } from "./editor";

type UnitTreeProps = {
  childrenByParent: Map<string, Unit[]>;
  conferencesByStake: Map<string, StakeConference[]>;
  languageNames: Map<string, string>;
  buildingAddresses: Map<string, string>;
  edit: (state: EditorState) => void;
  openCallings: (unit: Unit) => void;
};

const meetingTimeFormat = new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "UTC" });
const conferenceDateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function formatMeetingTime(time: string) {
  return meetingTimeFormat.format(new Date(`2000-01-01T${time.slice(0, 5)}:00Z`));
}

function UnitNode({ unit, childrenByParent, conferencesByStake, languageNames, buildingAddresses, edit, openCallings }: UnitTreeProps & { unit: Unit }) {
  const [expanded, setExpanded] = useState(unit.kind === "council");
  const [addingUnits, setAddingUnits] = useState(false);
  const [addResult, setAddResult] = useState("");
  const children = childrenByParent.get(unit.id) ?? [];
  const childListId = `unit-children-${unit.id}`;
  const leaf = hasSacramentMeeting(unit.kind);
  const isStake = unit.kind === "stake";
  const canExpand = children.length > 0 || isStake;
  const conferences = conferencesByStake.get(unit.id) ?? [];
  const address = unit.building_id ? buildingAddresses.get(unit.building_id) : undefined;
  const childType = unit.kind === "council" ? "stake" : "unit";
  const heading = <>
    <strong>{unit.name}</strong>
    <small>{unitLabels[unit.kind]}{!leaf && ` · ${children.length} ${childType}${children.length === 1 ? "" : "s"}`}</small>
  </>;

  return (
    <li className={`unit-node unit-node-${unit.kind}`}>
      <div className="unit-node-row">
        {canExpand ? (
          <button type="button" className="unit-toggle" aria-expanded={expanded} aria-controls={childListId}
            onClick={() => setExpanded((open) => !open)}>
            <ChevronDown size={17} aria-hidden />
            <span className="unit-node-title">{heading}</span>
          </button>
        ) : <div className="unit-node-title unit-node-static">{heading}</div>}
        {isStake && <button type="button" className="text-button unit-add-children"
          aria-label={`Add units to ${unit.name}`} onClick={() => {
            setAddResult("");
            setAddingUnits(true);
          }}>
          <Plus size={15} aria-hidden />Add units
        </button>}
        <button type="button" className="icon-button" aria-label={`Edit ${unit.name}`}
          onClick={() => edit({ resource: "units", row: unit })}><Pencil size={17} /></button>
      </div>
      {addResult && <p className="notice unit-add-result" role="status">{addResult}</p>}
      {(leaf || isStake || unit.website_url || address) && <div className="unit-details">
        <div className="chips">
          {unit.language_id && <span className="chip">{languageNames.get(unit.language_id)}</span>}
          {unit.has_sub_congregation && unit.sub_congregation_language_id && <span className="chip">
            {languageNames.get(unit.sub_congregation_language_id)} sub-congregation
          </span>}
          {unit.sacrament_meeting_first === false && unit.first_meeting_time && <span className="chip">
            First meeting at {formatMeetingTime(unit.first_meeting_time)}
          </span>}
          {unit.sacrament_meeting_time && <span className="chip">Sacrament at {formatMeetingTime(unit.sacrament_meeting_time)}</span>}
          {leaf && unit.sacrament_meeting_first !== null && <span className="chip">
            {unit.sacrament_meeting_first ? "Sacrament first" : "Sacrament after another meeting"}
          </span>}
          {unit.council_meeting_time && <span className="chip">Council at {formatMeetingTime(unit.council_meeting_time)}</span>}
          {unit.website_url && <a className="chip unit-website" href={unit.website_url} target="_blank" rel="noopener noreferrer"
            aria-label={`Website for ${unit.name} (opens in a new tab)`}>
            Website <ExternalLink size={14} aria-hidden />
          </a>}
        </div>
        {address && <small className="unit-notes">{address}</small>}
        {unit.notes && <small className="unit-notes">{unit.notes}</small>}
        {(isStake || leaf) && <button className="text-button" aria-label={`View callings for ${unit.name}`}
          onClick={() => openCallings(unit)}>View callings</button>}
      </div>}
      {canExpand && <div id={childListId} hidden={!expanded}>
        {isStake && <section className="stake-conferences" aria-labelledby={`conference-heading-${unit.id}`}>
          <div className="stake-conferences-heading">
            <h2 id={`conference-heading-${unit.id}`}>Stake conferences</h2>
            <button className="text-button" onClick={() => edit({ resource: "stake_conferences", stake: unit })}>
              <Plus size={15} aria-hidden />Add conference
            </button>
          </div>
          {conferences.length > 0 && <ul className="management-list">
            {conferences.map((conference) => {
              const dates = conferenceDateFormat.formatRange(new Date(conference.begins_on), new Date(conference.ends_on));
              return <li key={conference.id}>
                <div>{dates}</div>
                <button className="icon-button" aria-label={`Edit stake conference ${dates}`}
                  onClick={() => edit({ resource: "stake_conferences", stake: unit, row: conference })}><Pencil size={16} /></button>
              </li>;
            })}
          </ul>}
        </section>}
        {children.length > 0 && <ul className="unit-children">
          {children.map((child) => <UnitNode key={child.id} unit={child} childrenByParent={childrenByParent}
            conferencesByStake={conferencesByStake} languageNames={languageNames} buildingAddresses={buildingAddresses}
            edit={edit} openCallings={openCallings} />)}
        </ul>}
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

export function UnitsView({ units, buildings, languages, conferences, edit, openCallings }: {
  units: Unit[]; languages: Language[]; conferences: StakeConference[]; edit: UnitTreeProps["edit"];
  buildings: Building[];
  openCallings: UnitTreeProps["openCallings"];
}) {
  const [regionId, setRegionId] = useState("");
  const languageSettings = useRef<HTMLDetailsElement>(null);
  const buildingSettings = useRef<HTMLDetailsElement>(null);
  const regions: Unit[] = [];
  const childrenByParent = new Map<string, Unit[]>();
  const conferencesByStake = new Map<string, StakeConference[]>();
  const languageNames = new Map(languages.map((language) => [language.id, language.name]));
  const buildingAddresses = new Map(buildings.map((building) => [building.id, building.address]));
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
  for (const conference of [...conferences].sort((a, b) => b.begins_on.localeCompare(a.begins_on))) {
    const dates = conferencesByStake.get(conference.stake_id) ?? [];
    dates.push(conference);
    conferencesByStake.set(conference.stake_id, dates);
  }

  const region = regions.find((entry) => entry.id === regionId) ?? regions[0];
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
          {regions.length > 1 ? <label>Region
            <select value={region.id} onChange={(event) => setRegionId(event.target.value)}>
              {regions.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label> : <div><small>Region</small><strong>{region.name}</strong></div>}
          <button className="icon-button" aria-label={`Edit region ${region.name}`}
            onClick={() => edit({ resource: "units", row: region })}><Pencil size={17} /></button>
        </div>
        <div className="toolbar">
          <button className="text-button" onClick={() => openSettings(buildingSettings.current)}>Manage buildings</button>
          <button className="text-button" onClick={() => openSettings(languageSettings.current)}>Manage languages</button>
        </div>
      </div>}
      {region && councils.length > 0 ? <ul className="unit-councils" aria-label="Coordinating councils" key={region.id}>
        {councils.map((unit) => <UnitNode key={unit.id} unit={unit} childrenByParent={childrenByParent}
          conferencesByStake={conferencesByStake} languageNames={languageNames} buildingAddresses={buildingAddresses}
          edit={edit} openCallings={openCallings} />)}
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
                <div><strong>{building.address}</strong>
                  {units.filter((unit) => unit.building_id === building.id).map((unit) =>
                    <small key={unit.id}>{unitPath(unit, unitsById)}</small>)}
                </div>
                <button className="icon-button" aria-label={`Edit building at ${building.address}`}
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
