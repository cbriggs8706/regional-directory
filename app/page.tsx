import { BookOpen, LockKeyhole } from "lucide-react";
import { signIn, signOut } from "./actions";
import { DirectoryPage } from "./directory-page";
import { getViewer, supabaseSettings } from "../lib/supabase";

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

  return <DirectoryPage viewer={viewer} />;
}
