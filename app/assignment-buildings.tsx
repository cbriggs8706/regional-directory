import { formatBuildingAddress, type Assignment, type Building } from "../lib/directory";
import { AddressLink } from "./address-link";

export function AssignmentBuildings({ assignment, buildings }: { assignment: Assignment; buildings: Map<string, Building> }) {
  const addresses = assignment.assignment_buildings?.flatMap(({ building_id }) => {
    const building = buildings.get(building_id);
    return building ? [{ id: building_id, address: formatBuildingAddress(building) }] : [];
  }).sort((a, b) => a.address.localeCompare(b.address));
  if (!addresses?.length) return null;

  return <div>
    <small><strong>Buildings</strong></small>
    <ul aria-label="Assigned buildings">
      {addresses.map(({ id, address }) => <li key={id}><small><AddressLink address={address} /></small></li>)}
    </ul>
  </div>;
}
