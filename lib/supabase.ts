import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const previewCookie = "directory-access-preview";

export function supabaseSettings() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

export async function createDirectoryClient(previewEmail?: string) {
  const settings = supabaseSettings();
  if (!settings) return null;
  const jar = await cookies();
  return createServerClient(settings.url, settings.key, {
    ...(previewEmail && { global: { headers: { "x-directory-preview": previewEmail } } }),
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

export async function getViewer({ write = false }: { write?: boolean } = {}) {
  const client = await createDirectoryClient();
  if (!client) return null;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data: role, error } = await client.rpc("directory_access_role");
  if (error) {
    console.error("Directory access lookup failed", error.code, error.message);
    const accessError = error.code === "PGRST202" || error.code === "42883" ? "migration" : "unavailable";
    return { client, user, role: null, previewEmail: undefined, accessError };
  }

  const previewEmail = role === "admin" ? (await cookies()).get(previewCookie)?.value : undefined;
  if (previewEmail) {
    const scopedClient = (await createDirectoryClient(previewEmail))!;
    const { data: memberRole, error: previewError } = await scopedClient.rpc("directory_access_role");
    if (previewError) console.error("Directory preview lookup failed", previewError.code, previewError.message);
    return {
      client: scopedClient,
      user: { ...user, email: previewEmail, id: "00000000-0000-0000-0000-000000000000" },
      role: !previewError && !write && memberRole === "member" ? "member" as const : null,
      previewEmail,
      accessError: previewError ? "unavailable" as const : null,
    };
  }
  return { client, user, role: role as "admin" | "member" | null, previewEmail, accessError: null };
}
