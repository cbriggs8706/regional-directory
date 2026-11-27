"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "../lib/supabase";
import { unitPlanBucket, unitPlanMaxBytes, unitPlanMigrationMessage, unitPlanPath } from "../lib/unit-plans";

export async function uploadUnitPlan(unitId: string, form: FormData) {
  const viewer = await getViewer({ write: true });
  if (!viewer?.role) return { error: "You need approved directory access to upload a unit plan." };

  const unit = z.uuid().safeParse(unitId);
  if (!unit.success) return { error: "Choose a stake, ward, or branch." };

  const file = form.get("pdf");
  if (!(file instanceof File) || file.size < 5 || file.size > unitPlanMaxBytes || !/\.pdf$/i.test(file.name) || file.name.length > 255) {
    return { error: "Choose a PDF file up to 4 MB with a filename of 255 characters or fewer." };
  }
  if (await file.slice(0, 5).text() !== "%PDF-") return { error: "This file does not have a valid PDF header." };

  const { data: target, error: lookupError } = await viewer.client.from("units")
    .select("id,level").eq("id", unit.data).in("level", ["stake", "ward"]).maybeSingle();
  if (lookupError || !target) return { error: "Could not find this unit in your directory." };

  const id = crypto.randomUUID();
  const path = unitPlanPath(target.id, id);
  const storage = viewer.client.storage.from(unitPlanBucket);
  const pdf = file.slice(0, file.size, "application/pdf");
  const { error: uploadError } = await storage.upload(path, pdf, { contentType: "application/pdf" });
  if (uploadError) {
    return { error: "Could not upload the PDF. Check that the unit plan migrations are installed and try again." };
  }

  const { error } = await viewer.client.from("ward_plans").insert({
    id, unit_id: target.id, filename: file.name,
    ...(target.level === "stake" ? { unit_level: "stake" } : {}),
  });
  if (error) {
    const { data: published } = await viewer.client.from("ward_plans").select("id").eq("id", id).maybeSingle();
    if (!published) {
      await storage.remove([path]);
      return { error: error.code === "PGRST205" || error.code === "42P01" ? unitPlanMigrationMessage
        : "Could not save the plan to the archive. Try again." };
    }
  }

  revalidatePath("/", "layout");
  return { error: null };
}
