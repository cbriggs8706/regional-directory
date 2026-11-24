import { notFound } from "next/navigation";
import { DirectoryApp } from "./directory-app";
import type { getViewer } from "../lib/supabase";
import type { Directory, WardConference } from "../lib/directory";
import { reportUnits, scopeWards, type FamilyHistoryReport } from "../lib/family-history";
import { focusMetrics, type FocusActivity, type FocusActivityData } from "../lib/focus-people";
import { journalPageSize, type UnitJournalData } from "../lib/unit-journal";

type Viewer = NonNullable<Awaited<ReturnType<typeof getViewer>>>;

async function loadWardConferences(client: Viewer["client"], unitId?: string): Promise<WardConference[] | null> {
  if (!unitId) return [];
  const conferences: WardConference[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await client.from("ward_conferences").select("*").eq("unit_id", unitId)
      .order("id").range(start, start + 499);
    if (error?.code === "42P01" || error?.code === "PGRST205") return null;
    if (error) throw new Error("Could not load ward conferences.");
    conferences.push(...data as WardConference[]);
    if (data.length < 500) return conferences;
  }
}

async function loadFamilyHistoryReports(client: Viewer["client"], unitIds?: string[]) {
  if (unitIds?.length === 0) return { reports: [], loadError: null };
  const reports: FamilyHistoryReport[] = [];
  for (let start = 0; ; start += 500) {
    const query = client.from("family_history_reports").select("*");
    if (unitIds) query.in("unit_id", unitIds);
    const { data, error } = await query.order("report_month").order("unit_id").range(start, start + 499);
    if (error) {
      const message = error.code === "42P01" || error.code === "PGRST205"
        ? "Apply the Family History reports migration in Supabase to enable reporting."
        : "Could not load Family History reports. Refresh the page to try again.";
      return { reports: [], loadError: message };
    }
    reports.push(...data as FamilyHistoryReport[]);
    if (data.length < 500) return { reports, loadError: null };
  }
}

async function loadFocusActivity(client: Viewer["client"], wardId: string): Promise<FocusActivityData> {
  const activity: FocusActivity[] = [];
  const fields = ["contact_id", "report_month", "revision", ...focusMetrics.map(({ key }) => key)];
  for (let start = 0; ; start += 500) {
    const { data, error } = await client.from("focus_person_activity")
      .select(`${fields.join(",")},contacts!inner()`)
      .eq("contacts.ward_id", wardId).eq("contacts.is_focus_person", true)
      .order("contact_id").order("report_month").range(start, start + 499);
    if (error) {
      const loadError = error.code === "42P01" || error.code === "PGRST205"
        ? "Apply the Focus People migration in Supabase to enable focus activity."
        : "Could not load focus activity. Refresh the page to try again.";
      return { activity: [], loadError };
    }
    activity.push(...data as unknown as FocusActivity[]);
    if (data.length < 500) return { activity, loadError: null };
  }
}

async function loadUnitJournal(client: Viewer["client"], unitId: string, page?: number): Promise<UnitJournalData> {
  const pageSize = page ? journalPageSize : 3;
  const start = page ? (page - 1) * pageSize : 0;
  const { data, error } = await client.from("unit_journal_entries").select("id,entry_date,notes,author_name")
    .eq("unit_id", unitId)
    .order("entry_date", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(start, start + pageSize);
  if (error) {
    const loadError = error.code === "42P01" || error.code === "PGRST205"
      ? "Apply the unit journal migration in Supabase to enable the journal."
      : "Could not load the journal. Refresh the page to try again.";
    return { entries: [], page: page ?? null, hasMore: false, loadError };
  }
  return { entries: data.slice(0, pageSize), page: page ?? null, hasMore: data.length > pageSize, loadError: null };
}

export async function DirectoryPage({ viewer, unitId, journalPage }: {
  viewer: Viewer;
  unitId?: string;
  journalPage?: number;
}) {
  const { client, role, user } = viewer;
  const tables = ["units", "buildings", "stake_conferences", "languages", "contacts", "organizations", "calling_types", "calling_names", "positions", "assignments"] as const;
  const entries = await Promise.all(tables.map(async (table) => {
    const records: object[] = [];
    let fields = table === "assignments" ? "*,assignment_buildings(building_id)" : "*";
    for (let start = 0; ; start += 500) {
      let { data, error } = await client.from(table).select(fields).order("id").range(start, start + 499);
      if (start === 0 && table === "assignments" && error?.code === "PGRST200") {
        fields = "*";
        ({ data, error } = await client.from(table).select(fields).order("id").range(start, start + 499));
      }
      if (error || !data) throw new Error(`Could not load ${table}.`);
      records.push(...data);
      if (data.length < 500) return [table, records] as const;
    }
  }));
  const records = Object.fromEntries(entries);
  const units = records.units as Directory["units"];
  const unit = unitId ? units.find(({ id }) => id === unitId) : undefined;
  if (unitId && !unit) notFound();

  const [familyHistory, wardConferences, journal, focusActivity, access, recent] = await Promise.all([
    loadFamilyHistoryReports(client, unit ? scopeWards(reportUnits(units), unit).map(({ id }) => id) : undefined),
    loadWardConferences(client, unit?.level === "ward" ? unit.id : undefined),
    unit ? loadUnitJournal(client, unit.id, journalPage) : null,
    unit?.level === "ward" ? loadFocusActivity(client, unit.id) : null,
    role === "admin" ? client.from("directory_access").select("email,is_admin").order("email") : null,
    client.from("email_dispatches")
      .select("id,created_at,subject,recipients,accepted_batches")
      .gt("created_at", new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false }),
  ]);
  if (access?.error) throw new Error("Could not load directory access.");
  const directory = { ...records, ward_conferences: wardConferences, directory_access: access?.data ?? [] } as Directory;
  if (recent.error) throw new Error("Could not load pending email.");
  const pending = recent.data.flatMap((draft) => {
    const total = draft.recipients.length;
    const sent = (draft.accepted_batches as number[]).reduce((sum, batch) => sum + Math.min(100, total - 100 * batch), 0);
    return sent === total ? [] : [{ id: draft.id as string, subject: draft.subject as string, sent, total }];
  });

  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Boise", year: "numeric", month: "2-digit" })
    .formatToParts(new Date());
  const currentMonth = [localDate.find(({ type }) => type === "year")!.value, localDate.find(({ type }) => type === "month")!.value].join("-");

  return <DirectoryApp unitId={unitId} directory={directory} familyHistory={{ ...familyHistory, currentMonth }} admin={role === "admin"} email={user.email ?? ""}
    userId={user.id} journal={journal} focusActivity={focusActivity}
    mailReady={Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM)} pending={pending} />;
}
