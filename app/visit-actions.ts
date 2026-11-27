"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getViewer } from "../lib/supabase";
import { formatVisitTime, offsetDate, visitLabels, type UnitDateEvent, type VisitEvent } from "../lib/visits";

const uuid = z.uuid();
const date = z.iso.date();
const accessError = "You need approved directory access.";
const visitNotes = z.string().trim().max(4000).nullable().optional();

export async function loadVisitEvents(from: string, until: string, includeTeam: boolean): Promise<{ events: VisitEvent[]; error: string | null }> {
  const viewer = await getViewer();
  if (!viewer?.role) return { events: [], error: accessError };
  if (!date.safeParse(from).success || !date.safeParse(until).success || until <= from || until > offsetDate(from, 92)) {
    return { events: [], error: "Choose a valid calendar date range." };
  }
  const events: VisitEvent[] = [];
  for (let start = 0; ; start += 500) {
    const query = viewer.client.from("visit_events")
      .select("*")
      .gte("event_date", offsetDate(from, -1)).lt("event_date", until)
      .order("event_date").order("id").range(start, start + 499);
    if (!includeTeam) query.eq("owner_id", viewer.user.id);
    const { data, error } = await query;
    if (error) return { events: [], error: "Could not load visits for this date range." };
    events.push(...data as VisitEvent[]);
    if (data.length < 500) return { events, error: null };
  }
}

export async function loadUnitDateEvents(unitIds: string[], day: string): Promise<{ events: UnitDateEvent[]; error: string | null }> {
  const viewer = await getViewer();
  if (!viewer?.role) return { events: [], error: accessError };
  if (!z.array(uuid).min(1).max(4).safeParse(unitIds).success || !date.safeParse(day).success || day < "0001-01-01") {
    return { events: [], error: "Choose a valid date." };
  }

  const visitQuery = viewer.client.from("visit_events").select("id,unit_id,kind,event_date,start_minute,end_minute")
    .in("unit_id", unitIds)
    .order("event_date").order("start_minute").order("id");
  if (day === "0001-01-01") visitQuery.eq("event_date", day);
  else visitQuery.or(`event_date.eq.${day},and(event_date.eq.${offsetDate(day, -1)},end_minute.gt.1440)`);

  const [stakes, wards, visits] = await Promise.all([
    viewer.client.from("stake_conferences").select("id,stake_id")
      .in("stake_id", unitIds).lte("begins_on", day).gte("ends_on", day).order("id"),
    viewer.client.from("ward_conferences").select("id,unit_id")
      .in("unit_id", unitIds).lte("begins_on", day).gte("ends_on", day).order("id"),
    visitQuery,
  ]);
  return {
    events: [
      ...(stakes.data ?? []).map((row) => ({ id: row.id, unitId: row.stake_id, title: "Stake Conference", details: "All day" })),
      ...(wards.data ?? []).map((row) => ({ id: row.id, unitId: row.unit_id, title: "Conference", details: "All day" })),
      ...(visits.data ?? []).map((row) => ({
        id: row.id,
        unitId: row.unit_id,
        title: visitLabels[row.kind as VisitEvent["kind"]],
        details: row.event_date === day
          ? `${formatVisitTime(row.start_minute)} – ${formatVisitTime(row.end_minute)}${row.end_minute >= 1440 ? " next day" : ""}`
          : `Ends at ${formatVisitTime(row.end_minute)} · Started the previous day`,
      })),
    ],
    error: stakes.error || wards.error || visits.error ? "Some existing events could not be loaded." : null,
  };
}

export async function scheduleVisit(unitId: string, day: string, notes?: string | null) {
  const viewer = await getViewer({ write: true });
  if (!viewer?.role) return { error: accessError, added: 0 };
  if (!uuid.safeParse(unitId).success || !date.safeParse(day).success) {
    return { error: "Choose a unit and a valid date.", added: 0 };
  }
  const parsedNotes = visitNotes.safeParse(notes);
  if (!parsedNotes.success) return { error: "Visit notes must be 4,000 characters or fewer.", added: 0 };
  const { data, error } = await viewer.client.rpc("schedule_unit_visit", {
    visit_unit: unitId, visit_date: day, ...(parsedNotes.data ? { visit_notes: parsedNotes.data } : {}),
  });
  if (!error && Number(data) > 0) revalidatePath(`/units/${unitId.toLowerCase()}`);
  return { error: error ? "Could not schedule the unit’s meetings." : null, added: error ? 0 : Number(data) };
}

const visitSchema = z.object({
  id: uuid.nullable(),
  unit_id: uuid.nullable(),
  kind: z.enum(["sacrament", "council", "visit", "drive"]),
  title: z.string().trim().min(1).max(150).nullable().optional(),
  notes: visitNotes,
  event_date: date,
  start_minute: z.number().int().min(0).max(1439),
  end_minute: z.number().int(),
}).refine((event) => event.end_minute > event.start_minute && event.end_minute <= event.start_minute + 1440)
  .refine((event) => event.kind === "drive" ? event.unit_id === null : event.unit_id !== null && !event.title);

export async function saveVisit(values: unknown) {
  const viewer = await getViewer({ write: true });
  if (!viewer?.role) return { error: accessError };
  const parsed = visitSchema.safeParse(values);
  if (!parsed.success) return { error: "Choose a date and an end time after the start time." };
  const { id, unit_id, kind, ...schedule } = parsed.data;
  const table = viewer.client.from("visit_events");
  const query = id
    ? table.update(schedule).eq("id", id).eq("owner_id", viewer.user.id)
    : table.insert({ ...schedule, unit_id, kind });
  const { data, error } = await query.select("unit_id").single();
  if (error?.code === "23505") return { error: "This type of visit is already on your calendar for that unit and date." };
  if (data?.unit_id) revalidatePath(`/units/${data.unit_id}`);
  return { error: error ? "Could not save this visit." : null };
}

export async function deleteVisit(id: string) {
  const viewer = await getViewer({ write: true });
  if (!viewer?.role) return { error: accessError };
  if (!uuid.safeParse(id).success) return { error: "Could not find this visit." };
  const { data, error } = await viewer.client.from("visit_events").delete().eq("id", id)
    .eq("owner_id", viewer.user.id).select("unit_id").single();
  if (data?.unit_id) revalidatePath(`/units/${data.unit_id}`);
  return { error: error ? "Could not remove this visit." : null };
}
