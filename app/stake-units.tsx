import { formatBuildingAddress, hasSacramentMeeting, type Building, type Directory, type Language, type Unit } from "../lib/directory";
import { unitLeaderSubtitles } from "../lib/standard-callings";
import { AddressLink } from "./address-link";
import { CongregationCard } from "./congregation-card";
import { UnitSectionHeading } from "./unit-section-heading";

export function StakeUnits({ stake, directory, languagesById }: {
  stake: Unit; directory: Directory; languagesById: Map<string, Language>;
}) {
  const { units, buildings } = directory;
  const leaders = unitLeaderSubtitles(directory);
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
    <section className="unit-tab-section" aria-labelledby="stake-units-heading">
      <UnitSectionHeading id="stake-units-heading" title="Units" unit={stake} />
      {groups.length === 0 ? <p className="panel empty">This stake has no wards or branches yet.</p>
        : <div className="stake-unit-groups">
          {groups.map(({ building, address, members }) => (
            <div key={building?.id ?? "unassigned"}>
              <h3 className="stake-unit-building">{building ? <AddressLink address={address} /> : address}</h3>
              <ul className="child-unit-grid congregation-grid" aria-label={address}>
                {members.map((unit) => <li key={unit.id}>
                  <CongregationCard unit={unit} building={building} languagesById={languagesById} leaderSubtitle={leaders.get(unit.id)} />
                </li>)}
              </ul>
            </div>
          ))}
        </div>}
    </section>
  );
}
