import { hasSacramentMeeting, type Unit } from "./directory";

export const countMetrics = [
  { key: "submitters", label: "Members submitting this year" },
  { key: "familysearch_logins", label: "Members logging in to FamilySearch" },
  { key: "added_ancestor", label: "Added ancestor to tree" },
  { key: "added_memory", label: "Added memory to tree" },
] as const;

export const submitterGroups = [
  { key: "total", label: "Total" },
  { key: "adults", label: "Adults" },
  { key: "youth", label: "Youth" },
  { key: "converts", label: "Converts" },
  { key: "ysa", label: "YSAs" },
] as const;

export const generationsLabel = "First four generations of ancestors in the tree";
type Group = typeof submitterGroups[number]["key"];
export type CountMetric = typeof countMetrics[number]["key"];
export type PercentMetric = "first_four_generations" | `${Group}_percent`;
export type MemberField = "first_four_members" | `${Group}_members`;
type SubmitterField = `${Exclude<Group, "total">}_submitters`;
export type ReportField = CountMetric | PercentMetric | MemberField | SubmitterField;
export type ReportValues = Record<ReportField, number | null>;
export type FamilyHistoryReport = ReportValues & { unit_id: string; report_month: string; revision: string };

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

export function formatReportMonth(month: string) {
  return `${monthNames[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

export function reportUnits(units: Unit[]) {
  return units.filter((unit) => hasSacramentMeeting(unit.kind));
}

export function scopeWards(wards: Unit[], scope?: Unit) {
  if (!scope) return wards;
  return wards.filter((ward) => ward.id === scope.id || ward.parent_id === scope.id);
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
    let hasExact = false;
    for (const report of reports) {
      const rate = report[percent];
      const exact = submitters ? report[submitters] : null;
      const usedTotal = percent === "first_four_generations" && report[members] === null && !isWard;
      const base = usedTotal ? report.total_members : report[members];
      if (base === null || (rate === null && exact === null && (base !== 0 || submitters === null))) continue;
      units += 1;
      population += base;
      hasExact ||= exact !== null;
      numerator += exact ?? base * (rate ?? 0) / 100;
      estimated ||= base > 0 && (usedTotal || (submitters !== null && exact === null));
    }
    const wardRate = isWard && (!submitters || reports[0]?.[submitters] == null) ? reports[0]?.[percent] : null;
    const value = population ? numerator * 100 / population : null;
    metrics[percent] = {
      value: wardRate ?? value, units: wardRate != null ? 1 : units, total, estimated: !isWard && estimated,
      fraction: submitters && hasExact && !estimated ? [numerator, population] : undefined,
    };
  }
  return metrics;
}
