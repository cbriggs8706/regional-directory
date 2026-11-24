"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { countFields, formatReportMonth, memberFields, percentFields, reportMonthPattern, subgroupCounts, submitterGroups, type ReportValues } from "../lib/family-history";
import { getInvolvedMetrics } from "../lib/get-involved";
import { getViewer } from "../lib/supabase";

const count = z.number().int().min(0).max(2147483647).nullable();
const percent = z.number().min(0).max(100).nullable();
const getInvolvedSchema = z.object({
  unit_id: z.uuid(),
  month: z.string().regex(reportMonthPattern),
  revision: z.uuid().nullable(),
  values: z.object(Object.fromEntries(getInvolvedMetrics.map(({ key }) => [key, count]))),
});
const submitterHistorySchema = z.object({
  unit_id: z.uuid(),
  months: z.array(z.object({
    month: z.string().regex(reportMonthPattern),
    submitters: z.number().int().min(0).max(2147483647),
    revision: z.uuid().nullable(),
  })).min(1).max(24),
}).refine(({ months }) => new Set(months.map(({ month }) => month)).size === months.length);
const reportSchema = z.object({
  unit_id: z.uuid(),
  month: z.string().regex(reportMonthPattern),
  revision: z.uuid().nullable(),
  values: z.object({
    ...Object.fromEntries([...countFields, ...subgroupCounts, ...memberFields].map((key) => [key, count])),
    ...Object.fromEntries(percentFields.map((key) => [key, percent])),
    indexed: count.optional(),
  }),
});

export async function saveFamilyHistoryReport(input: unknown) {
  const viewer = await getViewer();
  if (!viewer?.role) return { error: "You need approved directory access." };
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a ward or branch and month. Enter whole member counts and percentages between 0 and 100." };
  const { unit_id, month, revision } = parsed.data;
  const values = parsed.data.values as Omit<ReportValues, "indexed"> & Partial<Pick<ReportValues, "indexed">>;
  if (![...countFields, ...subgroupCounts, ...percentFields].some((key) => values[key] != null)) {
    return { error: "Enter at least one report figure." };
  }
  if (values.first_four_members === 0 && (values.first_four_generations ?? 0) > 0) {
    return { error: "Enter the member count behind the first four generations percentage, or leave the count blank." };
  }
  for (const { key, label } of submitterGroups) {
    const submitted = key === "total" ? values.submitters : values[`${key}_submitters`];
    const members = values[`${key}_members`];
    if (submitted !== null && members !== null && submitted > members) {
      return { error: `${label} submitters cannot exceed the eligible member count.` };
    }
    if (members === 0 && (values[`${key}_percent`] ?? 0) > 0) {
      return { error: `${label} cannot have a positive percentage with zero eligible members.` };
    }
  }

  const table = viewer.client.from("family_history_reports");
  const edited = { ...values, revision: crypto.randomUUID() };
  const report_month = `${month}-01`;
  const { data, error } = await (revision
    ? table.update(edited).eq("unit_id", unit_id).eq("report_month", report_month).eq("revision", revision).select("revision").maybeSingle()
    : table.insert({ unit_id, report_month, ...edited }).select("revision").single());
  if (error?.code === "23505" || (!error && !data)) {
    return { error: "Someone saved this report after you opened it. Close the form and refresh the page to review their changes." };
  }
  if (error?.code === "23503") return { error: "Choose an existing ward or branch." };
  if (error?.code === "PGRST204" && "indexed" in edited) return { error: "Apply the Family History Indexed migration before saving indexing figures." };
  if (error) return { error: "Could not save the report. Try again." };

  revalidatePath("/");
  revalidatePath("/units/[id]", "page");
  return { error: null };
}

export async function saveSubmitterHistory(input: unknown) {
  const viewer = await getViewer();
  if (!viewer?.role) return { error: "You need approved directory access." };
  const parsed = submitterHistorySchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a ward or branch and enter whole submitter counts for valid months." };

  const { unit_id, months } = parsed.data;
  const { error } = await viewer.client.rpc("save_submitter_history", {
    p_unit_id: unit_id,
    p_months: months.map(({ month, ...figures }) => ({ report_month: `${month}-01`, ...figures })),
  });
  if (error?.code === "40001") return { error: "A report changed while this form was open. Close the form, refresh, and try again." };
  if (error?.code === "23503") return { error: "Choose an existing ward or branch." };
  if (error?.code === "23514" && reportMonthPattern.test(error.details ?? "")) {
    return { error: `Submitters for ${formatReportMonth(error.details)} cannot exceed the saved eligible member count.` };
  }
  if (error?.code === "PGRST202") return { error: "Apply the Submitter History migration in Supabase to enable bulk entry." };
  if (error) return { error: "Could not save submitter history. Try again." };

  revalidatePath("/");
  revalidatePath("/units/[id]", "page");
  return { error: null };
}

export async function saveGetInvolvedReport(input: unknown) {
  const viewer = await getViewer();
  if (!viewer?.role) return { error: "You need approved directory access." };
  const parsed = getInvolvedSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a ward or branch and a month, and enter whole counts." };
  const { unit_id, month, revision, values } = parsed.data;
  if (!Object.values(values).some((value) => value !== null)) return { error: "Enter at least one activity count." };

  const table = viewer.client.from("get_involved_reports");
  const report_month = `${month}-01`;
  const edited = { ...values, revision: crypto.randomUUID() };
  const { data, error } = await (revision
    ? table.update(edited).eq("unit_id", unit_id).eq("report_month", report_month).eq("revision", revision).select("revision").maybeSingle()
    : table.insert({ unit_id, report_month, ...edited }).select("revision").single());
  if (error?.code === "23505" || (!error && !data)) {
    return { error: "This report changed while the form was open. Close the form, refresh, and try again." };
  }
  if (error?.code === "23503") return { error: "Choose an existing ward or branch." };
  if (error) return { error: "Could not save the Get Involved report. Try again." };

  revalidatePath("/units/[id]", "page");
  return { error: null };
}
