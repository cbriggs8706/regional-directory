import Image from "next/image";
import { Building2, Languages, Pencil } from "lucide-react";
import { buildingPhotoUrl, formatBuildingAddress, groupBuildingsByCity, unitPath, type Directory } from "../lib/directory";
import { AddressLink } from "./address-link";
import { AddMenu } from "./add-menu";
import type { EditorState } from "./editor";
import { LanguageBadge } from "./language-badge";

export type DirectoryManagementSection = "buildings" | "languages";

type ManagementProps = { directory: Directory; edit: (state: EditorState) => void };

export function BuildingsView({ directory, edit, addHost }: ManagementProps & { addHost: HTMLElement | null }) {
  const unitsById = new Map(directory.units.map((unit) => [unit.id, unit]));
  const groups = groupBuildingsByCity(directory.buildings);

  return (
    <section className="buildings-view" aria-labelledby="buildings-heading">
      <div className="section-heading">
        <h1 id="buildings-heading">Buildings</h1>
      </div>
      {groups.length ? <div className="building-city-groups">
        {groups.map((group) => (
          <div key={group.city}>
            <h2>{group.city || "City not set"}</h2>
            <ul className="panel management-list">
              {group.buildings.map((building) => {
                const address = formatBuildingAddress(building);
                const agentStake = unitsById.get(building.agent_stake_id ?? "");
                return <li key={building.id}>
                  {building.photo_path && <Image className="building-photo-thumbnail" src={buildingPhotoUrl(building)}
                    width={64} height={52} alt="" unoptimized />}
                  <div>
                    <strong><AddressLink address={address} /></strong>
                    {agentStake && <small>Agent Stake · {agentStake.name}</small>}
                    {directory.units.filter((unit) => unit.building_id === building.id).map((unit) =>
                      <small key={unit.id}>{unitPath(unit, unitsById)}</small>)}
                  </div>
                  <button type="button" className="icon-button" aria-label={`Edit building at ${address}`}
                    onClick={() => edit({ resource: "buildings", row: building })}><Pencil size={17} aria-hidden /></button>
                </li>;
              })}
            </ul>
          </div>
        ))}
      </div> : <p className="panel empty">No buildings yet.</p>}
      <AddMenu host={addHost} label="Add to buildings" actions={[
        { label: "Add building", Icon: Building2, run: () => edit({ resource: "buildings" }) },
      ]} />
    </section>
  );
}

export function LanguagesView({ directory, edit, addHost }: ManagementProps & { addHost: HTMLElement | null }) {
  const languages = [...directory.languages].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="management-with-add-menu" aria-labelledby="languages-heading">
      <div className="section-heading">
        <h1 id="languages-heading">Languages</h1>
      </div>
      {languages.length ? <ul className="panel management-list">
        {languages.map((language) => <li key={language.id}>
          <div><span className="chips"><LanguageBadge language={language} /></span></div>
          <button type="button" className="icon-button" aria-label={`Edit language ${language.name}`}
            onClick={() => edit({ resource: "languages", row: language })}><Pencil size={17} aria-hidden /></button>
        </li>)}
      </ul> : <p className="panel empty">No languages yet.</p>}
      <AddMenu host={addHost} label="Add to languages" actions={[
        { label: "Add language", Icon: Languages, run: () => edit({ resource: "languages" }) },
      ]} />
    </section>
  );
}
