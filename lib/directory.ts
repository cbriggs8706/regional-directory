import type { FocusType } from "./focus-people";
import type { LanguageColor } from "./language-colors";

export const unitLabels = {
  region: "Region",
  council: "Coordinating Council",
  stake: "Stake",
  ward: "Ward",
  branch: "Branch",
} as const;

export const parentKinds = {
  region: null,
  council: "region",
  stake: "council",
  ward: "stake",
  branch: "stake",
} as const;

export const callingLevels = ["region", "council", "stake", "ward"] as const;
export type UnitKind = keyof typeof unitLabels;
export type CallingLevel = typeof callingLevels[number];

export type Unit = {
  id: string;
  name: string;
  kind: UnitKind;
  parent_id: string | null;
  level: CallingLevel;
  website_url: string | null;
  building_id: string | null;
  language_id: string | null;
  has_sub_congregation: boolean;
  sub_congregation_language_id: string | null;
  sacrament_meeting_time: string | null;
  sacrament_meeting_first: boolean | null;
  first_meeting_time: string | null;
  council_meeting_time: string | null;
  notes: string | null;
};

export type Conference = { id: string; begins_on: string; ends_on: string };
export type StakeConference = Conference & { stake_id: string };
export type WardConference = Conference & { unit_id: string };
export type Building = {
  id: string;
  address: string;
  city: string | null;
  state: string;
  zip_code: string | null;
  agent_stake_id: string | null;
  photo_path: string | null;
};

export function formatBuildingAddress(building: Building) {
  const stateAndZip = [building.state, building.zip_code].filter(Boolean).join(" ");
  return [building.address, building.city, stateAndZip].filter(Boolean).join(", ");
}

export function buildingPhotoUrl(building: Building) {
  return `/buildings/${building.id}/photo?v=${encodeURIComponent(building.photo_path?.split("/").pop() ?? "")}`;
}

export const buildingPhotoTypes = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const buildingPhotoMaxBytes = 4 * 1024 * 1024;
export type Language = { id: string; name: string; color: LanguageColor };
export type Contact = {
  id: string; name: string; email: string | null; phone: string | null;
  focus_type: FocusType | null;
  first_name: string | null;
  last_name: string | null;
  ward_id: string | null;
  is_whatsapp: boolean;
  baptized_on: string | null;
  helper_number: string | null;
  pid: string | null;
};
export type Organization = { id: string; name: string; level: CallingLevel; sort_order: number | null };
export type CallingType = {
  id: string; name: string; level: CallingLevel; sort_order: number | null;
  organization_id: string; default_multiple_holders: boolean;
};
export type CallingName = { id: number; calling_type_id: string; previous_name: string; changed_at: string };
export type Position = {
  id: string;
  unit_id: string;
  calling_type_id: string;
  level: CallingLevel;
  multiple_holders: boolean;
  retired_on: string | null;
  successor_id: string | null;
};
export type Assignment = {
  id: string;
  position_id: string;
  contact_id: string;
  calling_name: string;
  assignment_labels: string[];
  sustained_on: string | null;
  released_on: string | null;
  assignment_buildings?: { building_id: string }[];
};
export type Access = { email: string; is_admin: boolean };

export type Directory = {
  units: Unit[];
  buildings: Building[];
  stake_conferences: StakeConference[];
  ward_conferences: WardConference[] | null;
  languages: Language[];
  contacts: Contact[];
  organizations: Organization[];
  calling_types: CallingType[];
  calling_names: CallingName[];
  positions: Position[];
  assignments: Assignment[];
  directory_access: Access[];
};

export function unitNameWithType(unit: Pick<Unit, "name" | "kind">) {
  const name = unit.name.trim();
  const type = unitLabels[unit.kind];
  const nameLower = name.toLowerCase();
  const typeLower = type.toLowerCase();
  return nameLower === typeLower || nameLower.endsWith(` ${typeLower}`) ? name : `${name} ${type}`;
}

export function callingLevelLabel(level: CallingLevel) {
  return level === "ward" ? "Ward / Branch" : unitLabels[level];
}

export function isBuildingScheduler(calling: CallingType | undefined, names: CallingName[]) {
  if (calling?.level !== "stake") return false;
  const matches = (name: string) => name.trim().toLowerCase() === "building scheduler";
  return matches(calling.name) || names.some((name) => name.calling_type_id === calling.id && matches(name.previous_name));
}

export function compareCallingOrder(a: Organization | CallingType, b: Organization | CallingType) {
  return (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)
    || a.name.localeCompare(b.name);
}

export function hasSacramentMeeting(kind: UnitKind) {
  return kind === "ward" || kind === "branch";
}

export function callingPath(calling: CallingType, organizations: Map<string, Organization>) {
  const organization = organizations.get(calling.organization_id);
  return organization ? `${organization.name} / ${calling.name}` : calling.name;
}

export function abbreviatedUnitName(unit: Unit) {
  if (unit.kind !== "region" && unit.kind !== "council") return unit.name;
  const name = unit.name.replace(/\([^)]*\)/g, " ").trim();
  return name.split(/\s+/).map((word) => Array.from(word)[0]).join("").toUpperCase();
}

export function unitPath(unit: Unit, units: Map<string, Unit>, format: "full" | "dropdown" = "full") {
  const path = [unit];
  const seen = new Set([unit.id]);
  let parent = units.get(unit.parent_id ?? "");
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    path.unshift(parent);
    parent = units.get(parent.parent_id ?? "");
  }
  const abbreviate = format === "dropdown" && path.length > 2;
  return path.map((entry) => abbreviate ? abbreviatedUnitName(entry) : entry.name).join(" / ");
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
