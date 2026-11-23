import type { FocusType } from "./focus-people";

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
export type Language = { id: string; name: string };
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
export type CallingType = {
  id: string; name: string; level: CallingLevel; sort_order: number | null; parent_calling_type_id: string | null;
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
  fh_assignment: boolean;
  sustained_on: string | null;
  released_on: string | null;
};
export type Access = { email: string; is_admin: boolean };

export type Directory = {
  units: Unit[];
  buildings: Building[];
  stake_conferences: StakeConference[];
  ward_conferences: WardConference[] | null;
  languages: Language[];
  contacts: Contact[];
  calling_types: CallingType[];
  calling_names: CallingName[];
  positions: Position[];
  assignments: Assignment[];
  directory_access: Access[];
};

export function callingLevelLabel(level: CallingLevel) {
  return level === "ward" ? "Ward / Branch" : unitLabels[level];
}

export function compareCallingOrder(a: CallingType, b: CallingType) {
  return (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)
    || a.name.localeCompare(b.name);
}

export function hasSacramentMeeting(kind: UnitKind) {
  return kind === "ward" || kind === "branch";
}

export function supportsCallingHierarchy(level: CallingLevel) {
  return level === "stake" || level === "ward";
}

export function callingTree(callings: CallingType[]) {
  const children = new Map<string | null, CallingType[]>();
  for (const calling of callings) {
    const parent = calling.parent_calling_type_id ?? null;
    const siblings = children.get(parent) ?? [];
    siblings.push(calling);
    children.set(parent, siblings);
  }
  const ordered: { calling: CallingType; depth: number }[] = [];
  function walk(parent: string | null, depth: number) {
    for (const calling of children.get(parent) ?? []) {
      ordered.push({ calling, depth });
      walk(calling.id, depth + 1);
    }
  }
  walk(null, 0);
  return ordered;
}

export function callingAncestors(calling: CallingType, types: Map<string, CallingType>) {
  const parents: CallingType[] = [];
  const seen = new Set([calling.id]);
  let parent = types.get(calling.parent_calling_type_id ?? "");
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    parents.unshift(parent);
    parent = types.get(parent.parent_calling_type_id ?? "");
  }
  return parents;
}

export function callingPath(calling: CallingType, types: Map<string, CallingType>) {
  return [...callingAncestors(calling, types), calling].map((entry) => entry.name).join(" / ");
}

export function unitPath(unit: Unit, units: Map<string, Unit>) {
  const path = [unit.name];
  let parent = unit.parent_id && units.get(unit.parent_id);
  while (parent) {
    path.unshift(parent.name);
    parent = parent.parent_id && units.get(parent.parent_id);
  }
  return path.join(" / ");
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
