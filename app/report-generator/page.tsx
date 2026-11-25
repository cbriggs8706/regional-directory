import { redirect } from "next/navigation";
import { getViewer } from "../../lib/supabase";
import { todayInVisitZone } from "../../lib/visits";
import { DirectoryPage } from "../directory-page";

export const dynamic = "force-dynamic";

export default async function ReportGeneratorPage({ searchParams }: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const viewer = await getViewer();
  if (!viewer?.role) redirect("/");
  const { month } = await searchParams;
  const selectedMonth = typeof month === "string" && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ? month : todayInVisitZone().slice(0, 7);
  return <DirectoryPage viewer={viewer} reportMonth={selectedMonth} />;
}
