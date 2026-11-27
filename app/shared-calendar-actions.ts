"use server";

import { z } from "zod";
import { normalizeEmail, type WardConference } from "../lib/directory";
import type { OrganizationEvent } from "../lib/organizations";
import { getViewer } from "../lib/supabase";
import { offsetDate, offsetMonth, type VisitEvent } from "../lib/visits";

type Viewer = NonNullable<Awaited<ReturnType<typeof getViewer>>>;
type CalendarEvent = Pick<OrganizationEvent, "id" | "title" | "event_date" | "end_date">;
type SharedPersonalEvent = CalendarEvent & { owner_email: string };
type EventTables = {
  ward_conferences: WardConference;
  organization_events: OrganizationEvent;
  calendar_events: CalendarEvent;
  private_calendar_events: CalendarEvent;
  visit_events: VisitEvent;
};

const eventDate = z.iso.date().refine((value) => value >= "0001-01-01");
const calendarEventSchema = z.object({
  title: z.string().trim().min(1).max(150),
  event_date: eventDate,
  end_date: eventDate.nullable(),
});

const privateEventsMigrationMessage = "Private events need the 202611260039_private_calendar_events.sql migration in Supabase.";

function isMissingTable(code: string | undefined) {
  return code === "PGRST205" || code === "42P01";
}

async function loadEvents<Table extends keyof EventTables>(client: Viewer["client"], table: Table, from: string, until: string, ownerId?: string) {
  const rows: EventTables[Table][] = [];
  for (let start = 0; ; start += 500) {
    const query = client.from(table).select("*");
    if (table === "ward_conferences") query.lt("begins_on", until).gte("ends_on", from);
    else if (table === "visit_events") {
      query.lt("event_date", until);
      if (from === "0001-01-01") query.gte("event_date", from);
      else query.or(`event_date.gte.${from},and(event_date.eq.${offsetDate(from, -1)},end_minute.gt.1440)`);
    } else query.lt("event_date", until).or(`end_date.gte.${from},and(end_date.is.null,event_date.gte.${from})`);
    if (ownerId) query.eq("owner_id", ownerId);

    const { data, error } = await query.order("id").range(start, start + 499);
    if (error) return { rows: [], failed: true, code: error.code };
    rows.push(...data as EventTables[Table][]);
    if (data.length < 500) return { rows, failed: false };
  }
}

async function loadSharedPersonalEvents(client: Viewer["client"], from: string, until: string) {
  const rows: SharedPersonalEvent[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await client.rpc("shared_personal_calendar_events", { from_date: from, until_date: until })
      .order("id").range(start, start + 499);
    if (error) return { rows: [], error };
    rows.push(...data as SharedPersonalEvent[]);
    if (data.length < 500) return { rows, error: null };
  }
}

export async function loadCalendarEvents(from: string) {
  const viewer = await getViewer();
  if (!viewer?.role || !eventDate.safeParse(from).success || !from.endsWith("-01")) {
    return { wardConferences: [], organizationEvents: [], globalEvents: [], personalEvents: [], sharedPersonalEvents: [], visits: [], visitAccounts: [], errors: ["Could not load calendar events."] };
  }

  const { client, user, previewEmail } = viewer;
  const until = offsetMonth(from, 1);
  const [wards, organizations, global, personal, sharedPersonal, visits, accounts] = await Promise.all([
    loadEvents(client, "ward_conferences", from, until),
    loadEvents(client, "organization_events", from, until),
    loadEvents(client, "calendar_events", from, until),
    previewEmail ? null : loadEvents(client, "private_calendar_events", from, until, user.id),
    loadSharedPersonalEvents(client, from, until),
    loadEvents(client, "visit_events", from, until),
    client.rpc("calendar_visit_accounts"),
  ]);
  const errors = [];
  if (wards.failed) errors.push("Could not load ward and branch conferences.");
  if (organizations.failed) errors.push("Could not load organization events.");
  if (global.failed) errors.push("Could not load global events.");
  if (personal?.failed) errors.push(isMissingTable(personal.code) ? privateEventsMigrationMessage : "Could not load your personal events.");
  if (visits.failed) errors.push("Could not load scheduled visits.");
  if (accounts.error) errors.push(["PGRST202", "42883"].includes(accounts.error.code)
    ? "Apply the 202611270045_calendar_visit_access.sql migration in Supabase to see other calendars."
    : "Could not load calendar access.");
  const visitAccounts = new Set<string>(accounts.data ?? []);
  if (sharedPersonal.error && visitAccounts.size > 0) errors.push(["PGRST202", "42883"].includes(sharedPersonal.error.code)
    ? "Apply the 202611270047_shared_personal_calendar_events.sql migration in Supabase to see shared personal events."
    : "Could not load shared personal events.");
  const previewOwner = previewEmail ? normalizeEmail(previewEmail) : null;
  return {
    wardConferences: wards.rows, organizationEvents: organizations.rows, globalEvents: global.rows,
    personalEvents: personal?.rows ?? [],
    sharedPersonalEvents: sharedPersonal.rows.filter(({ owner_email }) => visitAccounts.has(owner_email)),
    visitAccounts: [...visitAccounts],
    visits: visits.rows.filter((visit) => {
      const owner = normalizeEmail(visit.owner_email);
      return (!previewOwner && visit.owner_id === user.id)
        || (visit.unit_id !== null && (owner === previewOwner || visitAccounts.has(owner)));
    }),
    errors,
  };
}

function parseCalendarEvent(input: unknown) {
  const parsed = calendarEventSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the event title and dates." };
  const { event_date, end_date } = parsed.data;
  if (end_date && end_date < event_date) return { error: "End date must be on or after the start date." };
  return { error: null, data: parsed.data };
}

export async function addCalendarEvent(input: unknown) {
  const viewer = await getViewer({ write: true });
  if (!viewer?.role) return { error: "You need approved directory access." };
  const parsed = parseCalendarEvent(input);
  if (parsed.error !== null) return { error: parsed.error };

  const { error } = await viewer.client.from("calendar_events").insert(parsed.data);
  if (isMissingTable(error?.code)) {
    return { error: "Apply the calendar events migration in Supabase to add events." };
  }
  if (error) return { error: "Could not save this event. Try again." };
  return { error: null, date: parsed.data.event_date };
}

export async function savePrivateCalendarEvent(input: unknown, id: string | null) {
  const viewer = await getViewer({ write: true });
  if (!viewer?.role) return { error: "You need approved directory access." };
  if (id !== null && !z.uuid().safeParse(id).success) return { error: "Could not find this event." };
  const parsed = parseCalendarEvent(input);
  if (parsed.error !== null) return { error: parsed.error };

  const table = viewer.client.from("private_calendar_events");
  const query = id === null ? table.insert(parsed.data) : table.update(parsed.data).eq("id", id).eq("owner_id", viewer.user.id);
  const { error } = await query.select("id").single();
  if (isMissingTable(error?.code)) {
    return { error: privateEventsMigrationMessage };
  }
  if (error) return { error: "Could not save this personal event. Try again." };
  return { error: null, date: parsed.data.event_date };
}

export async function deletePrivateCalendarEvent(id: string) {
  const viewer = await getViewer({ write: true });
  if (!viewer?.role) return { error: "You need approved directory access." };
  if (!z.uuid().safeParse(id).success) return { error: "Could not find this event." };
  const { error } = await viewer.client.from("private_calendar_events").delete().eq("id", id)
    .eq("owner_id", viewer.user.id).select("id").single();
  return { error: error ? "Could not remove this personal event." : null };
}
