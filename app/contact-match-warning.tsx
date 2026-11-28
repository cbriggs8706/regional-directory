"use client";

import { useEffect, useRef, useState } from "react";
import { unitNameWithType, type Unit } from "../lib/directory";
import { checkContactName } from "./actions";

type MatchWarning = Awaited<ReturnType<typeof checkContactName>> & { name: string };

export function useContactMatchCheck() {
  const [warning, setWarning] = useState<MatchWarning>();

  async function needsConfirmation(name: string) {
    if (!name || warning?.name === name) return false;
    const { matches } = await checkContactName(name).catch(() => ({ matches: null }));
    if (matches?.length === 0) return false;
    setWarning({ name, matches });
    return true;
  }

  return { warning, needsConfirmation, reset: () => setWarning(undefined) };
}

export function ContactMatchWarning({ warning, units }: { warning: MatchWarning; units: Map<string, Unit> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, [warning]);

  const { matches } = warning;
  return <div className="notice error contact-match-warning" ref={ref} tabIndex={-1} role="group" aria-label="Possible duplicate contact">
    <p>{matches ? <strong>{matches.length === 1 ? "Possible duplicate contact" : "Possible duplicate contacts"}</strong>
      : "Could not check for matching contacts."}</p>
    {matches && <ul aria-label="Matching contacts">
      {matches.map(({ id, name, phone, email, home_ward_id }) => {
        const homeWard = home_ward_id ? units.get(home_ward_id) : undefined;
        return <li key={id}>
          <strong>{name}</strong>
          <div>Phone: {phone || "Not set"}</div>
          <div>Email: {email || "Not set"}</div>
          <div>Home Ward: {homeWard ? unitNameWithType(homeWard) : home_ward_id ? "Unavailable" : "Not set"}</div>
        </li>;
      })}
    </ul>}
    <p>Do you still want to create a new person?</p>
  </div>;
}
