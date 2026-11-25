import { redirect } from "next/navigation";
import { DirectoryPage } from "../directory-page";
import { getViewer } from "../../lib/supabase";

export default async function OrganizationsPage() {
  const viewer = await getViewer();
  if (!viewer?.role) redirect("/");
  return <DirectoryPage viewer={viewer} organizationsPage />;
}
