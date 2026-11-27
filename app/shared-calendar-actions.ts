"use server";

import { z } from "zod";
import type { WardConference } from "../lib/directory";
import type { OrganizationEvent } from "../lib/organizations";
import { getViewer } from "../lib/supabase";
import { offsetMonth } from "../lib/visits";

type Viewer = NonNullable<Awaited<ReturnType<typeof getViewer>>>;
type CalendarEvent = Pick<OrganizationEvent, "id" | "title" | "event_date" | "end_date">;
type EventTables = {
  ward_conferences: WardConference;
  organization_events: OrganizationEvent;
  calendar_events: CalendarEvent;
  private_calendar_events: CalendarEvent;
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
    else query.lt("event_date", until).or(`end_date.gte.${from},and(end_date.is.null,event_date.gte.${from})`);
    if (ownerId) query.eq("owner_id", ownerId);

    const { data, error } = await query.order("id").range(start, start + 499);
    if (error) return { rows: [], failed: true, code: error.code };
    rows.push(...data as EventTables[Table][]);
    if (data.length < 500) return { rows, failed: false };
  }
}

export async function loadSharedCalendarEvents(from: string) {
  const viewer = await getViewer();
  if (!viewer?.role || !z.iso.date().safeParse(from).success || !from.endsWith("-01")) {
    return { wardConferences: [], organizationEvents: [], calendarEvents: [], errors: ["Could not load calendar events."] };
  }

  const until = offsetMonth(from, 1);
  const [wards, organizations, calendar] = await Promise.all([
    loadEvents(viewer.client, "ward_conferences", from, until),
    loadEvents(viewer.client, "organization_events", from, until),
    loadEvents(viewer.client, "calendar_events", from, until),
  ]);
  const errors = [];
  if (wards.failed) errors.push("Could not load ward and branch conferences.");
  if (organizations.failed) errors.push("Could not load organization events.");
  if (calendar.failed) errors.push("Could not load standalone calendar events.");
  return { wardConferences: wards.rows, organizationEvents: organizations.rows, calendarEvents: calendar.rows, errors };
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

export async function loadPrivateCalendarEvents(from: string) {
  const viewer = await getViewer();
  if (!viewer?.role || !eventDate.safeParse(from).success || !from.endsWith("-01")) {
    return { events: [], error: "Could not load your private events." };
  }

  const { rows, failed, code } = await loadEvents(viewer.client, "private_calendar_events", from, offsetMonth(from, 1), viewer.user.id);
  if (isMissingTable(code)) return { events: [], error: privateEventsMigrationMessage };
  return { events: rows, error: failed ? "Could not load your private events." : null };
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
  if (error) return { error: "Could not save this private event. Try again." };
  return { error: null, date: parsed.data.event_date };
}

export async function deletePrivateCalendarEvent(id: string) {
  const viewer = await getViewer({ write: true });
  if (!viewer?.role) return { error: "You need approved directory access." };
  if (!z.uuid().safeParse(id).success) return { error: "Could not find this event." };
  const { error } = await viewer.client.from("private_calendar_events").delete().eq("id", id)
    .eq("owner_id", viewer.user.id).select("id").single();
  return { error: error ? "Could not remove this private event." : null };
}
