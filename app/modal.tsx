"use client";

import { X } from "lucide-react";
import { useId, useLayoutEffect, useRef, type ReactNode } from "react";

const editableFields = [
  'form input:not([type="hidden"], [type="button"], [type="submit"], [type="reset"], [type="image"], [readonly], :disabled)',
  'form select:not(:disabled)',
  'form textarea:not([readonly], :disabled)',
].join(", ");
const hiddenField = "[hidden], [inert], details:not([open])";

export function Modal({ title, close, children, className }: {
  title: string; close: () => void; children: ReactNode; className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;

    const fields = Array.from(element.querySelectorAll<HTMLElement>(editableFields))
      .filter((field) => !field.closest(hiddenField));
    const initialField = fields[0];
    // Let the browser focus the field during showModal(), before it falls back to Close.
    const addAutofocus = initialField && !initialField.hasAttribute("autofocus");
    if (addAutofocus) initialField.setAttribute("autofocus", "");
    element.showModal();
    if (addAutofocus) initialField.removeAttribute("autofocus");

    const firstField = fields
      .find((field) => field.getClientRects().length > 0 && getComputedStyle(field).visibility === "visible");
    if (firstField && document.activeElement !== firstField) firstField.focus();

    const closeButton = element.querySelector(".modal-heading button");
    const frame = requestAnimationFrame(() => {
      // Focus may be restored after the opening interaction replaces another dialog.
      if (element.matches(":modal") && (document.activeElement === closeButton || document.activeElement === document.body)) {
        firstField?.focus();
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      element.close();
    };
  }, []);

  return (
    <dialog ref={dialog} className={className} aria-labelledby={titleId} onCancel={(event) => {
      event.preventDefault();
      event.stopPropagation();
      close();
    }}>
      <div className="modal-heading"><h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={close}><X size={20} /></button>
      </div>
      {children}
    </dialog>
  );
}
