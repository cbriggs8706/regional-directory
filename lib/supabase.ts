import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function supabaseSettings() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

export async function createDirectoryClient() {
  const settings = supabaseSettings();
  if (!settings) return null;
  const jar = await cookies();
  return createServerClient(settings.url, settings.key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          // The proxy refreshes cookies before a server component renders.
        }
      },
    },
  });
}

export async function getViewer() {
  const client = await createDirectoryClient();
  if (!client) return null;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data: role, error } = await client.rpc("directory_role");
  if (error) throw new Error("Could not check directory access.");
  return { client, user, role: role as "admin" | "member" | null };
}
