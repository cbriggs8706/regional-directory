"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "./editor";

export function CalendarEventEditor({ defaultDate, close, saved, saveEvent, title, description, event, removeEvent, removed }: {
  defaultDate: string;
  title: string;
  description?: string;
  event?: { title: string; event_date: string; end_date: string | null };
  saveEvent: (values: { title: FormDataEntryValue | null; event_date: FormDataEntryValue | null; end_date: FormDataEntryValue | null }) =>
    Promise<{ error: string } | { error: null; date: string }>;
  removeEvent?: () => Promise<{ error: string | null }>;
  removed?: () => void;
  close: () => void;
  saved: (date: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [confirmRemove, setConfirmRemove] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await saveEvent({
        title: form.get("title"), event_date: form.get("event_date"), end_date: form.get("end_date") || null,
      });
      if (result.error !== null) setError(result.error);
      else saved(result.date);
    } catch {
      setError("Could not save this event. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removeEvent || busy) return;
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await removeEvent();
      if (result.error) setError(result.error);
      else removed?.();
    } catch {
      setError("Could not remove this event. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={title} close={() => { if (!busy) close(); }}>
    <form className="modal-body stack" onSubmit={submit}>
      {description && <p className="field-help">{description}</p>}
      <label>Title<input name="title" defaultValue={event?.title} disabled={busy} maxLength={150} required /></label>
      <label>Start date
        <input name="event_date" type="date" min="0001-01-01" max="9999-12-31" defaultValue={event?.event_date ?? defaultDate} disabled={busy} required />
      </label>
      <label>End date <span className="optional">optional</span>
        <input name="end_date" type="date" defaultValue={event?.end_date ?? ""} disabled={busy} min="0001-01-01" max="9999-12-31" />
      </label>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="form-actions">
        {removeEvent && <button type="button" className="button text-danger push" disabled={busy} onClick={remove}>
          {confirmRemove ? "Confirm removal" : "Remove"}
        </button>}
        <button type="button" className="button" disabled={busy} onClick={close}>Cancel</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  </Modal>;
}
