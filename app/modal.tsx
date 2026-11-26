"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

export function Modal({ title, close, children, className }: {
  title: string; close: () => void; children: ReactNode; className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
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
