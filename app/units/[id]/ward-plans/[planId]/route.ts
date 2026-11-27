import { z } from "zod";
import { getViewer } from "../../../../../lib/supabase";
import { unitPlanBucket, unitPlanPath } from "../../../../../lib/unit-plans";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
};
const missing = () => new Response("This plan could not be opened.", { status: 404, headers });

export async function GET(request: Request, { params }: { params: Promise<{ id: string; planId: string }> }) {
  const ids = z.object({ id: z.uuid(), planId: z.uuid() }).safeParse(await params);
  if (!ids.success) return missing();

  const viewer = await getViewer();
  if (!viewer?.role) return missing();

  const { id, planId } = ids.data;
  const { data: plan } = await viewer.client.from("ward_plans")
    .select("id,unit_id,filename").eq("unit_id", id).eq("id", planId).maybeSingle();
  if (!plan) return missing();

  const { data: file } = await viewer.client.storage.from(unitPlanBucket).download(unitPlanPath(plan.unit_id, plan.id));
  if (!file) return missing();

  const filename = encodeURIComponent(plan.filename).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16)}`);
  const disposition = new URL(request.url).searchParams.get("view") === "1" ? "inline" : "attachment";
  return new Response(file, { headers: {
    ...headers,
    "Content-Type": "application/pdf",
    "Content-Disposition": `${disposition}; filename="plan.pdf"; filename*=UTF-8''${filename}`,
  } });
}
