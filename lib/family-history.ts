import { hasSacramentMeeting, type Unit } from "./directory";

export const countMetrics = [
  { key: "submitters", label: "Members submitting this year" },
  { key: "familysearch_logins", label: "Members Logging-in (web and mobile)" },
  { key: "added_ancestor", label: "Added Names to Tree" },
  { key: "added_memory", label: "Added Memory to Tree" },
  { key: "indexed", label: "Indexed" },
] as const;

export const submitterGroups = [
  { key: "total", label: "Totals" },
  { key: "adults", label: "Adults" },
  { key: "youth", label: "Youth" },
  { key: "converts", label: "New Members" },
  { key: "ysa", label: "YSAs" },
] as const;

export const generationsLabel = "First Four Generations of Ancestors in the Tree";
type Group = typeof submitterGroups[number]["key"];
export type CountMetric = typeof countMetrics[number]["key"];
export type PercentMetric = "first_four_generations" | `${Group}_percent`;
export type MemberField = "first_four_members" | `${Group}_members`;
type SubmitterField = `${Exclude<Group, "total">}_submitters`;
export type ReportField = CountMetric | PercentMetric | MemberField | SubmitterField;
export type ReportValues = Record<ReportField, number | null>;
export type FamilyHistoryReport = Omit<ReportValues, "indexed"> & Partial<Pick<ReportValues, "indexed">> & {
  unit_id: string; report_month: string; revision: string;
};

const percentageBases = [
  { percent: "first_four_generations", members: "first_four_members", submitters: null },
  ...submitterGroups.map(({ key }) => ({
    submitters: key === "total" ? "submitters" as const : `${key}_submitters` as const,
    percent: `${key}_percent` as const,
    members: `${key}_members` as const,
  })),
] as const;

export const countFields = countMetrics.map(({ key }) => key);
export const percentFields = percentageBases.map(({ percent }) => percent);
export const memberFields = percentageBases.map(({ members }) => members);
export const subgroupCounts = ["adults_submitters", "youth_submitters", "converts_submitters", "ysa_submitters"] as const;
export const reportFields = [...countFields, ...subgroupCounts, ...percentFields, ...memberFields];
export const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const reportMonthPattern = /^(?:19\d{2}|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/;

export function reportPeriod(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function formatReportMonth(month: string) {
  return `${monthNames[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

export function reportUnits(units: Unit[]) {
  return units.filter((unit) => hasSacramentMeeting(unit.kind));
}

export function scopeWards(units: Unit[], scope?: Unit) {
  const wards = reportUnits(units);
  if (!scope) return wards;
  const parents = new Map(units.map(({ id, parent_id }) => [id, parent_id]));
  return wards.filter((ward) => {
    const seen = new Set<string>();
    let id: string | null | undefined = ward.id;
    while (id && !seen.has(id)) {
      if (id === scope.id) return true;
      seen.add(id);
      id = parents.get(id);
    }
    return false;
  });
}

export type ReportMetric = {
  value: number | null;
  units: number;
  total: number;
  estimated?: boolean;
  fraction?: [number, number];
};
export type ReportSummary = Record<CountMetric | PercentMetric, ReportMetric>;

export function reportNumber(value: number, percentage = false) {
  return percentage ? `${value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 1 })}%`
    : value.toLocaleString("en-US");
}

const comparisonColors = ["#146951", "#7853a0", "#b8541b", "#236ab0", "#ab3668", "#927018", "#247c83", "#a4373a", "#556237", "#515fb0"];

export function reportComparisonColor(index: number) {
  return comparisonColors[index] ?? `hsl(${Math.round(index * 137.508) % 360} 70% 35%)`;
}

export function reportSummary(reports: FamilyHistoryReport[], total: number, isWard: boolean): ReportSummary {
  const metrics = {} as ReportSummary;
  for (const field of countFields) {
    const values = reports.flatMap((report) => report[field] ?? []);
    metrics[field] = { value: values.length ? values.reduce((sum, value) => sum + value, 0) : null, units: values.length, total };
  }
  for (const { percent, members, submitters } of percentageBases) {
    let units = 0;
    let population = 0;
    let numerator = 0;
    let estimated = false;
    for (const report of reports) {
      const rate = report[percent];
      const exact = submitters ? report[submitters] : null;
      const usedTotal = percent === "first_four_generations" && report[members] === null && !isWard;
      const base = usedTotal ? report.total_members : report[members];
      if (base === null || (submitters ? exact === null : rate === null)) continue;
      units += 1;
      population += base;
      numerator += exact ?? base * (rate ?? 0) / 100;
      estimated ||= base > 0 && usedTotal;
    }
    const wardRate = isWard && !submitters ? reports[0]?.[percent] : null;
    const value = population ? numerator * 100 / population : null;
    metrics[percent] = {
      value: wardRate ?? value, units: wardRate != null ? 1 : units, total, estimated: !isWard && estimated,
      fraction: submitters && units > 0 ? [numerator, population] : undefined,
    };
  }
  return metrics;
}
