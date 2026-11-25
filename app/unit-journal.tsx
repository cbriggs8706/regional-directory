"use client";

import { RouteLink } from "./route-navigation";
import { useSearchParams } from "next/navigation";
import { Pencil } from "lucide-react";
import { useState, type FormEvent } from "react";
import { journalNotesMaxLength, type JournalEntry, type UnitJournalData } from "../lib/unit-journal";
import { todayInVisitZone } from "../lib/visits";
import { Modal } from "./editor";
import { saveJournalEntry } from "./journal-actions";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

type JournalScope = { unitId: string; organizationId?: never } | { organizationId: string; unitId?: never };

export function UnitJournal({ journal, newEntryOpen, closeNewEntry, ...scope }: JournalScope & {
  journal: UnitJournalData; newEntryOpen: boolean; closeNewEntry: () => void;
}) {
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [status, setStatus] = useState("");
  const { entries, page, hasMore, loadError } = journal;

  function journalHref(nextPage?: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage) params.set("journalPage", String(nextPage));
    else params.delete("journalPage");
    const query = params.toString();
    const path = scope.organizationId ? `/organizations/${scope.organizationId}` : `/units/${scope.unitId}`;
    return `${path}${query ? `?${query}` : ""}#unit-journal`;
  }

  function closeEditor() {
    if (newEntryOpen) closeNewEntry();
    setEditing(null);
  }

  return <section className="panel unit-journal" id="unit-journal" aria-labelledby="unit-journal-heading">
    <div className="unit-journal-row">
      <h2 id="unit-journal-heading">{page ? "Journal history" : "Journal"}</h2>
    </div>
    {status && <p className="notice" role="status">{status}</p>}
    {loadError ? <p className="notice error" role="alert">{loadError}</p> : <>
      {entries.length === 0 && <p className="muted">{page && page > 1 ? "No entries on this page." : "No journal entries yet."}</p>}
      {entries.length > 0 && <ul className="unit-journal-list">
        {entries.map((entry) => {
          const date = dateFormat.format(new Date(`${entry.entry_date}T00:00:00Z`));
          return <li key={entry.id}>
            <div className="unit-journal-row">
              <div className="unit-journal-meta">
                <time dateTime={entry.entry_date}>{date}</time>
                <span>{entry.author_name}</span>
              </div>
              <button type="button" className="button" aria-label={`Edit journal entry by ${entry.author_name} dated ${date}`}
                onClick={() => { setStatus(""); setEditing(entry); }}><Pencil size={16} aria-hidden />Edit</button>
            </div>
            <p className="unit-notes">{entry.notes}</p>
          </li>;
        })}
      </ul>}
      {(page || hasMore) && <div className="unit-journal-links">
        {page ? <>
          <RouteLink className="button" href={journalHref()}>Show latest entries</RouteLink>
          {page > 1 && <RouteLink className="button" href={journalHref(page - 1)}>Newer entries</RouteLink>}
          {hasMore && <RouteLink className="button" href={journalHref(page + 1)}>Older entries</RouteLink>}
        </> : <RouteLink className="button" href={journalHref(1)}>View full journal</RouteLink>}
      </div>}
    </>}
    {(editing || newEntryOpen) && <JournalEntryEditor {...scope} entry={editing} close={closeEditor} saved={() => {
      closeEditor();
      setStatus("Journal entry saved.");
    }} />}
  </section>;
}

function JournalEntryEditor({ entry, close, saved, ...scope }: JournalScope & {
  entry: JournalEntry | null; close: () => void; saved: () => void;
}) {
  const [issue, setIssue] = useState("");
  const [busy, setBusy] = useState(false);
  const [date] = useState(() => entry?.entry_date ?? todayInVisitZone());

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setIssue("");
    setBusy(true);
    try {
      const result = await saveJournalEntry({
        id: entry?.id,
        ...scope,
        entry_date: form.get("entry_date"),
        notes: form.get("notes"),
      });
      if (result.error) {
        setIssue(result.error);
        return;
      }
      saved();
    } catch {
      setIssue("Could not save the journal entry. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={entry ? "Edit journal entry" : "New journal entry"} close={() => { if (!busy) close(); }}>
    <form className="modal-body stack" onSubmit={save}>
      <label>Date<input name="entry_date" type="date" min="0001-01-01" max="9999-12-31" defaultValue={date} required /></label>
      <label>Notes<textarea name="notes" rows={6} maxLength={journalNotesMaxLength} defaultValue={entry?.notes} required /></label>
      {issue && <p className="notice error" role="alert">{issue}</p>}
      <div className="form-actions">
        <button type="button" className="button" disabled={busy} onClick={close}>Cancel</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? "Saving…" : "Save entry"}</button>
      </div>
    </form>
  </Modal>;
}
