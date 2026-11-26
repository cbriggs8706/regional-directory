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
};

const eventDate = z.iso.date().refine((value) => value >= "0001-01-01");
const calendarEventSchema = z.object({
  title: z.string().trim().min(1).max(150),
  event_date: eventDate,
  end_date: eventDate.nullable(),
});

async function loadEvents<Table extends keyof EventTables>(client: Viewer["client"], table: Table, from: string, until: string) {
  const rows: EventTables[Table][] = [];
  for (let start = 0; ; start += 500) {
    const query = client.from(table).select("*");
    if (table === "ward_conferences") query.lt("begins_on", until).gte("ends_on", from);
    else query.lt("event_date", until).or(`end_date.gte.${from},and(end_date.is.null,event_date.gte.${from})`);

    const { data, error } = await query.order("id").range(start, start + 499);
    if (error) return { rows: [], failed: true };
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

export async function addCalendarEvent(input: unknown) {
  const viewer = await getViewer();
  if (!viewer?.role) return { error: "You need approved directory access." };

  const parsed = calendarEventSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the event title and dates." };
  const { event_date, end_date } = parsed.data;
  if (end_date && end_date < event_date) return { error: "End date must be on or after the start date." };

  const { error } = await viewer.client.from("calendar_events").insert(parsed.data);
  if (error?.code === "PGRST205" || error?.code === "42P01") {
    return { error: "Apply the calendar events migration in Supabase to add events." };
  }
  if (error) return { error: "Could not save this event. Try again." };
  return { error: null, date: event_date };
}
