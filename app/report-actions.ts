"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { countFields, memberFields, percentFields, reportMonthPattern, subgroupCounts, submitterGroups } from "../lib/family-history";
import { getViewer } from "../lib/supabase";

const count = z.number().int().min(0).max(2147483647).nullable();
const percent = z.number().min(0).max(100).nullable();
const reportSchema = z.object({
  unit_id: z.uuid(),
  month: z.string().regex(reportMonthPattern),
  revision: z.uuid().nullable(),
  values: z.object({
    ...Object.fromEntries([...countFields, ...subgroupCounts, ...memberFields].map((key) => [key, count])),
    ...Object.fromEntries(percentFields.map((key) => [key, percent])),
  }),
});

export async function saveFamilyHistoryReport(input: unknown) {
  const viewer = await getViewer();
  if (!viewer?.role) return { error: "You need approved directory access." };
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a ward or branch and month. Enter whole member counts and percentages between 0 and 100." };
  const { unit_id, month, revision, values } = parsed.data;
  if (![...countFields, ...subgroupCounts, ...percentFields].some((key) => values[key] !== null)) {
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
  if (error) return { error: "Could not save the report. Try again." };

  revalidatePath("/");
  revalidatePath("/units/[id]", "page");
  return { error: null };
}
