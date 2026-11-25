import { unitNameWithType, type Unit } from "./directory";
import type { DirectoryOrganization } from "./organizations";
import type { JournalEntry } from "./unit-journal";

export type JournalReportEntry = Pick<JournalEntry, "id" | "entry_date" | "notes"> & { unit_id: string };
export type ReportEntry = JournalReportEntry | (Pick<JournalEntry, "id" | "entry_date" | "notes"> & { organization_id: string });
type ReportUnit = { id: string; name: string; entries: ReportEntry[] };
export type JournalReportGroup = { id: string; name: string; units: ReportUnit[] };
export type JournalReportData = { month: string; groups: JournalReportGroup[]; loadError: string | null };

export function groupJournalEntries(entries: ReportEntry[], units: Unit[], organizations: DirectoryOrganization[] = []): JournalReportGroup[] {
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const organizationsById = new Map(organizations.map((organization) => [organization.id, organization]));
  const groups = new Map<string, { name: string; units: Map<string, ReportUnit> }>();
  for (const entry of entries) {
    const organization = "organization_id" in entry ? organizationsById.get(entry.organization_id) : undefined;
    const subjectId = "unit_id" in entry ? entry.unit_id : entry.organization_id;
    const unitId = "unit_id" in entry ? entry.unit_id : organization?.agent_id;
    const unit = unitId ? unitsById.get(unitId) : undefined;
    const stake = unit?.kind === "stake" ? unit : unit?.parent_id ? unitsById.get(unit.parent_id) : undefined;
    const stakeId = stake?.kind === "stake" ? stake.id : "";
    const group = groups.get(stakeId) ?? {
      name: stake?.kind === "stake" ? unitNameWithType(stake) : "Region and coordinating council",
      units: new Map<string, ReportUnit>(),
    };
    const reportUnit = group.units.get(subjectId) ?? {
      id: subjectId,
      name: organization?.name ?? (unit ? unitNameWithType(unit) : "Unit unavailable"),
      entries: [],
    };
    reportUnit.entries.push(entry);
    group.units.set(subjectId, reportUnit);
    groups.set(stakeId, group);
  }
  return [...groups].map(([id, group]) => ({
    id,
    name: group.name,
    units: [...group.units.values()].sort((a, b) => Number(b.id === id) - Number(a.id === id) || a.name.localeCompare(b.name)),
  })).sort((a, b) => Number(!a.id) - Number(!b.id) || a.name.localeCompare(b.name));
}

const reportMonth = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const reportDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function journalMonthLabel(month: string) {
  return reportMonth.format(new Date(`${month}-01T00:00:00Z`));
}

export function journalEntryDateLabel(date: string) {
  return reportDate.format(new Date(`${date}T00:00:00Z`));
}

export function journalReportText(month: string, groups: JournalReportGroup[]) {
  const sections = groups.map((group) => {
    const units = group.units.map((unit) => [
      unit.id === group.id ? "Stake journal" : unit.name,
      ...unit.entries.map((entry) => `${journalEntryDateLabel(entry.entry_date)}\n${entry.notes}`),
    ].join("\n\n"));
    return [group.name, ...units].join("\n\n");
  });
  return [`Monthly journal report — ${journalMonthLabel(month)}`, ...sections].join("\n\n");
}
