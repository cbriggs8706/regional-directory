import { notFound } from "next/navigation";
import { DirectoryApp } from "./directory-app";
import type { DirectoryManagementSection } from "./directory-management";
import type { getViewer } from "../lib/supabase";
import type { Directory, WardConference } from "../lib/directory";
import { scopeWards, type FamilyHistoryReport } from "../lib/family-history";
import { focusMetrics, type FocusActivity, type FocusActivityData } from "../lib/focus-people";
import type { GetInvolvedReport } from "../lib/get-involved";
import { journalPageSize, type UnitJournalData } from "../lib/unit-journal";
import { groupJournalEntries, type JournalReportData, type ReportEntry } from "../lib/journal-report";
import type {
  DirectoryOrganization, OrganizationAssignment, OrganizationDetail, OrganizationDirectory, OrganizationEvent, OrganizationTitle,
} from "../lib/organizations";
import { visitClock, type UnitVisitData, type VisitEvent } from "../lib/visits";

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

async function loadUnitVisits(client: Viewer["client"], unitId: string): Promise<UnitVisitData> {
  const clock = visitClock();
  const events: VisitEvent[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await client.from("visit_events")
      .select("*")
      .eq("unit_id", unitId).order("event_date").order("id").range(start, start + 499);
    if (error) return { ...clock, events: [], loadError: "Could not load scheduled visits." };
    events.push(...data as VisitEvent[]);
    if (data.length < 500) return { ...clock, events, loadError: null };
  }
}

type ReportTables = { family_history_reports: FamilyHistoryReport; get_involved_reports: GetInvolvedReport };

async function loadUnitReports<Table extends keyof ReportTables>(client: Viewer["client"], table: Table, unitIds?: string[]) {
  const reports: ReportTables[Table][] = [];
  const label = table === "family_history_reports" ? "Family History" : "Get Involved";
  // Keep area-wide ID filters within request URL limits.
  const batchSize = 100;
  const batches = unitIds ? Array.from({ length: Math.ceil(unitIds.length / batchSize) }, (_, index) =>
    unitIds.slice(index * batchSize, (index + 1) * batchSize)) : [undefined];
  for (const batch of batches) {
    for (let start = 0; ; start += 500) {
      const query = client.from(table).select("*");
      if (batch) query.in("unit_id", batch);
      const { data, error } = await query.order("report_month").order("unit_id").range(start, start + 499);
      if (error) {
        const loadError = error.code === "42P01" || error.code === "PGRST205"
          ? `Apply the ${label} reports migration in Supabase to enable reporting.`
          : `Could not load ${label} reports. Refresh the page to try again.`;
        return { reports: [], loadError };
      }
      reports.push(...data as ReportTables[Table][]);
      if (data.length < 500) break;
    }
  }
  return { reports, loadError: null };
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

async function loadJournal(client: Viewer["client"], target: { unitId: string } | { organizationId: string }, page?: number): Promise<UnitJournalData> {
  const pageSize = page ? journalPageSize : 3;
  const start = page ? (page - 1) * pageSize : 0;
  const isUnit = "unitId" in target;
  const { data, error } = await client.from(isUnit ? "unit_journal_entries" : "organization_journal_entries")
    .select("id,entry_date,notes,author_name")
    .eq(isUnit ? "unit_id" : "organization_id", isUnit ? target.unitId : target.organizationId)
    .order("entry_date", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(start, start + pageSize);
  if (error) {
    const loadError = error.code === "42P01" || error.code === "PGRST205"
      ? "Apply the journal migration in Supabase to enable the journal."
      : "Could not load the journal. Refresh the page to try again.";
    return { entries: [], page: page ?? null, hasMore: false, loadError };
  }
  return { entries: data.slice(0, pageSize), page: page ?? null, hasMore: data.length > pageSize, loadError: null };
}

function missingTable(code: string) {
  return code === "42P01" || code === "PGRST205";
}

type OrganizationTables = {
  directory_organizations: DirectoryOrganization;
  organization_titles: OrganizationTitle;
  organization_assignments: OrganizationAssignment;
  organization_events: OrganizationEvent;
};

async function loadOrganizationRows<Table extends keyof OrganizationTables>(
  client: Viewer["client"], table: Table, organizationId?: string,
): Promise<{ rows: OrganizationTables[Table][]; error?: string }> {
  const rows: OrganizationTables[Table][] = [];
  for (let start = 0; ; start += 500) {
    const query = client.from(table).select("*");
    if (organizationId) query.eq("organization_id", organizationId);
    const { data, error } = await query.order("id").range(start, start + 499);
    if (error) return { rows: [], error: error.code };
    rows.push(...data as OrganizationTables[Table][]);
    if (data.length < 500) return { rows };
  }
}

async function loadOrganizations(client: Viewer["client"]): Promise<OrganizationDirectory> {
  const [organizations, titles, assignments] = await Promise.all([
    loadOrganizationRows(client, "directory_organizations"),
    loadOrganizationRows(client, "organization_titles"),
    loadOrganizationRows(client, "organization_assignments"),
  ]);
  const error = organizations.error ?? titles.error ?? assignments.error;
  return {
    organizations: organizations.rows,
    titles: titles.rows,
    assignments: assignments.rows,
    loadError: error ? missingTable(error) ? "Apply the Organizations migration in Supabase to enable Organizations."
      : "Could not load Organizations. Refresh the page to try again." : null,
  };
}

async function loadJournalReport(viewer: Viewer, month: string, units: Directory["units"], organizations: DirectoryOrganization[]): Promise<JournalReportData> {
  const firstDate = `${month}-01`;
  const lastDay = new Date(`${firstDate}T00:00:00Z`);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  const lastDate = lastDay.toISOString().slice(0, 10);
  const entries: ReportEntry[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await viewer.client.from("unit_journal_entries")
      .select("id,unit_id,entry_date,notes")
      .eq("author_id", viewer.user.id).gte("entry_date", firstDate).lte("entry_date", lastDate)
      .order("entry_date").order("created_at").order("id").range(start, start + 499);
    if (error) {
      const loadError = ["42703", "42P01", "PGRST205"].includes(error.code)
        ? "Apply the journal migrations in Supabase to enable the Report Generator."
        : "Could not load your journal entries. Refresh the page to try again.";
      return { month, groups: [], loadError };
    }
    entries.push(...data);
    if (data.length < 500) break;
  }

  if (organizations.length) {
    for (let start = 0; ; start += 500) {
      const { data, error } = await viewer.client.from("organization_journal_entries")
        .select("id,organization_id,entry_date,notes")
        .eq("author_id", viewer.user.id).gte("entry_date", firstDate).lte("entry_date", lastDate)
        .order("entry_date").order("created_at").order("id").range(start, start + 499);
      if (error) return { month, groups: [], loadError: "Could not load your organization journal entries. Refresh the page to try again." };
      entries.push(...data);
      if (data.length < 500) break;
    }
  }
  return { month, groups: groupJournalEntries(entries, units, organizations), loadError: null };
}

export async function DirectoryPage({ viewer, unitId, journalPage, managementSection, reportMonth, organizationsPage, organizationId }: {
  viewer: Viewer;
  unitId?: string;
  journalPage?: number;
  managementSection?: DirectoryManagementSection;
  reportMonth?: string;
  organizationsPage?: boolean;
  organizationId?: string;
}) {
  const { client, role, user, previewEmail } = viewer;
  const tables = ["units", "buildings", "stake_conferences", "languages", "contacts", "organizations", "calling_types", "calling_names", "positions", "assignments"] as const;
  const directoryRows = tables.map(async (table) => {
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
  });
  const [organizationDirectory, entries, access, recent] = await Promise.all([
    loadOrganizations(client),
    Promise.all(directoryRows),
    role === "admin" ? client.from("directory_access").select("email,is_admin,directory_access_councils(council_id)").order("email") : null,
    client.from("email_dispatches")
      .select("id,created_at,subject,recipients,accepted_batches")
      .gt("created_at", new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false }),
  ]);
  const records = Object.fromEntries(entries);
  const units = records.units as Directory["units"];
  const unit = unitId ? units.find(({ id }) => id === unitId) : undefined;
  if (unitId && !unit) notFound();

  const organization = organizationDirectory.organizations.find(({ id }) => id === organizationId);
  if (organizationId && !organization && !organizationDirectory.loadError) notFound();

  if (access?.error) throw new Error("Could not load directory access.");
  const directory = { ...records, directory_access: access?.data ?? [] } as Directory;
  if (recent.error) throw new Error("Could not load pending email.");
  const pending = recent.data.flatMap((draft) => {
    const total = draft.recipients.length;
    const sent = (draft.accepted_batches as number[]).reduce((sum, batch) => sum + Math.min(100, total - 100 * batch), 0);
    return sent === total ? [] : [{ id: draft.id as string, subject: draft.subject as string, sent, total }];
  });

  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Boise", year: "numeric", month: "2-digit" })
    .formatToParts(new Date());
  const currentMonth = [localDate.find(({ type }) => type === "year")!.value, localDate.find(({ type }) => type === "month")!.value].join("-");

  const wardIds = unit ? scopeWards(units, unit).map(({ id }) => id) : undefined;
  const familyHistory = managementSection || reportMonth || organizationsPage ? null
    : loadUnitReports(client, "family_history_reports", wardIds);
  const unitData = unit && wardIds && familyHistory
    ? loadUnitDetail(client, unit, wardIds, journalPage, familyHistory) : null;
  const organizationDetail = organization ? loadOrganizationDetail(client, organization, journalPage) : null;
  const journalReport = reportMonth
    ? { month: reportMonth, data: loadJournalReport(viewer, reportMonth, units, organizationDirectory.organizations) } : null;

  return <DirectoryApp key={previewEmail ?? user.id} organizationsPage={organizationsPage} organizationDirectory={organizationDirectory} organizationDetail={organizationDetail}
    unitId={unitId} managementSection={managementSection} directory={directory}
    familyHistory={familyHistory} currentMonth={currentMonth} admin={role === "admin"} email={user.email ?? ""}
    userId={user.id} preview={Boolean(previewEmail)} unitData={unitData} journalReport={journalReport}
    mailReady={Boolean(!previewEmail && process.env.RESEND_API_KEY && process.env.RESEND_FROM)} pending={pending} />;
}

export type FamilyHistoryLoad = ReturnType<typeof loadUnitReports<"family_history_reports">>;
export type UnitDetailLoad = ReturnType<typeof loadUnitDetail>;

function loadOrganizationDetail(client: Viewer["client"], organization: DirectoryOrganization, journalPage?: number): OrganizationDetail {
  const journal = loadJournal(client, { organizationId: organization.id }, journalPage);
  const events = loadOrganizationRows(client, "organization_events", organization.id);
  return {
    organization, journalPage, journal, events,
    canAddJournal: journal.then(({ loadError }) => !loadError),
    canAddEvent: events.then(({ error }) => !error),
  };
}

function loadUnitDetail(client: Viewer["client"], unit: Directory["units"][number], wardIds: string[], journalPage: number | undefined,
  familyHistory: FamilyHistoryLoad) {
  const wardId = unit.level === "ward" ? unit.id : undefined;
  const journal = loadJournal(client, { unitId: unit.id }, journalPage);
  const getInvolved = loadUnitReports(client, "get_involved_reports", wardIds);
  const wardConferences = loadWardConferences(client, wardId);

  return {
    familyHistory,
    getInvolved,
    journal,
    journalPage,
    events: Promise.all([loadUnitVisits(client, unit.id), wardConferences]),
    focusActivity: wardId ? loadFocusActivity(client, wardId) : Promise.resolve(null),
    canAddJournal: journal.then(({ loadError }) => !loadError),
    canAddFamilyHistory: familyHistory.then(({ loadError }) => !loadError && wardIds.length > 0),
    canAddGetInvolved: getInvolved.then(({ loadError }) => !loadError && wardIds.length > 0),
    canAddWardConference: wardConferences.then((conferences) => conferences !== null),
  };
}
