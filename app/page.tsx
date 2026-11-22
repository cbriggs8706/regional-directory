import { BookOpen, LockKeyhole } from "lucide-react";
import { signIn, signOut } from "./actions";
import { DirectoryApp } from "./directory-app";
import { getViewer, supabaseSettings } from "../lib/supabase";
import type { Directory } from "../lib/directory";

export const dynamic = "force-dynamic";

const authErrors: Record<string, string> = {
  failed: "Google sign-in could not be completed. Please try again.",
  configuration: "Set APP_URL before starting Google sign-in.",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.role) {
    const ready = Boolean(supabaseSettings() && process.env.APP_URL);
    const { auth } = await searchParams;
    return (
      <main className="sign-in">
        <section className="sign-in-card">
          <div className="brand-icon"><BookOpen size={23} aria-hidden /></div>
          <div className="sign-in-label"><LockKeyhole size={14} aria-hidden /> Private directory</div>
          <h1>Regional Directory</h1>
          <p>{viewer ? "Your Google account hasn’t been granted access. Contact the directory administrator."
            : "Sign in with your approved Google account to view callings and contacts."}</p>
          {!ready && <p className="notice">Supabase and Google sign-in setup is required. See the project README to get started.</p>}
          {auth && Object.hasOwn(authErrors, auth) && <p className="notice error" role="alert">{authErrors[auth]}</p>}
          <form action={viewer ? signOut : signIn}>
            <button className="button primary sign-in-button" disabled={!ready && !viewer}>
              {viewer ? "Sign out" : "Continue with Google"}
            </button>
          </form>
          {viewer && <small>{viewer.user.email}</small>}
        </section>
      </main>
    );
  }

  const { client, role, user } = viewer;
  const tables = ["units", "contacts", "calling_types", "calling_names", "positions", "assignments"] as const;
  const entries = await Promise.all(tables.map(async (table) => {
    const records: object[] = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await client.from(table).select("*").order("id").range(start, start + 499);
      if (error) throw new Error(`Could not load ${table}.`);
      records.push(...data);
      if (data.length < 500) return [table, records] as const;
    }
  }));
  const access = role === "admin" ? await client.from("directory_access").select("email,is_admin").order("email") : null;
  if (access?.error) throw new Error("Could not load directory access.");
  const recent = await client.from("email_dispatches")
    .select("id,created_at,subject,recipients,accepted_batches")
    .gt("created_at", new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false });
  if (recent.error) throw new Error("Could not load pending email.");
  const pending = recent.data.flatMap((draft) => {
    const total = draft.recipients.length;
    const sent = (draft.accepted_batches as number[]).reduce((sum, batch) => sum + Math.min(100, total - 100 * batch), 0);
    return sent === total ? [] : [{ id: draft.id as string, subject: draft.subject as string, sent, total }];
  });
  const directory = { ...Object.fromEntries(entries), directory_access: access?.data ?? [] } as Directory;

  return <DirectoryApp directory={directory} admin={role === "admin"} email={user.email ?? ""}
    mailReady={Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM)} pending={pending} />;
}
