"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Copy, MessageCircle, Pencil, Phone } from "lucide-react";
import type { Contact } from "../lib/directory";
import { saveContactDetails } from "./actions";
import { Modal } from "./editor";

type CardContact = Pick<Contact, "id" | "name" | "phone" | "email">;

export function PersonCard({ as: Element = "li", className, person, children, canEdit = true }: {
  as?: "li" | "div";
  className?: string;
  person?: CardContact;
  canEdit?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!person) return <Element className={className}>{children}</Element>;

  return <Element className={className ? `person-card ${className}` : "person-card"}>
    <button type="button" className="person-card-trigger" aria-label={`Contact ${person.name}`}
      aria-haspopup="dialog" onClick={() => setOpen(true)} />
    {children}
    {open && createPortal(<ContactMenu person={person} canEdit={canEdit} close={() => setOpen(false)} />, document.body)}
  </Element>;
}

function ContactMenu({ person, canEdit, close }: { person: CardContact; canEdit: boolean; close: () => void }) {
  const [copyStatus, setCopyStatus] = useState<"copied" | "manual" | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [number, extension] = (person.phone ?? "").trim().split(/\s*(?:;ext=|ext\.?|x|#)\s*/i);
  const dial = number.replace(/[\s().-]/g, "");
  const phone = /^\+?\d+$/.test(dial) ? dial : null;
  const phoneExtension = extension && /^\d+$/.test(extension) ? `;ext=${extension}` : "";
  const email = person.email?.trim();
  const digits = phone?.replace(/^\+/, "") ?? "";
  const whatsappNumber = phone?.startsWith("+") ? digits : digits.length === 10 ? `1${digits}` : digits;
  const whatsappHref = /^[1-9]\d{7,14}$/.test(whatsappNumber) ? `whatsapp://send?phone=${whatsappNumber}` : null;

  async function copyEmail() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("manual");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;

    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await saveContactDetails(person.id, {
        phone: String(fields.get("phone") ?? "").trim() || null,
        email: String(fields.get("email") ?? "").trim() || null,
      });
      if (result.error) setError(result.error);
      else {
        setEditing(false);
        setSaved(true);
      }
    } catch {
      setError("The request could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={person.name} close={() => { if (!busy) close(); }} className="contact-menu">
    {canEdit && editing ? <form className="modal-body stack" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label>Phone number
          <input name="phone" type="tel" autoComplete="tel" defaultValue={person.phone ?? ""} maxLength={50} autoFocus />
        </label>
        <label>Email address
          <input name="email" type="email" autoComplete="email" defaultValue={person.email ?? ""} maxLength={254} />
        </label>
      </fieldset>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
      </div>
    </form> : <div className="modal-body stack">
      {(phone || email) ? <div className="contact-menu-actions">
        {phone && <a className="button" href={`tel:${phone}${phoneExtension}`}><Phone size={18} aria-hidden />Call</a>}
        {phone && <div className="contact-menu-messaging">
          <a className="button" href={`sms:${phone}`}><MessageCircle size={18} aria-hidden />Message</a>
          {whatsappHref && <a className="button" href={whatsappHref}>Message via WhatsApp</a>}
        </div>}
        {email && <button type="button" className="button" onClick={copyEmail}>
          <Copy size={18} aria-hidden />Copy email address
        </button>}
      </div> : <p className="muted">No phone number or email address on file.</p>}
      {copyStatus === "copied" && <p className="muted" role="status">Email address copied.</p>}
      {copyStatus === "manual" && <label>Email address
        <input type="text" value={email} readOnly ref={(input) => {
          input?.focus();
          input?.select();
        }} onFocus={(event) => event.currentTarget.select()} />
      </label>}
      {saved && <p className="muted" role="status">Contact details saved.</p>}
      {canEdit && <div className="contact-menu-actions">
        <button type="button" className="button" onClick={() => {
          setCopyStatus(null);
          setError("");
          setSaved(false);
          setEditing(true);
        }}><Pencil size={18} aria-hidden />Edit contact information</button>
      </div>}
    </div>}
  </Modal>;
}
