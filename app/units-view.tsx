"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Building2, ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import { buildingPhotoUrl, formatBuildingAddress, hasSacramentMeeting, unitLabels, unitPath, type Building, type Language, type Unit } from "../lib/directory";
import type { EditorState } from "./editor";
import { LanguageBadge } from "./language-badge";
import { UnitLanguageBadges } from "./unit-facts";

const nonEnglishOnlyStorageKey = "regional-directory:units:non-english-only";

type UnitTreeProps = {
  childrenByParent: Map<string, Unit[]>;
  languageNames: Map<string, string>;
  buildingAddresses: Map<string, string>;
  browsePath: Set<string>;
  nonEnglishOnly: boolean;
};

function unitCardName(unit: Unit) {
  const name = unit.name.trim();
  const type = unitLabels[unit.kind];
  const nameLower = name.toLowerCase();
  const typeLower = type.toLowerCase();
  return nameLower === typeLower || nameLower.endsWith(` ${typeLower}`) ? name : `${name} ${type}`;
}

function UnitNode({ unit, childrenByParent, languageNames, buildingAddresses, browsePath, nonEnglishOnly }: UnitTreeProps & { unit: Unit }) {
  const [expanded, setExpanded] = useState(nonEnglishOnly || browsePath.has(unit.id));
  const children = childrenByParent.get(unit.id) ?? [];
  const childListId = `unit-children-${unit.id}`;
  const leaf = hasSacramentMeeting(unit.kind);
  const canExpand = unit.kind === "council" || unit.kind === "stake" || children.length > 0;
  const address = unit.building_id ? buildingAddresses.get(unit.building_id) : undefined;
  const childType = unit.kind === "council" ? "stake" : "unit";
  const title = (
    <span className="unit-node-title">
      <span className="unit-name-and-languages">
        <strong>{unitCardName(unit)}</strong>
        <UnitLanguageBadges unit={unit} languageNames={languageNames} />
      </span>
      {!leaf && <small>{children.length} {childType}{children.length === 1 ? "" : "s"}</small>}
      {address && <small className="unit-notes">{address}</small>}
    </span>
  );
  return (
    <li className={`unit-node unit-node-${unit.kind}`}>
      <div className="unit-node-row">
        {canExpand && <button type="button" className="icon-button unit-toggle"
          aria-label={`Subunits of ${unitCardName(unit)}`} aria-expanded={expanded}
          aria-controls={childListId} onClick={() => setExpanded((open) => !open)}>
          <ChevronRight size={20} aria-hidden />
        </button>}
        <Link href={`/units/${unit.id}`} className="unit-card" prefetch={false}>{title}</Link>
      </div>
      {canExpand && <div id={childListId} hidden={!expanded}>
        {children.length > 0 ? <ul className="unit-children">
          {children.map((child) => <UnitNode key={child.id} unit={child} childrenByParent={childrenByParent}
            languageNames={languageNames} buildingAddresses={buildingAddresses}
            browsePath={browsePath} nonEnglishOnly={nonEnglishOnly} />)}
        </ul> : <p className="muted unit-children-empty">No {childType}s yet.</p>}
      </div>}
    </li>
  );
}

export function UnitsView({ units, buildings, languages, edit, browseUnitId }: {
  units: Unit[]; languages: Language[]; edit: (state: EditorState) => void;
  buildings: Building[];
  browseUnitId: string;
}) {
  const [regionId, setRegionId] = useState("");
  const [nonEnglishOnly, setNonEnglishOnly] = useState(false);
  const regions: Unit[] = [];
  const childrenByParent = new Map<string, Unit[]>();
  const languageNames = new Map(languages.map((language) => [language.id, language.name]));
  const buildingAddresses = new Map(buildings.map((building) => [building.id, formatBuildingAddress(building)]));
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));

  useEffect(() => {
    try {
      setNonEnglishOnly(window.localStorage.getItem(nonEnglishOnlyStorageKey) === "true");
    } catch {
      // The filter still works when browser storage is unavailable.
    }
  }, []);

  function updateNonEnglishOnly(checked: boolean) {
    setNonEnglishOnly(checked);
    try {
      window.localStorage.setItem(nonEnglishOnlyStorageKey, String(checked));
    } catch {
      // Keep the selection for the current view.
    }
  }

  function isNonEnglish(languageId: string | null) {
    const name = languageId ? languageNames.get(languageId)?.trim().toLowerCase() : undefined;
    return Boolean(name && name !== "english");
  }

  const matchingPaths = new Set<string>();
  if (nonEnglishOnly) {
    for (const unit of units) {
      if (!hasSacramentMeeting(unit.kind)) continue;
      if (!isNonEnglish(unit.language_id)
        && !(unit.has_sub_congregation && isNonEnglish(unit.sub_congregation_language_id))) continue;

      let ancestor: Unit | undefined = unit;
      while (ancestor && !matchingPaths.has(ancestor.id)) {
        matchingPaths.add(ancestor.id);
        ancestor = ancestor.parent_id ? unitsById.get(ancestor.parent_id) : undefined;
      }
    }
  }

  for (const unit of [...units].sort((a, b) => a.name.localeCompare(b.name))) {
    if (unit.kind === "region") {
      regions.push(unit);
    } else if (unit.parent_id && (!nonEnglishOnly || matchingPaths.has(unit.id))) {
      const siblings = childrenByParent.get(unit.parent_id) ?? [];
      siblings.push(unit);
      childrenByParent.set(unit.parent_id, siblings);
    }
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

  return (
    <section aria-labelledby="units-heading">
      <div className="section-heading">
        <div><h1 id="units-heading">Units</h1><p>Browse coordinating councils, stakes, wards, and branches.</p></div>
      </div>
      {region && <div className="unit-region">
        <div className="unit-region-name">
          {regions.length > 1 && <label>Browse region
            <select value={region.id} onChange={(event) => setRegionId(event.target.value)}>
              {regions.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label>}
          <Link href={`/units/${region.id}`} className="unit-card" prefetch={false}>
            <span className="unit-node-title unit-name-and-languages">
              <strong>{unitCardName(region)}</strong>
              <UnitLanguageBadges unit={region} languageNames={languageNames} />
            </span>
          </Link>
        </div>
      </div>}
      {region && <div className="unit-filters">
        <label className="button">
          <input type="checkbox" checked={nonEnglishOnly} onChange={(event) => updateNonEnglishOnly(event.target.checked)} />
          Non-English units only
        </label>
      </div>}
      {region && councils.length > 0 ? <ul className="unit-councils" aria-label="Coordinating councils" key={`${region.id}-${nonEnglishOnly}`}>
        {councils.map((unit) => <UnitNode key={unit.id} unit={unit} childrenByParent={childrenByParent}
          languageNames={languageNames} buildingAddresses={buildingAddresses}
          browsePath={browsePath} nonEnglishOnly={nonEnglishOnly} />)}
      </ul> : <div className="panel empty">
        <span><Building2 size={25} aria-hidden /></span>
        <h2>{region ? (nonEnglishOnly ? "No non-English units in this region" : "No coordinating councils yet") : "No region yet"}</h2>
      </div>}
      <details className="panel calling-group language-settings">
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
      <details className="panel calling-group language-settings">
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
                <div><span className="chips"><LanguageBadge name={language.name} /></span></div>
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
