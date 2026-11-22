import { redirect } from "next/navigation";
import { createDirectoryClient } from "../../../lib/supabase";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  const client = await createDirectoryClient();
  if (code && client) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) redirect("/");
  }
  redirect("/?auth=failed");
}
