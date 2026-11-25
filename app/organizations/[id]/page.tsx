import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { DirectoryPage } from "../../directory-page";
import { getViewer } from "../../../lib/supabase";
import { journalPageSize } from "../../../lib/unit-journal";

export default async function OrganizationPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ journalPage?: string | string[] }>;
}) {
  const viewer = await getViewer();
  if (!viewer?.role) redirect("/");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { journalPage } = await searchParams;
  const page = typeof journalPage === "string" && /^[1-9]\d*$/.test(journalPage) ? Number(journalPage) : 0;
  return <DirectoryPage viewer={viewer} organizationsPage organizationId={id.toLowerCase()}
    journalPage={Number.isSafeInteger((page + 1) * journalPageSize) && page > 0 ? page : undefined} />;
}
