"use client";

import { useEffect, useState, type FormEvent } from "react";
import { loadCalendarAccess, saveCalendarAccess } from "./access-actions";
import { Modal } from "./modal";

export function CalendarAccessEditor({ email, accounts, close, saved }: {
  email: string;
  accounts: string[];
  close: () => void;
  saved: () => void;
}) {
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof loadCalendarAccess>> | null>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const options = accounts.filter((account) => account !== email);

  useEffect(() => {
    let active = true;
    void loadCalendarAccess(email).then(
      (result) => { if (active) setLoaded(result); },
      () => { if (active) setLoaded({ emails: [], error: "Could not load calendar access." }); },
    );
    return () => { active = false; };
  }, [email, retry]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !loaded || loaded.error) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await saveCalendarAccess({ email, visibleEmails: form.getAll("visible_emails") });
      if (result.error) setError(result.error);
      else saved();
    } catch {
      setError("Could not save calendar access. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <Modal title="Calendar access" close={() => { if (!busy) close(); }}>
    <form className="modal-body stack" onSubmit={submit}>
      <strong>{email}</strong>
      {!loaded && <p className="field-help" role="status">Loading calendar access…</p>}
      {loaded?.error && <p className="notice error" role="alert">{loaded.error}{" "}
        <button type="button" className="text-button" onClick={() => { setLoaded(null); setRetry((value) => value + 1); }}>Retry</button>
      </p>}
      {loaded && !loaded.error && (options.length > 0 ? <fieldset disabled={busy}>
        <legend>Whose visits and personal events can this user see?</legend>
        {options.map((account) => <label className="check" key={account}>
          <input type="checkbox" name="visible_emails" value={account} defaultChecked={loaded.emails.includes(account)} />{account}
        </label>)}
      </fieldset> : <p className="field-help">No other accounts have directory access.</p>)}
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="button" disabled={busy} onClick={close}>Cancel</button>
        <button type="submit" className="button primary" disabled={busy || !loaded || Boolean(loaded.error) || options.length === 0}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  </Modal>;
}
