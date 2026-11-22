"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { callingLevels, normalizeEmail } from "../lib/directory";
import { createDirectoryClient, getViewer } from "../lib/supabase";

export async function signIn() {
  const client = await createDirectoryClient();
  const appUrl = process.env.APP_URL;
  if (!client || !appUrl) redirect("/?auth=configuration");
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: new URL("/auth/callback", appUrl).href },
  });
  if (error || !data.url) redirect("/?auth=failed");
  redirect(data.url);
}

export async function signOut() {
  const client = await createDirectoryClient();
  await client?.auth.signOut({ scope: "local" });
  redirect("/");
}

const name = z.string().trim().min(1).max(150);
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const uuid = z.uuid();
const date = z.iso.date().nullable();
const schemas = {
  units: z.object({
    name, kind: z.enum(["region", "council", "stake", "ward", "branch"]),
    parent_id: uuid.nullable(),
  }),
  contacts: z.object({ name, email: email.nullable(), phone: z.string().trim().max(50).nullable() }),
  calling_types: z.object({ name, level: z.enum(callingLevels) }),
  positions: z.object({
    unit_id: uuid, calling_type_id: uuid, level: z.enum(callingLevels),
    multiple_holders: z.boolean(), retired_on: date, successor_id: uuid.nullable(),
  }),
  assignments: z.object({ position_id: uuid, contact_id: uuid, sustained_on: date, released_on: date }),
  directory_access: z.object({ email }),
};
export type Resource = keyof typeof schemas;

function databaseError(error: { code: string; message: string }) {
  if (error.code === "23503") return "This record is still linked to other records. Remove those links first.";
  if (error.code === "23505") return "A record with these details already exists.";
  if (error.code === "23514") return "Check the dates and required relationships before saving.";
  if (error.code === "P0001") return error.message;
  return "The change could not be saved. Please try again.";
}

export async function saveRecord(resource: Resource, id: string | null, values: unknown) {
  const viewer = await getViewer();
  if (!viewer?.role) return { error: "You need approved directory access." };
  if (!Object.hasOwn(schemas, resource)) return { error: "Unknown record type." };
  const parsed = schemas[resource].safeParse(values);
  if (!parsed.success) return { error: "Check the required fields, dates, and email address." };

  let error;
  if (resource === "directory_access") {
    if (viewer.role !== "admin" || id) return { error: "Only the administrator can grant access." };
    ({ error } = await viewer.client.from(resource).insert(parsed.data));
  } else {
    if (id !== null && !uuid.safeParse(id).success) return { error: "Invalid record." };
    const table = viewer.client.from(resource);
    const result = id
      ? await table.update(parsed.data).eq("id", id).select("id").single()
      : await table.insert(parsed.data).select("id").single();
    ({ error } = result);
  }
  if (error) return { error: databaseError(error) };
  revalidatePath("/");
  return { error: null };
}

export async function deleteRecord(resource: Resource, id: string) {
  const viewer = await getViewer();
  if (!viewer?.role) return { error: "You need approved directory access." };
  if (!Object.hasOwn(schemas, resource)) return { error: "Unknown record type." };
  if (resource === "directory_access" && viewer.role !== "admin") {
    return { error: "Only the administrator can revoke access." };
  }
  const key = resource === "directory_access" ? "email" : "id";
  const parsed = (key === "email" ? email : uuid).safeParse(id);
  if (!parsed.success) return { error: "Invalid record." };
  const { error } = await viewer.client.from(resource).delete().eq(key, parsed.data).select(key).single();
  if (error) return { error: databaseError(error) };
  revalidatePath("/");
  return { error: null };
}

const draftSchema = z.object({
  id: uuid,
  contacts: z.array(z.object({ id: uuid, email })).min(1).max(5000),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
});
type Dispatch = {
  id: string;
  created_at: string;
  subject: string;
  body: string;
  from_address: string;
  reply_to: string;
  recipients: string[];
  accepted_batches: number[];
};
export type SendResult = { sent: number; total: number; error: string | null; saved: boolean };
const batchSize = 100;

export async function sendEmail(input: unknown): Promise<SendResult> {
  const fail = (error: string): SendResult => ({ sent: 0, total: 0, error, saved: false });
  const viewer = await getViewer();
  if (!viewer?.role) return fail("You need approved directory access.");
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) return fail("Email sending needs Resend configuration.");
  const request = z.union([draftSchema, z.object({ id: uuid }).strict()]).safeParse(input);
  if (!request.success) return fail("Check the recipients, subject, and message.");
  const { data: draft } = request;

  let { data, error } = await viewer.client.from("email_dispatches").select("*").eq("id", draft.id).maybeSingle();
  if (error) return fail("Could not load this email.");
  if (!data) {
    if (!("contacts" in draft)) return fail("This email could not be found.");
    const expected = new Map(draft.contacts.map((contact) => [contact.id, contact.email]));
    const ids = [...expected.keys()];
    const recipients = new Set<string>();
    for (let start = 0; start < ids.length; start += batchSize) {
      const { data: contacts, error: lookupError } = await viewer.client.from("contacts")
        .select("id,email").in("id", ids.slice(start, start + batchSize));
      if (lookupError) return fail("Could not verify the recipients.");
      for (const contact of contacts) {
        const address = contact.email && normalizeEmail(contact.email);
        if (address === expected.get(contact.id) && email.safeParse(address).success) recipients.add(address);
      }
      if (contacts.length !== Math.min(batchSize, ids.length - start)
        || contacts.some((contact) => !contact.email || normalizeEmail(contact.email) !== expected.get(contact.id))) {
        revalidatePath("/");
        return fail("A selected contact’s email changed. Review the recipients and try again.");
      }
    }
    if (recipients.size < 1 || recipients.size > 1000) return fail("Select between 1 and 1,000 valid email addresses.");
    ({ data, error } = await viewer.client.from("email_dispatches").insert({
      id: draft.id, subject: draft.subject, body: draft.body, from_address: from,
      recipients: [...recipients].sort(),
    }).select("*").single());
    if (error?.code === "23505") {
      ({ data, error } = await viewer.client.from("email_dispatches").select("*").eq("id", draft.id).single());
    }
    if (error || !data) return fail("Could not save this email for sending.");
  }

  const dispatch = data as Dispatch;
  const total = dispatch.recipients.length;
  const completed = new Set(dispatch.accepted_batches);
  let sent = [...completed].reduce((count, index) => count + Math.min(batchSize, total - index * batchSize), 0);
  const result = (error: string | null): SendResult => {
    revalidatePath("/");
    return { total, sent, error, saved: true };
  };
  if (sent === total) return result(null);
  if (dispatch.from_address !== from) return result("The sender address changed. This send cannot be resumed.");
  if (Date.now() - new Date(dispatch.created_at).getTime() > 23 * 60 * 60 * 1000) {
    return result("This send is too old to retry safely. Check Resend for the final status.");
  }

  for (let start = 0; start < total; start += batchSize) {
    const index = start / batchSize;
    if (completed.has(index)) continue;
    const addresses = dispatch.recipients.slice(start, start + batchSize);
    try {
      const response = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `directory/${dispatch.id}/${index}`,
        },
        body: JSON.stringify(addresses.map((to) => ({
          to: [to], from, subject: dispatch.subject, text: dispatch.body, reply_to: dispatch.reply_to,
        }))),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        return result(response.status === 429
          ? "Resend is limiting requests. Try resuming in a moment."
          : "Resend did not accept the batch. Check the Resend dashboard before resuming.");
      }
      const receipt = await response.json();
      if (!Array.isArray(receipt.data) || receipt.data.length !== addresses.length ||
          !receipt.data.every((entry: { id?: string }) => typeof entry?.id === "string")) {
        return result("Resend did not confirm every recipient in the batch. Check the Resend dashboard before resuming.");
      }
      const { error: saveError } = await viewer.client.rpc("record_accepted_batch", {
        dispatch_id: dispatch.id, batch_number: index,
      });
      if (saveError) return result("Could not record the batch. Resume to confirm it without sending it twice.");
      sent += addresses.length;
    } catch {
      return result("The send was interrupted. Resume to check and finish the remaining emails.");
    }
  }
  return result(null);
}
