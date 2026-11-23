import { z } from "zod";
import { buildingPhotoTypes } from "../../../../lib/directory";
import { getViewer } from "../../../../lib/supabase";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const missing = () => new Response(null, { status: 404, headers });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer?.role || !z.uuid().safeParse(id).success) return missing();

  const { data: building } = await viewer.client.from("buildings").select("photo_path").eq("id", id).maybeSingle();
  if (!building?.photo_path) return missing();

  const { data: photo } = await viewer.client.storage.from("buildings").download(building.photo_path);
  if (!photo || !Object.hasOwn(buildingPhotoTypes, photo.type)) return missing();

  return new Response(photo, { headers: { ...headers, "Content-Type": photo.type } });
}
