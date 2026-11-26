import type { Contact, Unit, UnitKind } from "./directory";
import type { SocialLink } from "./social-links";
import type { UnitJournalData } from "./unit-journal";

export const agentKinds = ["region", "council", "stake"] as const;
export type AgentKind = typeof agentKinds[number];

export function isOrganizationAgent(kind: UnitKind): kind is AgentKind {
  return kind === "region" || kind === "council" || kind === "stake";
}

export function agentLabel(kind: AgentKind) {
  return { region: "Agent Area", council: "Agent Coordinating Council", stake: "Agent Stake" }[kind];
}

export function agentName(unit: Pick<Unit, "name" | "kind">) {
  if (unit.kind !== "region") return unit.name;
  return unit.name.replace(/ Region$/i, " Area");
}

export type DirectoryOrganization = {
  id: string;
  name: string;
  type: string;
  agent_id: string;
  agent_kind: AgentKind;
  building_id: string | null;
  website_url: string | null;
  social_links?: SocialLink[];
  notes: string | null;
};

export type OrganizationTitle = { id: string; organization_id: string; name: string; sort_order: number | null };
export type OrganizationAssignment = { id: string; title_id: string; contact_id: string; active: boolean };
export type OrganizationEvent = {
  id: string;
  organization_id: string;
  title: string;
  event_date: string;
  end_date: string | null;
  notes: string | null;
};
export type OrganizationDirectory = {
  organizations: DirectoryOrganization[];
  titles: OrganizationTitle[];
  assignments: OrganizationAssignment[];
  loadError: string | null;
};
export type OrganizationDetail = {
  organization: DirectoryOrganization;
  journalPage?: number;
  journal: Promise<UnitJournalData>;
  events: Promise<{ rows: OrganizationEvent[]; error?: string }>;
  canAddJournal: Promise<boolean>;
  canAddEvent: Promise<boolean>;
};

export function organizationLeaderSubtitles({ titles, assignments }: OrganizationDirectory, contacts: Contact[]) {
  const leadTitleName = /^(?:director|center director|executive director|president|temple president|chair|chairperson)$/i;
  const leadTitles = new Map<string, OrganizationTitle>();
  const sortedTitles = [...titles].sort((a, b) =>
    (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER) ||
    Number(leadTitleName.test(b.name)) - Number(leadTitleName.test(a.name)) || a.name.localeCompare(b.name));
  for (const title of sortedTitles) {
    if (!leadTitles.has(title.organization_id)) leadTitles.set(title.organization_id, title);
  }

  const contactsById = new Map(contacts.map(({ id, name }) => [id, name]));
  const holders = new Map<string, string[]>();
  const leadTitleIds = new Set([...leadTitles.values()].map(({ id }) => id));
  for (const { title_id, contact_id, active } of assignments) {
    const name = contactsById.get(contact_id);
    if (!active || !name || !leadTitleIds.has(title_id)) continue;
    const names = holders.get(title_id) ?? [];
    names.push(name);
    holders.set(title_id, names);
  }

  const subtitles = new Map<string, string>();
  for (const [organization, title] of leadTitles) {
    const names = holders.get(title.id);
    if (names?.length) subtitles.set(organization, `${title.name}: ${names.sort((a, b) => a.localeCompare(b)).join(", ")}`);
  }
  return subtitles;
}
