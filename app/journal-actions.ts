"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "../lib/supabase";
import { journalNotesMaxLength } from "../lib/unit-journal";

const entrySchema = z.object({
  id: z.uuid().optional(),
  unitId: z.uuid(),
  entry_date: z.iso.date(),
  notes: z.string().trim().min(1).max(journalNotesMaxLength),
});

export async function saveJournalEntry(input: unknown) {
  const viewer = await getViewer();
  if (!viewer?.role) return { error: "You need approved directory access." };
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { error: "Enter a valid date and up to 10,000 characters of notes." };

  const { id, unitId, entry_date, notes } = parsed.data;
  const journal = viewer.client.from("unit_journal_entries");
  const { data, error } = await (id
    ? journal.update({ entry_date, notes }).eq("id", id).eq("unit_id", unitId).select("id").maybeSingle()
    : journal.insert({ unit_id: unitId, entry_date, notes }).select("id").single());
  if (error?.code === "23503") return { error: "This unit is no longer available." };
  if (error) return { error: "Could not save the journal entry. Try again." };
  if (!data) return { error: "This entry is no longer available on this unit." };

  revalidatePath(`/units/${unitId.toLowerCase()}`);
  return { error: null };
}
