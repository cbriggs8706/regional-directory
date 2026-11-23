import Image from "next/image";
import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import { buildingPhotoUrl, formatBuildingAddress, hasSacramentMeeting, unitLabels, type Building, type Unit } from "../lib/directory";
import { UnitLanguageBadges } from "./unit-facts";

export function StakeUnits({ stake, units, buildings, languageNames }: {
  stake: Unit; units: Unit[]; buildings: Building[]; languageNames: Map<string, string>;
}) {
  const children = units.filter((unit) => unit.parent_id === stake.id && hasSacramentMeeting(unit.kind))
    .sort((a, b) => a.name.localeCompare(b.name));
  const buildingsById = new Map(buildings.map((building) => [building.id, building]));
  const unitsByBuilding = new Map<Building | undefined, Unit[]>();
  for (const unit of children) {
    const building = buildingsById.get(unit.building_id ?? "");
    const group = unitsByBuilding.get(building) ?? [];
    group.push(unit);
    unitsByBuilding.set(building, group);
  }
  const groups = [...unitsByBuilding].map(([building, members]) => ({
    building, members, address: building ? formatBuildingAddress(building) : "No building assigned",
  })).sort((a, b) => Number(!a.building) - Number(!b.building) || a.address.localeCompare(b.address, undefined, { numeric: true }));

  return (
    <section aria-labelledby="stake-units-heading">
      <h2 id="stake-units-heading" className="unit-section-heading">Units</h2>
      {groups.length === 0 ? <p className="panel empty">This stake has no wards or branches yet.</p>
        : <div className="stake-unit-groups">
          {groups.map(({ building, address, members }) => (
            <div key={building?.id ?? "unassigned"}>
              <h3 className="stake-unit-building">{address}</h3>
              <ul className="stake-unit-grid" aria-label={address}>
                {members.map((unit) => <li key={unit.id}>
                  <Link href={`/units/${unit.id}`} prefetch={false} className="panel stake-unit-card">
                    <span className="stake-unit-photo">
                      {building?.photo_path
                        ? <Image src={buildingPhotoUrl(building)} alt="" fill unoptimized />
                        : <Building2 size={36} aria-hidden />}
                    </span>
                    <span className="stake-unit-caption">
                      <span className="unit-node-title">
                        <strong>{unit.name}</strong>
                        <small>{unitLabels[unit.kind]}</small>
                        <span className="chips"><UnitLanguageBadges unit={unit} languageNames={languageNames} /></span>
                      </span>
                      <ChevronRight size={19} aria-hidden />
                    </span>
                  </Link>
                </li>)}
              </ul>
            </div>
          ))}
        </div>}
    </section>
  );
}
