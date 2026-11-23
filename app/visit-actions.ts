"use server";

import { z } from "zod";
import { getViewer } from "../lib/supabase";
import { offsetDate, type VisitEvent } from "../lib/visits";

const uuid = z.uuid();
const date = z.iso.date();
const accessError = "You need approved directory access.";

export async function loadVisitEvents(from: string, until: string, includeTeam: boolean): Promise<{ events: VisitEvent[]; error: string | null }> {
  const viewer = await getViewer();
  if (!viewer?.role) return { events: [], error: accessError };
  if (!date.safeParse(from).success || !date.safeParse(until).success || until <= from || until > offsetDate(from, 92)) {
    return { events: [], error: "Choose a valid calendar date range." };
  }
  const events: VisitEvent[] = [];
  for (let start = 0; ; start += 500) {
    const query = viewer.client.from("visit_events")
      .select("id,owner_id,owner_email,unit_id,title,event_date,kind,start_minute,end_minute")
      .gte("event_date", offsetDate(from, -1)).lt("event_date", until)
      .order("event_date").order("id").range(start, start + 499);
    if (!includeTeam) query.eq("owner_id", viewer.user.id);
    const { data, error } = await query;
    if (error) return { events: [], error: "Could not load visits for this date range." };
    events.push(...data as VisitEvent[]);
    if (data.length < 500) return { events, error: null };
  }
}

export async function scheduleVisit(unitId: string, day: string) {
  const viewer = await getViewer();
  if (!viewer?.role) return { error: accessError, added: 0 };
  if (!uuid.safeParse(unitId).success || !date.safeParse(day).success) {
    return { error: "Choose a unit and a valid date.", added: 0 };
  }
  const { data, error } = await viewer.client.rpc("schedule_unit_visit", { visit_unit: unitId, visit_date: day });
  return { error: error ? "Could not schedule the unit’s meetings." : null, added: error ? 0 : Number(data) };
}

const visitSchema = z.object({
  id: uuid.nullable(),
  unit_id: uuid.nullable(),
  kind: z.enum(["sacrament", "council", "visit", "drive"]),
  title: z.string().trim().min(1).max(150).nullable().optional(),
  event_date: date,
  start_minute: z.number().int().min(0).max(1439),
  end_minute: z.number().int(),
}).refine((event) => event.end_minute > event.start_minute && event.end_minute <= event.start_minute + 1440)
  .refine((event) => event.kind === "drive" ? event.unit_id === null : event.unit_id !== null && !event.title);

export async function saveVisit(values: unknown) {
  const viewer = await getViewer();
  if (!viewer?.role) return { error: accessError };
  const parsed = visitSchema.safeParse(values);
  if (!parsed.success) return { error: "Choose a date and an end time after the start time." };
  const { id, unit_id, kind, ...schedule } = parsed.data;
  const table = viewer.client.from("visit_events");
  const { error } = id
    ? await table.update(schedule).eq("id", id).eq("owner_id", viewer.user.id).select("id").single()
    : await table.insert({ ...schedule, unit_id, kind });
  if (error?.code === "23505") return { error: "This type of visit is already on your calendar for that unit and date." };
  return { error: error ? "Could not save this visit." : null };
}

export async function deleteVisit(id: string) {
  const viewer = await getViewer();
  if (!viewer?.role) return { error: accessError };
  if (!uuid.safeParse(id).success) return { error: "Could not find this visit." };
  const { error } = await viewer.client.from("visit_events").delete().eq("id", id)
    .eq("owner_id", viewer.user.id).select("id").single();
  return { error: error ? "Could not remove this visit." : null };
}
