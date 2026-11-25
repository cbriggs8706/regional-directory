"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X, type LucideIcon } from "lucide-react";

export function AddMenu({ host, label, actions }: {
  host: HTMLElement | null;
  label: string;
  actions: { label: string; Icon: LucideIcon; run: () => void; hidden?: boolean }[];
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const control = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const available = actions.filter((action) => !action.hidden);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePress(event: PointerEvent) {
      if (event.target instanceof Node && !control.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [open]);

  function close() {
    setOpen(false);
    toggle.current?.focus({ preventScroll: true });
  }

  if (!host || !available.length) return null;
  return createPortal(<div ref={control} className="unit-add" onKeyDown={(event) => {
    if (open && event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }}>
    <button ref={toggle} type="button" className="unit-add-toggle" aria-label={open ? "Close add options" : label}
      aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      {open ? <X size={26} aria-hidden /> : <Plus size={28} aria-hidden />}
    </button>
    <div id={id} className="panel unit-add-actions" role="group" aria-label={label} hidden={!open}>
      {available.map(({ label: action, Icon, run }) => <button key={action} type="button" className="button"
        onClick={() => { close(); run(); }}><Icon size={18} aria-hidden />{action}</button>)}
    </div>
  </div>, host);
}
