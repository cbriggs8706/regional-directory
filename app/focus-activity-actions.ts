"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { reportMonthPattern } from "../lib/family-history";
import type { FocusMetric } from "../lib/focus-people";
import { getViewer } from "../lib/supabase";

const status = z.boolean().nullable();
const activitySchema = z.object({
  contact_id: z.uuid(),
  month: z.string().regex(reportMonthPattern),
  revision: z.uuid().nullable(),
  values: z.object({
    submitters: status,
    familysearch_logins: status,
    added_ancestor: status,
    added_memory: status,
    first_four_generations: status,
  } satisfies Record<FocusMetric, typeof status>),
});

export async function saveFocusActivity(input: unknown) {
  const viewer = await getViewer({ write: true });
  if (!viewer?.role) return { error: "You need approved directory access." };
  const parsed = activitySchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a valid reporting month and activity status." };

  const { contact_id, month, revision, values } = parsed.data;
  const report_month = `${month}-01`;
  const table = viewer.client.from("focus_person_activity");
  const edited = { ...values, revision: crypto.randomUUID() };
  const { data, error } = await (revision
    ? table.update(edited).eq("contact_id", contact_id).eq("report_month", report_month)
      .eq("revision", revision).select("revision").maybeSingle()
    : table.insert({ contact_id, report_month, ...edited }).select("revision").single());

  if (error?.code === "23505" || (!error && !data)) {
    return { error: "This activity changed after you opened it. Close the form and refresh the page before editing again." };
  }
  if (error?.code === "23503" || error?.code === "42501") {
    return { error: "This person is no longer available for focus activity. Refresh the page." };
  }
  if (error) return { error: "Could not save the activity. Try again." };

  revalidatePath("/units/[id]", "page");
  return { error: null };
}
