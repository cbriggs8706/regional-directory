"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { normalizeEmail } from "../lib/directory";
import { Modal } from "./modal";

export function EmailAllButton({ group, emails }: {
  group: string;
  emails: (string | null | undefined)[];
}) {
  const [copied, setCopied] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const addressList = [...new Set(emails.map((email) => normalizeEmail(email ?? "")).filter(Boolean))].join(", ");
  const isCopied = Boolean(addressList) && copied === addressList;

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(""), 2500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copyEmails() {
    try {
      await navigator.clipboard.writeText(addressList);
      setCopied(addressList);
    } catch {
      setCopied("");
      setManualCopy(addressList);
    }
  }

  return <>
    <button type="button" className="button" disabled={!addressList} onClick={copyEmails}
      aria-label={isCopied ? `${group} email addresses copied` : `Email all in ${group}`}
      title={addressList ? `Copy email addresses for ${group}` : "No email addresses for current holders"}>
      {isCopied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      {isCopied ? "Copied" : "Email all"}
    </button>
    <span className="visually-hidden" role="status">{isCopied ? `${group} email addresses copied.` : ""}</span>
    {manualCopy && <Modal title={`Copy email addresses for ${group}`} close={() => setManualCopy("")}>
      <div className="modal-body stack">
        <label>Email addresses
          <textarea readOnly rows={5} value={manualCopy} onFocus={(event) => event.currentTarget.select()} />
        </label>
      </div>
    </Modal>}
  </>;
}
