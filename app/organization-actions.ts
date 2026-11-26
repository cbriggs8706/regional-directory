"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "../lib/supabase";
import { agentKinds } from "../lib/organizations";
import { socialChannels } from "../lib/social-links";
import { journalNotesMaxLength } from "../lib/unit-journal";

const id = z.uuid();
const name = z.string().trim().min(1).max(150);
const notes = z.string().trim().max(journalNotesMaxLength).transform((value) => value || null);
const eventDate = z.iso.date().refine((value) => value >= "0001-01-01");
const website = z.union([z.literal("").transform(() => null), z.url({ protocol: /^https?$/ }).max(2048)]);
const socialLinks = z.array(z.object({
  channel: z.enum(Object.keys(socialChannels) as (keyof typeof socialChannels)[]),
  url: z.string().trim().pipe(z.url({ protocol: /^https?$/, normalize: true })).pipe(z.string().max(2048)),
}));
const assignmentFields = { title_id: id, active: z.boolean() };
const assignmentValues = z.union([
  z.strictObject({ ...assignmentFields, contact_id: id }),
  z.strictObject({ ...assignmentFields, new_contact: z.object({
    name,
    phone: z.string().trim().max(50).nullable(),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()).nullable(),
    home_ward_id: id.nullable(),
  }) }),
]);
const mutationSchema = z.discriminatedUnion("resource", [
  z.object({ resource: z.literal("directory_organizations"), id: id.optional(), values: z.object({
    name, type: z.string().trim().min(1).max(100), agent_id: id, agent_kind: z.enum(agentKinds),
    building_id: id.nullable(), website_url: website, social_links: socialLinks.optional(), notes,
  }) }),
  z.object({ resource: z.literal("organization_titles"), id: id.optional(), organizationId: id, values: z.object({ name }) }),
  z.object({ resource: z.literal("organization_assignments"), organizationId: id, values: assignmentValues }),
  z.object({ resource: z.literal("assignment_status"), organizationId: id, id, titleId: id, active: z.boolean() }),
  z.object({ resource: z.literal("organization_events"), id: id.optional(), organizationId: id, values: z.object({
    title: name, event_date: eventDate, end_date: eventDate.nullable(), notes,
  }).refine(({ event_date, end_date }) => end_date === null || end_date >= event_date, {
    path: ["end_date"], error: "End date must be on or after the start date.",
  }) }),
]);

const removalSchema = z.object({
  resource: z.enum(["directory_organizations", "organization_titles", "organization_events", "organization_assignments"]),
  organizationId: id,
  id,
});

const titleOrderSchema = z.object({ organization: id, ordered_ids: z.array(id).min(1) });

function refreshOrganizations() {
  revalidatePath("/organizations");
  revalidatePath("/organizations/[id]", "page");
  revalidatePath("/units/[id]", "page");
  revalidatePath("/");
  revalidatePath("/report-generator");
}

export async function saveOrganizationRecord(input: unknown) {
  const viewer = await getViewer();
  if (!viewer?.role) return { error: "You need approved directory access." };
  const parsed = mutationSchema.safeParse(input);
  if (!parsed.success) {
    const resource = typeof input === "object" && input !== null && "resource" in input ? input.resource : undefined;
    if (parsed.error.issues.some((issue) => issue.path[1] === "social_links")) {
      return { error: "Choose a channel and enter a valid http:// or https:// URL for each social link." };
    }
    if (resource === "organization_assignments") {
      return { error: "Choose a person or check the new person’s name and contact information." };
    }
    if (resource === "organization_events") {
      const dateOrderError = parsed.error.issues.find((issue) =>
        issue.code === "custom" && issue.path.join(".") === "values.end_date" &&
        issue.message === "End date must be on or after the start date.");
      return { error: dateOrderError?.message ?? "Check the event title, dates, and notes." };
    }
    return { error: "Check the required fields and website." };
  }
  const record = parsed.data;
  const { client } = viewer;

  if (record.resource === "assignment_status" || (record.resource === "organization_assignments" && "contact_id" in record.values)) {
    const titleId = record.resource === "organization_assignments" ? record.values.title_id : record.titleId;
    const title = await client.from("organization_titles").select("id")
      .eq("id", titleId).eq("organization_id", record.organizationId).maybeSingle();
    if (title.error || !title.data) return { error: "This assignment title is unavailable." };
  }

  let result;
  if (record.resource === "assignment_status") {
    result = await client.from("organization_assignments").update({ active: record.active })
      .eq("id", record.id).eq("title_id", record.titleId).select("id").maybeSingle();
  } else if (record.resource === "organization_assignments") {
    if ("new_contact" in record.values) {
      const { new_contact, title_id, active } = record.values;
      const { data, error } = await client.rpc("add_organization_assignment_with_contact", {
        organization_id: record.organizationId, title_id, active,
        contact_name: new_contact.name, contact_phone: new_contact.phone,
        contact_email: new_contact.email, contact_home_ward_id: new_contact.home_ward_id,
      });
      if (error?.code === "PGRST202") return { error: "Apply the organization assignment migration in Supabase to add new people here." };
      result = { data: data ? { id: data } : null, error };
    } else {
      result = await client.from(record.resource).insert(record.values).select("id").single();
    }
  } else if (record.resource === "directory_organizations") {
    const table = client.from(record.resource);
    result = await (record.id
      ? table.update(record.values).eq("id", record.id).select("id").maybeSingle()
      : table.insert(record.values).select("id").single());
  } else {
    const table = client.from(record.resource);
    result = await (record.id
      ? table.update(record.values).eq("id", record.id).eq("organization_id", record.organizationId).select("id").maybeSingle()
      : table.insert({ ...record.values, organization_id: record.organizationId }).select("id").single());
  }

  if (result.error?.code === "23505") return { error: record.resource === "organization_assignments"
    ? "This person already has this assignment. Edit their existing assignment to change its status."
    : "That name is already in use." };
  if (result.error?.code === "23503") return { error: "A selected record is unavailable. Refresh and try again." };
  if (record.resource === "directory_organizations" && (result.error?.code === "PGRST204" || result.error?.code === "42703")
    && result.error.message.includes("social_links")) {
    return { error: "Apply the organization social links migration in Supabase to save these links." };
  }
  if (result.error || !result.data) return { error: "Could not save this record. Refresh and try again." };
  refreshOrganizations();
  return { error: null, id: result.data.id as string };
}

export async function removeOrganizationRecord(input: unknown) {
  const viewer = await getViewer();
  if (!viewer?.role) return { error: "You need approved directory access." };
  const parsed = removalSchema.safeParse(input);
  if (!parsed.success) return { error: "This record is unavailable." };
  const record = parsed.data;
  if (record.resource === "organization_assignments") {
    const { data, error } = await viewer.client.rpc("delete_organization_assignment", {
      organization: record.organizationId, assignment: record.id,
    });
    if (error?.code === "PGRST202") return { error: "Apply the organization assignment management migration in Supabase to delete assignments." };
    if (error || !data) return { error: "Could not delete this assignment. Refresh and try again." };
    refreshOrganizations();
    return { error: null };
  }
  const query = viewer.client.from(record.resource).delete().eq("id", record.id);
  const scoped = record.resource === "directory_organizations" ? query : query.eq("organization_id", record.organizationId);
  const { data, error } = await scoped.select("id").maybeSingle();
  if (error?.code === "23503") return { error: record.resource === "organization_titles"
    ? "Delete all active and inactive assignments for this title before deleting it."
    : "This record has linked assignments, titles, journal entries, or events." };
  if (error || !data) return { error: "Could not delete this record. Refresh and try again." };
  refreshOrganizations();
  return { error: null };
}

export async function saveOrganizationTitleOrder(organization: string, ids: string[]) {
  const viewer = await getViewer();
  if (!viewer?.role) return { error: "You need approved directory access." };
  const parsed = titleOrderSchema.safeParse({ organization, ordered_ids: ids });
  if (!parsed.success) return { error: "Could not read the assignment title order." };
  const { error } = await viewer.client.rpc("save_organization_title_order", parsed.data);
  if (error?.code === "PGRST202") return { error: "Apply the organization assignment management migration in Supabase to save the order." };
  if (error?.code === "22023") return { error: "The assignment titles changed. Close the reorder list, refresh, and try again." };
  if (error) return { error: "Could not save the assignment title order. Try again." };
  refreshOrganizations();
  return { error: null };
}
