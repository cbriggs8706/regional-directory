import type { Metadata } from "next";
import { cookies } from "next/headers";
import { exitAccessPreview } from "./access-actions";
import { getViewer, previewCookie } from "../lib/supabase";
import Loading from "./loading";
import { RouteNavigation } from "./route-navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "Regional Directory",
  description: "Manage Church units, callings, and contacts.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const viewer = (await cookies()).has(previewCookie) ? await getViewer() : null;
  return <html lang="en"><body>
    {viewer?.previewEmail && <aside className="access-preview" aria-label="Access preview">
      <div className="shell">
        <span><strong>Viewing as {viewer.previewEmail}</strong> · Read-only council access preview</span>
        <form action={exitAccessPreview}><button className="button" type="submit">Exit preview</button></form>
      </div>
    </aside>}
    <RouteNavigation loading={<Loading />}>{children}</RouteNavigation>
  </body></html>;
}
