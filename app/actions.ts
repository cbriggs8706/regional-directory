"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createHash } from "node:crypto";
import { buildingPhotoMaxBytes, buildingPhotoTypes, callingLevels, childUnitEntry, normalizeEmail, unitLabels, type Building, type Contact } from "../lib/directory";
import { contactNameMatcher } from "../lib/contact-name-match";
import { focusTypes } from "../lib/focus-people";
import { languageColors } from "../lib/language-colors";
import { createDirectoryClient, getViewer, previewCookie } from "../lib/supabase";
import { standardCallingGroups, standardGroupFor, standardRoleIndex, type StandardCalling } from "../lib/standard-callings";

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
  (await cookies()).delete(previewCookie);
  redirect("/");
}

const name = z.string().trim().min(1).max(150);
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const phone = z.string().trim().max(50).nullable();
const contactDetails = z.object({ email: email.nullable(), phone });
const uuid = z.uuid();
const date = z.iso.date().nullable();
const conferenceDates = { begins_on: z.iso.date(), ends_on: z.iso.date() };
const validConferenceDates = ({ begins_on, ends_on }: { begins_on: string; ends_on: string }) => ends_on >= begins_on;
const meetingTime = z.iso.time({ precision: -1 }).nullable().optional();
const assignmentDetails = { sustained_on: date, released_on: date, assignment_labels: z.array(z.string().trim().min(1)) };
const buildingIds = z.array(uuid);
const homeWard = uuid.nullable().optional();
const webUrl = z.string().trim().pipe(z.url({ protocol: /^https?$/, normalize: true }))
  .pipe(z.string().max(2048));
const schemas = {
  units: z.object({
    name, kind: z.enum(["region", "council", "stake", "ward", "branch"]),
    parent_id: uuid.nullable(),
    website_url: webUrl.nullable().optional(),
    facebook_urls: z.array(webUrl).transform((urls) => [...new Set(urls)]).optional(),
    building_id: uuid.nullable().optional(),
    language_id: uuid.nullable().optional(),
    has_sub_congregation: z.boolean().optional(),
    sub_congregation_language_id: uuid.nullable().optional(),
    sacrament_meeting_time: meetingTime,
    sacrament_meeting_first: z.boolean().nullable().optional(),
    first_meeting_time: meetingTime,
    council_meeting_time: meetingTime,
    tfh_coordinating_council_time: meetingTime,
    stake_council_time: meetingTime,
    notes: z.string().trim().max(2000).nullable().optional(),
  }),
  buildings: z.object({
    address: z.string().trim().min(1).max(300),
    city: name,
    state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
    zip_code: z.string().trim().regex(/^\d{5}(-\d{4})?$/),
    agent_stake_id: uuid.nullable(),
  }),
  stake_conferences: z.object({ stake_id: uuid, ...conferenceDates }).refine(validConferenceDates),
  ward_conferences: z.object({ unit_id: uuid, ...conferenceDates }).refine(validConferenceDates),
  languages: z.object({ name, color: z.enum(languageColors) }),
  contacts: z.discriminatedUnion("focus_type", [
    contactDetails.extend({ focus_type: z.undefined().optional(), name, home_ward_id: homeWard }),
    z.object({
      ...contactDetails.shape, focus_type: z.enum(focusTypes), first_name: name, last_name: name,
      ward_id: uuid, home_ward_id: homeWard, is_whatsapp: z.boolean(), baptized_on: date,
      helper_number: z.string().trim().regex(/^[0-9]+$/).nullable(),
      pid: z.string().trim().regex(/^[A-Za-z0-9]+$/).nullable(),
    }).refine(({ first_name, last_name }) => first_name.length + last_name.length < 150)
      .transform((person) => ({ ...person, name: `${person.first_name} ${person.last_name}` })),
  ]),
  organizations: z.object({ name, level: z.enum(callingLevels), sort_order: z.int32().positive().nullable() }),
  calling_types: z.object({ name, level: z.enum(callingLevels), organization_id: uuid }),
  positions: z.object({
    unit_id: uuid, calling_type_id: uuid, level: z.enum(callingLevels),
    retired_on: date, successor_id: uuid.nullable(),
  }),
  assignments: z.object({ position_id: uuid, contact_id: uuid, ...assignmentDetails }),
  directory_access: z.object({ email }),
};
export type Resource = keyof typeof schemas;

function databaseError(error: { code: string; message: string }) {
  if (error.code === "23503" && error.message.includes("assignment_buildings_building_id_fkey")) {
    return "A selected building is no longer available. Reopen the assignment and choose an existing building.";
  }
  if (error.code === "23503" && error.message.includes("assignments_active_contact_fk")) {
    return "Focus people cannot hold an active calling. Release the existing calling before changing the person type.";
  }
  if (error.code === "23503" && error.message.includes("contacts_ward_fk")) {
    return "Choose an existing ward or branch. Reassign any focus people before removing their ward or branch.";
  }
  if (error.code === "23503" && error.message.includes("contacts_home_ward_fk")) {
    return "Choose an existing ward or branch for Home Ward.";
  }
  if (error.code === "23503" && error.message.includes("calling_organization_fk")) {
    return "Choose an organization at the same level, or move its callings before removing it.";
  }
  if (error.code === "23503") return "This record is still linked to other records. Remove those links first.";
  if (error.code === "23505") return "A record with these details already exists.";
  if (error.code === "23514" && error.message.includes("valid_sub_congregation")) {
    return "Choose a different language for the sub-congregation, or uncheck the sub-congregation box.";
  }
  if (error.code === "23514") return "Check the dates and required relationships before saving.";
  if (error.code === "P0001") return error.message;
  return "The change could not be saved. Please try again.";
}

function revalidateDirectory() {
  revalidatePath("/");
  revalidatePath("/units/[id]", "page");
  revalidatePath("/buildings");
  revalidatePath("/languages");
}

export async function checkContactName(value: unknown) {
  const parsed = name.safeParse(value);
  if (!parsed.success) return { matches: null };
  const viewer = await getViewer({ write: true });
  if (!viewer?.role) return { matches: null };

  type ContactMatch = Pick<Contact, "id" | "name" | "phone" | "email" | "home_ward_id">;
  const scoreName = contactNameMatcher(parsed.data);
  const matches: { contact: ContactMatch; score: number }[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await viewer.client.from("contacts").select("id,name,phone,email,home_ward_id")
      .order("id").range(start, start + 499);
    if (error) return { matches: null };
    for (const contact of data) {
      const score = scoreName(contact.name);
      if (score !== null) matches.push({ contact, score });
    }
    if (data.length < 500) break;
  }

  matches.sort((a, b) => b.score - a.score || a.contact.name.localeCompare(b.contact.name));
  return { matches: matches.map(({ contact }) => contact) };
}

export async function saveContactDetails(id: string, values: unknown) {
  const viewer = await getViewer({ write: true });
  if (!viewer?.role) return { error: "You need approved directory access." };
  if (!uuid.safeParse(id).success) return { error: "Invalid contact." };

  const parsed = contactDetails.safeParse(values);
  if (!parsed.success) return { error: "Check the phone number and email address." };

  const { error } = await viewer.client.from("contacts")
    .update(parsed.data).eq("id", id).select("id").single();
  if (error) return { error: databaseError(error) };

  revalidateDirectory();
  revalidatePath("/organizations/[id]", "page");
  return { error: null };
}

export async function saveRecord(resource: Resource, id: string | null, values: unknown) {
  const viewer = await getViewer({ write: true });
  if (!viewer?.role) return { error: "You need approved directory access." };
  if (!Object.hasOwn(schemas, resource) || resource === "buildings" || resource === "directory_access") {
    return { error: "Unknown record type." };
  }
  const parsed = schemas[resource].safeParse(values);
  if (!parsed.success && parsed.error.issues.some((issue) => issue.path[0] === "website_url")) {
    return { error: "Enter a website URL that starts with http:// or https://." };
  }
  if (!parsed.success && parsed.error.issues.some((issue) => issue.path[0] === "facebook_urls")) {
    return { error: "Each Facebook URL must start with http:// or https:// and be at most 2048 characters." };
  }
  if (!parsed.success && parsed.error.issues.some((issue) => issue.path[0] === "home_ward_id")) {
    return { error: "Choose an existing ward or branch for Home Ward." };
  }
  if (!parsed.success) return { error: resource === "stake_conferences" || resource === "ward_conferences"
    ? "Enter both dates. The end date must be on or after the begin date."
    : resource === "contacts"
      ? "Check the names, ward or branch, email address, and Date Baptized. Use digits for the helper number and letters or digits for the PID."
      : "Check the required fields, dates, times, and email address." };

  if (id !== null && !uuid.safeParse(id).success) return { error: "Invalid record." };
  const table = viewer.client.from(resource);
  const { error } = id
    ? await table.update(parsed.data).eq("id", id).select("id").single()
    : await table.insert(parsed.data).select("id").single();
  if (resource === "contacts" && (error?.code === "PGRST204" || error?.code === "42703")) {
    return { error: error.message.includes("home_ward_id")
      ? "Apply the Home Ward migration in Supabase to save this person."
      : "Apply the Focus People migration in Supabase to save this person." };
  }
  if (resource === "languages" && (error?.code === "PGRST204" || error?.code === "42703")) {
    return { error: "Apply the language colors migration in Supabase to save this language." };
  }
  if (resource === "units" && (error?.code === "PGRST204" || error?.code === "42703") && error.message.includes("facebook_urls")) {
    return { error: "Apply the Facebook URLs migration in Supabase to save these links." };
  }
  if (resource === "units" && (error?.code === "PGRST204" || error?.code === "42703") &&
    /tfh_coordinating_council_time|stake_council_time/.test(error.message)) {
    return { error: "Apply the unit council times migration in Supabase to save these meeting times." };
  }
  if (error) return { error: databaseError(error) };
  revalidateDirectory();
  return { error: null };
}

export async function saveBuilding(id: string | null, form: FormData) {
  const viewer = await getViewer({ write: true });
  if (!viewer?.role) return { error: "You need approved directory access." };
  if (id !== null && !uuid.safeParse(id).success) return { error: "Invalid building." };

  const parsed = schemas.buildings.safeParse({
    address: form.get("address"), city: form.get("city"), state: form.get("state"),
    zip_code: form.get("zip_code"), agent_stake_id: form.get("agent_stake_id") || null,
  });
  if (!parsed.success) return { error: "Enter a street address, city, two-letter state, and valid ZIP code. Check the selected Agent Stake." };

  const buildingId = id ?? crypto.randomUUID();
  const table = viewer.client.from("buildings");
  const photos = viewer.client.storage.from("buildings");
  const file = form.get("photo");
  let previousPhoto: string | null = null;
  let photoPath: string | null = null;
  if (file instanceof File && (file.name || file.size)) {
    const extension = buildingPhotoTypes[file.type as keyof typeof buildingPhotoTypes];
    if (!Object.hasOwn(buildingPhotoTypes, file.type) || file.size === 0 || file.size > buildingPhotoMaxBytes) {
      return { error: "Choose a JPEG, PNG, or WebP picture up to 4 MB." };
    }
    if (id) {
      const { data, error } = await table.select("photo_path").eq("id", id).single();
      if (error) return { error: "Could not load this building. Reopen it and try again." };
      previousPhoto = data.photo_path;
    }
    photoPath = `${buildingId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await photos.upload(photoPath, file, { contentType: file.type });
    if (error) return { error: "The picture could not be uploaded. Please try again." };
  }

  const values = { ...parsed.data, ...(photoPath ? { photo_path: photoPath } : {}) };
  const update = id ? table.update(values).eq("id", id) : null;
  if (update && photoPath) {
    if (previousPhoto) update.eq("photo_path", previousPhoto);
    else update.is("photo_path", null);
  }
  const { data, error } = await (update ?? table.insert({ ...values, id: buildingId }))
    .select("id,address,city,state,zip_code,agent_stake_id,photo_path").maybeSingle<Building>();
  if (error || !data) {
    if (photoPath) await photos.remove([photoPath]);
    if (!error) return { error: "This building changed while you were editing it. Reopen it and try again." };
    if (error.code === "23503") return { error: "Choose an Agent Stake that still exists in the directory." };
    return { error: databaseError(error) };
  }
  if (previousPhoto) await photos.remove([previousPhoto]);
  revalidateDirectory();
  revalidatePath("/organizations");
  revalidatePath("/organizations/[id]", "page");
  return { error: null, building: data };
}

const newHolderSchema = z.object({
  unit_id: uuid, calling_type_id: uuid.optional(),
  standard_role: z.object({ group: z.enum(["bishopric", "stake-presidency", "high-council"]), index: z.int().min(0) }).optional(),
  contact_id: uuid.nullable(), new_contact_name: name.nullable(),
  new_contact_phone: phone, new_contact_email: email.nullable(),
  new_contact_home_ward_id: homeWard,
  ...assignmentDetails, building_ids: buildingIds,
}).refine(({ contact_id, new_contact_name }) => Boolean(contact_id) !== Boolean(new_contact_name))
  .refine(({ new_contact_name, new_contact_home_ward_id }) => !new_contact_home_ward_id || Boolean(new_contact_name))
  .refine(({ calling_type_id, standard_role }) => Boolean(calling_type_id) !== Boolean(standard_role));

async function ensureStandardCalling(client: NonNullable<Awaited<ReturnType<typeof getViewer>>>["client"],
  unitId: string, { group, index }: StandardCalling) {
  const template = standardCallingGroups[group];
  const title = template.roles[index];
  if (!title) return null;
  const { data: unit } = await client.from("units").select("kind").eq("id", unitId).maybeSingle();
  if (unit?.kind !== template.kind) return null;

  const organizations = () => client.from("organizations").select("id,name").eq("level", template.level).order("id");
  const { data: groups, error: lookupError } = await organizations();
  if (lookupError) return null;
  let organization = groups.find(({ name }) => standardGroupFor(name, template.level) === group);
  if (!organization) {
    const { data, error } = await client.from("organizations").insert({ name: template.name, level: template.level })
      .select("id,name").single();
    if (error?.code === "23505") {
      const { data: refreshed } = await organizations();
      organization = refreshed?.find(({ name }) => standardGroupFor(name, template.level) === group);
    } else if (data) organization = data;
  }
  if (!organization) return null;

  const { data: roles, error } = await client.from("calling_types").select("id,name")
    .eq("organization_id", organization.id).order("id");
  if (error) return null;
  const existing = roles.find(({ name }) => standardRoleIndex(group, name) === index);
  if (existing) return existing.id as string;

  // A stable ID lets simultaneous requests set up the same missing calling once.
  // The shared counselor has its own key because the legacy First Counselor used index 1.
  const roleKey = group !== "high-council" && index === 1 ? "counselor" : index;
  const hash = createHash("sha256").update(`standard-calling:${organization.id}:${group}:${roleKey}`).digest("hex");
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const { error: insertError } = await client.from("calling_types").upsert({
    id, name: title, organization_id: organization.id, level: template.level,
  }, { onConflict: "id", ignoreDuplicates: true });
  return insertError ? null : id;
}

export async function addCallingHolder(values: unknown) {
  const viewer = await getViewer({ write: true });
  if (!viewer?.role) return { error: "You need approved directory access." };
  const holder = newHolderSchema.safeParse(values);
  if (!holder.success) return { error: "Check the person’s name, contact information, and assignment dates." };
  const { standard_role, calling_type_id, new_contact_home_ward_id, ...details } = holder.data;
  const callingId = standard_role ? await ensureStandardCalling(viewer.client, details.unit_id, standard_role) : calling_type_id;
  if (!callingId) return { error: "Could not set up this calling. Refresh the unit and try again." };
  const { error } = await viewer.client.rpc("add_calling_holder_with_buildings", {
    ...details, calling_type_id: callingId,
    ...(new_contact_home_ward_id ? { new_contact_home_ward_id } : {}),
  });
  if (error?.code === "PGRST202") return { error: new_contact_home_ward_id
    ? "Apply the Home Ward migration in Supabase before saving this assignment."
    : "Apply the Calling Organizations migration in Supabase before saving assignments." };
  if (error) return { error: databaseError(error) };
  revalidateDirectory();
  return { error: null };
}

const schedulerAssignmentSchema = z.object({ assignment_id: uuid, ...assignmentDetails, building_ids: buildingIds });

export async function saveSchedulerAssignment(values: unknown) {
  const viewer = await getViewer({ write: true });
  if (!viewer?.role) return { error: "You need approved directory access." };
  const parsed = schedulerAssignmentSchema.safeParse(values);
  if (!parsed.success) return { error: "Check the buildings and assignment dates." };
  const { error } = await viewer.client.rpc("update_calling_holder_buildings", parsed.data);
  if (error?.code === "PGRST202") {
    return { error: "Apply the Calling Organizations migration in Supabase before saving assignments." };
  }
  if (error) return { error: databaseError(error) };
  revalidateDirectory();
  return { error: null };
}

const callingOrderSchema = z.object({ organization: uuid, ordered_ids: z.array(uuid).min(1) });

export async function saveCallingOrder(organizationId: string, ids: string[]) {
  const viewer = await getViewer({ write: true });
  if (!viewer?.role) return { error: "You need approved directory access." };
  const parsed = callingOrderSchema.safeParse({ organization: organizationId, ordered_ids: ids });
  if (!parsed.success) return { error: "Could not read the calling order." };
  const { error } = await viewer.client.rpc("save_calling_order", parsed.data);
  if (error) return { error: databaseError(error) };
  revalidateDirectory();
  return { error: null };
}

export async function addChildUnits(parentId: string, parentKind: keyof typeof childUnitEntry, form: FormData) {
  const viewer = await getViewer({ write: true });
  if (!viewer?.role) return { error: "You need approved directory access." };
  if (!uuid.safeParse(parentId).success || !Object.hasOwn(childUnitEntry, parentKind)) {
    return { error: "Choose a valid parent unit." };
  }

  const { fields, plural, emptyMessage } = childUnitEntry[parentKind];
  const parentLabel = unitLabels[parentKind].toLowerCase();
  const requested = fields.flatMap(({ kind }) =>
    String(form.get(kind) ?? "").split(/\r\n|\n|\r/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((name) => ({ name, kind })),
  );
  if (requested.length === 0) return { error: emptyMessage };
  if (requested.some((unit) => !name.safeParse(unit.name).success)) {
    return { error: "Keep each name to 150 characters." };
  }

  const table = viewer.client.from("units");
  const { data: existing, error: lookupError } = await table.select("name,kind").eq("parent_id", parentId);
  if (lookupError) return { error: `Could not check the ${parentLabel}’s existing ${plural}. Please try again.` };

  const unitKey = (unit: { name: string; kind: string }) => `${unit.kind}:${unit.name.trim().toLowerCase()}`;
  const names = new Set(existing.map(unitKey));
  const pending = [];
  for (const unit of requested) {
    const key = unitKey(unit);
    if (names.has(key)) continue;
    names.add(key);
    pending.push({ ...unit, parent_id: parentId });
  }

  if (pending.length > 0) {
    const { error } = await table.insert(pending);
    if (error?.code === "23503") return { error: `This ${parentLabel} is no longer available. Reload and choose a ${parentLabel}.` };
    if (error?.code === "23505") return { error: "A unit name already exists. Check your list and try again." };
    if (error) return { error: databaseError(error) };
  }
  revalidateDirectory();
  return { error: null, added: pending.length, skipped: requested.length - pending.length };
}

export async function deleteRecord(resource: Resource, id: string) {
  const viewer = await getViewer({ write: true });
  if (!viewer?.role) return { error: "You need approved directory access." };
  if (!Object.hasOwn(schemas, resource)) return { error: "Unknown record type." };
  if (resource === "directory_access" && viewer.role !== "admin") {
    return { error: "Only the administrator can revoke access." };
  }
  const key = resource === "directory_access" ? "email" : "id";
  const parsed = (key === "email" ? email : uuid).safeParse(id);
  if (!parsed.success) return { error: "Invalid record." };
  if (resource === "buildings") {
    const { data, error } = await viewer.client.from("buildings").delete().eq("id", parsed.data).select("photo_path").single();
    if (error?.code === "23503" && error.message.includes("assignment_buildings_building_id_fkey")) {
      return { error: "Remove this building from its scheduler assignments before deleting it." };
    }
    if (error) return { error: databaseError(error) };
    if (data.photo_path) await viewer.client.storage.from("buildings").remove([data.photo_path]);
    revalidateDirectory();
    return { error: null };
  }
  const { error } = await viewer.client.from(resource).delete().eq(key, parsed.data).select(key).single();
  if (error) return { error: databaseError(error) };
  revalidateDirectory();
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
  const viewer = await getViewer({ write: true });
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
    const { data: eligible, error: accessError } = await viewer.client.rpc("directory_can_email", { recipient_addresses: addresses });
    if (accessError) return result("Could not verify recipient access. Try again.");
    if (!eligible) return result("A recipient is no longer available in your directory.");
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
