"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { journalNotesMaxLength, type JournalEntry, type UnitJournalData } from "../lib/unit-journal";
import { todayInVisitZone } from "../lib/visits";
import { Modal } from "./editor";
import { saveJournalEntry } from "./journal-actions";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function UnitJournal({ unitId, journal }: { unitId: string; journal: UnitJournalData }) {
  const searchParams = useSearchParams();
  const [editor, setEditor] = useState<{ entry?: JournalEntry; date: string } | null>(null);
  const [issue, setIssue] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const { entries, page, hasMore, loadError } = journal;

  function journalHref(nextPage?: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage) params.set("journalPage", String(nextPage));
    else params.delete("journalPage");
    const query = params.toString();
    return `/units/${unitId}${query ? `?${query}` : ""}#unit-journal`;
  }

  function openEditor(entry?: JournalEntry) {
    setStatus("");
    setIssue("");
    setEditor({ entry, date: entry?.entry_date ?? todayInVisitZone() });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !editor) return;
    const form = new FormData(event.currentTarget);
    setIssue("");
    setBusy(true);
    try {
      const result = await saveJournalEntry({
        id: editor.entry?.id,
        unitId,
        entry_date: form.get("entry_date"),
        notes: form.get("notes"),
      });
      if (result.error) {
        setIssue(result.error);
        return;
      }
      setEditor(null);
      setStatus("Journal entry saved.");
    } catch {
      setIssue("Could not save the journal entry. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel unit-journal" id="unit-journal" aria-labelledby="unit-journal-heading">
    <div className="unit-journal-row">
      <h2 id="unit-journal-heading">{page ? "Journal history" : "Journal"}</h2>
      <button type="button" className="button primary" disabled={Boolean(loadError)} onClick={() => openEditor()}>
        <Plus size={18} aria-hidden />New journal entry
      </button>
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
                onClick={() => openEditor(entry)}><Pencil size={16} aria-hidden />Edit</button>
            </div>
            <p className="unit-notes">{entry.notes}</p>
          </li>;
        })}
      </ul>}
      {(page || hasMore) && <div className="unit-journal-links">
        {page ? <>
          <Link className="button" href={journalHref()}>Show latest entries</Link>
          {page > 1 && <Link className="button" href={journalHref(page - 1)}>Newer entries</Link>}
          {hasMore && <Link className="button" href={journalHref(page + 1)}>Older entries</Link>}
        </> : <Link className="button" href={journalHref(1)}>View full journal</Link>}
      </div>}
    </>}
    {editor && <Modal title={editor.entry ? "Edit journal entry" : "New journal entry"}
      close={() => { if (!busy) setEditor(null); }}>
      <form className="modal-body stack" onSubmit={save}>
        <label>Date<input name="entry_date" type="date" min="0001-01-01" max="9999-12-31" defaultValue={editor.date} required /></label>
        <label>Notes<textarea name="notes" rows={6} maxLength={journalNotesMaxLength} defaultValue={editor.entry?.notes} required /></label>
        {issue && <p className="notice error" role="alert">{issue}</p>}
        <div className="form-actions">
          <button type="button" className="button" disabled={busy} onClick={() => setEditor(null)}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy}>{busy ? "Saving…" : "Save entry"}</button>
        </div>
      </form>
    </Modal>}
  </section>;
}
