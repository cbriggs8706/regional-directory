"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer, previewCookie } from "../lib/supabase";

const accountEmail = z.string().trim().toLowerCase().max(254).pipe(z.email());
const calendarMigration = "Apply the 202611270045_calendar_visit_access.sql migration in Supabase to manage calendar access.";

export async function saveCouncilAccess(input: unknown) {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") return { error: "Only the administrator can manage council access." };

  const parsed = z.object({
    email: accountEmail, councilIds: z.array(z.uuid()), grantAccess: z.boolean(),
  }).safeParse(input);
  if (!parsed.success) return { error: "Check the Google account email and selected councils." };
  const { email, councilIds, grantAccess } = parsed.data;

  const { error } = await viewer.client.rpc("save_council_access", {
    account_email: email, council_ids: councilIds, grant_access: grantAccess,
  });
  if (error?.code === "23505") return { error: "This Google account already has access. Use Edit councils." };
  if (error?.code === "23503") return { error: "A selected coordinating council is no longer available." };
  if (error) return { error: error.code === "P0001" ? error.message : "Could not save council access. Please try again." };
  revalidatePath("/", "layout");
  return { error: null };
}

export async function loadCalendarAccess(email: string): Promise<{ emails: string[]; error: string | null }> {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") return { emails: [], error: "Only the administrator can manage calendar access." };
  const parsed = accountEmail.safeParse(email);
  if (!parsed.success) return { emails: [], error: "Check the Google account email." };

  const { data, error } = await viewer.client.from("directory_calendar_visit_access")
    .select("owner_email").eq("viewer_email", parsed.data);
  if (error) return { emails: [], error: ["PGRST205", "42P01"].includes(error.code) ? calendarMigration : "Could not load calendar access." };
  return { emails: data.map(({ owner_email }) => owner_email as string), error: null };
}

export async function saveCalendarAccess(input: unknown) {
  const viewer = await getViewer({ write: true });
  if (viewer?.role !== "admin") return { error: "Only the administrator can manage calendar access." };
  const parsed = z.object({ email: accountEmail, visibleEmails: z.array(accountEmail) }).safeParse(input);
  if (!parsed.success || parsed.data.visibleEmails.includes(parsed.data.email)) {
    return { error: "Choose valid accounts other than the account being edited." };
  }

  const { error } = await viewer.client.rpc("save_calendar_visit_access", {
    account_email: parsed.data.email, visible_emails: parsed.data.visibleEmails,
  });
  if (!error) return { error: null };
  if (["PGRST202", "42883"].includes(error.code)) return { error: calendarMigration };
  if (error.code === "23503" || error.code === "P0001") return { error: "One of these accounts is no longer available. Refresh the page and try again." };
  return { error: "Could not save calendar access. Please try again." };
}

export async function startAccessPreview(form: FormData) {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") redirect("/");
  const parsed = accountEmail.safeParse(form.get("email"));
  if (!parsed.success) redirect("/?tab=access");
  const { data } = await viewer.client.from("directory_access")
    .select("email").eq("email", parsed.data).eq("is_admin", false).maybeSingle();
  if (!data) redirect("/?tab=access");

  const jar = await cookies();
  jar.set(previewCookie, data.email, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
  });
  redirect("/");
}

export async function exitAccessPreview() {
  const jar = await cookies();
  jar.delete(previewCookie);
  redirect("/?tab=access");
}
