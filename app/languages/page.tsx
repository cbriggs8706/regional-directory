import { redirect } from "next/navigation";
import { DirectoryPage } from "../directory-page";
import { getViewer } from "../../lib/supabase";

export const dynamic = "force-dynamic";

export default async function LanguagesPage() {
  const viewer = await getViewer();
  if (!viewer?.role) redirect("/");
  return <DirectoryPage viewer={viewer} managementSection="languages" />;
}
