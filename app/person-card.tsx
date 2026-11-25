"use client";

import { useState, type ReactNode } from "react";
import { Copy, MessageCircle, Phone } from "lucide-react";
import type { Contact } from "../lib/directory";
import { Modal } from "./editor";

type CardContact = Pick<Contact, "name" | "phone" | "email" | "is_whatsapp">;

export function PersonCard({ as: Element = "li", className, person, children }: {
  as?: "li" | "div";
  className?: string;
  person?: CardContact;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!person) return <Element className={className}>{children}</Element>;

  return <Element className={className ? `person-card ${className}` : "person-card"}>
    <button type="button" className="person-card-trigger" aria-label={`Contact ${person.name}`}
      aria-haspopup="dialog" onClick={() => setOpen(true)} />
    {children}
    {open && <ContactMenu person={person} close={() => setOpen(false)} />}
  </Element>;
}

function ContactMenu({ person, close }: { person: CardContact; close: () => void }) {
  const [copyStatus, setCopyStatus] = useState<"copied" | "manual" | null>(null);
  const [number, extension] = (person.phone ?? "").trim().split(/\s*(?:;ext=|ext\.?|x|#)\s*/i);
  const dial = number.replace(/[\s().-]/g, "");
  const phone = /^\+?\d+$/.test(dial) ? dial : null;
  const phoneExtension = extension && /^\d+$/.test(extension) ? `;ext=${extension}` : "";
  const email = person.email?.trim();
  const digits = phone?.replace(/^\+/, "") ?? "";
  const whatsapp = person.is_whatsapp && (phone?.startsWith("+") ? digits : digits.length === 10 ? `1${digits}` : digits);
  const whatsappHref = whatsapp && /^[1-9]\d{7,14}$/.test(whatsapp) ? `https://wa.me/${whatsapp}` : null;

  async function copyEmail() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("manual");
    }
  }

  return <Modal title={person.name} close={close} className="contact-menu">
    <div className="modal-body stack">
      {(phone || email) ? <div className="contact-menu-actions">
        {phone && <a className="button" href={`tel:${phone}${phoneExtension}`}><Phone size={18} aria-hidden />Call</a>}
        {phone && <a className="button" href={whatsappHref ?? `sms:${phone}`}
          target={whatsappHref ? "_blank" : undefined} rel={whatsappHref ? "noopener noreferrer" : undefined}>
          <MessageCircle size={18} aria-hidden />{whatsappHref ? "Message on WhatsApp" : "Message"}
        </a>}
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
    </div>
  </Modal>;
}
