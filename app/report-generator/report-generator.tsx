"use client";

import { Copy, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { journalEntryDateLabel, journalMonthLabel, journalReportText, type JournalReportData } from "../../lib/journal-report";
import { Modal } from "../editor";
import { PendingContent, SectionSkeleton } from "../pending-content";

export function ReportGenerator({ month, data }: { month: string; data: Promise<JournalReportData> }) {
  const router = useRouter();
  const [loading, startTransition] = useTransition();

  function showMonth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextMonth = String(new FormData(event.currentTarget).get("month"));
    if (nextMonth === month) return;
    const query = new URLSearchParams({ month: nextMonth });
    startTransition(() => router.push(`/report-generator?${query}`));
  }

  return <section aria-labelledby="journal-report-heading">
    <div className="section-heading">
      <div><h1 id="journal-report-heading">Report Generator</h1>
        <p>Copy your journal entries for a monthly summary.</p></div>
    </div>
    <div className="journal-report-layout">
      <form action="/report-generator" method="get" onSubmit={showMonth}>
        <label>Reporting month
          <input type="month" name="month" defaultValue={month} min="0001-01" max="9999-12"
            required pattern="[0-9]{4}-(0[1-9]|1[0-2])" placeholder="YYYY-MM" />
        </label>
        <button className="button" disabled={loading}>
          {loading && <LoaderCircle className="loading-spinner" size={16} aria-hidden />}
          {loading ? "Loading…" : "Show month"}
        </button>
      </form>
      {loading ? <SectionSkeleton label="journal entries" /> :
        <PendingContent data={data} fallback={<SectionSkeleton label="journal entries" />}>
          {(report) => <ReportResults report={report} />}
        </PendingContent>}
    </div>
  </section>;
}

function ReportResults({ report: { month, groups, loadError } }: { report: JournalReportData }) {
  const [copied, setCopied] = useState(false);
  const [manualCopy, setManualCopy] = useState("");

  async function copyAll() {
    const text = journalReportText(month, groups);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setManualCopy(text);
    }
  }

  return <>
    <div className="journal-report-copy">
      <span className="muted" role="status">{copied ? "Report copied." : ""}</span>
      <button type="button" className="button primary" disabled={!groups.length} onClick={copyAll}>
        <Copy size={17} aria-hidden />Copy all
      </button>
    </div>
    {loadError ? <p className="notice error" role="alert">{loadError}</p> :
      groups.length === 0 ? <p className="notice">You have no journal entries for {journalMonthLabel(month)}.</p> :
      <div className="journal-report-groups" aria-label={journalMonthLabel(month)}>
        {groups.map((group) => <section className="panel unit-journal" key={group.id}>
          <h2>{group.name}</h2>
          {group.units.map((unit) => <section className="journal-report-unit" key={unit.id}>
            <h3>{unit.id === group.id ? "Stake journal" : unit.name}</h3>
            <ul className="unit-journal-list">
              {unit.entries.map((entry) => <li key={entry.id}>
                <time className="journal-report-date" dateTime={entry.entry_date}>{journalEntryDateLabel(entry.entry_date)}</time>
                <p className="unit-notes">{entry.notes}</p>
              </li>)}
            </ul>
          </section>)}
        </section>)}
      </div>}
    {manualCopy && <Modal title="Copy report" close={() => setManualCopy("")}>
      <div className="modal-body">
        <label>Report text
          <textarea rows={10} readOnly value={manualCopy} onFocus={(event) => event.currentTarget.select()} />
        </label>
      </div>
    </Modal>}
  </>;
}
