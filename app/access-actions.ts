"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer, previewCookie } from "../lib/supabase";

const accountEmail = z.string().trim().toLowerCase().max(254).pipe(z.email());

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
