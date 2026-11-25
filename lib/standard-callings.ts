import type { CallingLevel, Directory, UnitKind } from "./directory";

export const standardCallingGroups = {
  bishopric: { name: "Bishopric", level: "ward", kind: "ward",
    roles: ["Bishop", "Bishopric First Counselor", "Bishopric Second Counselor"] },
  "stake-presidency": { name: "Stake Presidency", level: "stake", kind: "stake",
    roles: ["Stake President", "Stake Presidency First Counselor", "Stake Presidency Second Counselor"] },
  "high-council": { name: "High Council", level: "stake", kind: "stake",
    roles: Array.from({ length: 12 }, (_, index) => `High Councilor ${index + 1}`) },
} as const;

export type StandardCallingGroup = keyof typeof standardCallingGroups;
export type StandardCalling = { group: StandardCallingGroup; index: number };

export function standardGroupFor(name: string, level: CallingLevel) {
  const normalized = name.trim().toLowerCase();
  if (level === "ward" && normalized === "bishopric") return "bishopric";
  if (level === "stake" && normalized === "stake presidency") return "stake-presidency";
  if (level === "stake" && /^(stake )?high council$/.test(normalized)) return "high-council";
  return undefined;
}

export function standardGroupsForUnit(kind: UnitKind) {
  return (Object.keys(standardCallingGroups) as StandardCallingGroup[])
    .filter((group) => standardCallingGroups[group].kind === kind);
}

export function standardRoleIndex(group: StandardCallingGroup, name: string) {
  const normalized = name.trim().toLowerCase();
  if (group === "high-council") {
    const seat = normalized.match(/\b(\d+)$/);
    return seat ? Number(seat[1]) - 1 : -1;
  }
  if (!/coun[sc]ell?or/.test(normalized)) {
    return (group === "bishopric" ? normalized === "bishop" : /^(stake )?president$/.test(normalized)) ? 0 : -1;
  }
  if (/\b(first|1st|1)\b/.test(normalized)) return 1;
  if (/\b(second|2nd|2)\b/.test(normalized)) return 2;
  return -1;
}

export function unitLeaderSubtitles(directory: Directory) {
  const units = new Map(directory.units.map((unit) => [unit.id, unit]));
  const positions = new Map(directory.positions.map((position) => [position.id, position]));
  const callings = new Map(directory.calling_types.map((calling) => [calling.id, calling]));
  const organizations = new Map(directory.organizations.map((organization) => [organization.id, organization]));
  const contacts = new Map(directory.contacts.map((contact) => [contact.id, contact]));
  const subtitles = new Map<string, string>();
  const sustainedDates = new Map<string, string>();

  for (const assignment of directory.assignments) {
    if (assignment.released_on) continue;
    const position = positions.get(assignment.position_id);
    if (!position || position.retired_on) continue;
    const unit = units.get(position.unit_id);
    const calling = callings.get(position.calling_type_id);
    const fullName = contacts.get(assignment.contact_id)?.name.trim();
    if (!unit || !calling || !fullName) continue;

    const name = calling.name.trim().toLowerCase();
    const organization = organizations.get(calling.organization_id);
    const groupName = organization?.name.trim().toLowerCase();
    const isStakePresident = unit.kind === "stake" && standardRoleIndex("stake-presidency", name) === 0
      && (name === "stake president" || groupName === "stake presidency");
    const isBishop = unit.kind === "ward" && standardRoleIndex("bishopric", name) === 0;
    const isBranchLeader = unit.kind === "branch"
      && (name === "branch president" || name === "bishop" || (name === "president" && groupName === "branch presidency"));
    if (!isStakePresident && !isBishop && !isBranchLeader) continue;

    const sustainedOn = assignment.sustained_on ?? "";
    const previousDate = sustainedDates.get(unit.id);
    if (previousDate !== undefined && previousDate >= sustainedOn) continue;
    sustainedDates.set(unit.id, sustainedOn);
    subtitles.set(unit.id, `${isBishop ? "Bishop" : "President"} ${fullName}`);
  }
  return subtitles;
}
