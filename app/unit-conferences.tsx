import { CalendarDays, Pencil, Plus } from "lucide-react";
import { unitLabels, type Conference, type Unit } from "../lib/directory";
import type { EditorState } from "./editor";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function UnitConferences({ unit, conferences, edit }: {
  unit: Unit; conferences: Conference[] | null; edit?: (state: EditorState) => void;
}) {
  const resource = unit.kind === "stake" ? "stake_conferences" : "ward_conferences";
  const conferenceLabel = `${unitLabels[unit.kind]} conference`;
  const headingId = `conference-heading-${unit.id}`;
  const ordered = conferences && [...conferences].sort((a, b) =>
    b.begins_on.localeCompare(a.begins_on) || b.ends_on.localeCompare(a.ends_on));

  return <section className="unit-conferences" aria-labelledby={headingId}>
    <div className="unit-conferences-heading">
      <h2 id={headingId}>{conferenceLabel}s</h2>
      {edit && conferences && <button className="button" aria-label={`Add ${conferenceLabel.toLowerCase()}`}
        onClick={() => edit({ resource, unit })}>
        <Plus size={16} aria-hidden />Add conference
      </button>}
    </div>
    {ordered?.length ? <ul className="management-list">
      {ordered.map((conference) => {
        const dates = dateFormat.formatRange(new Date(conference.begins_on), new Date(conference.ends_on));
        return <li key={conference.id}>
          <CalendarDays size={17} aria-hidden />
          <div>{dates}</div>
          {edit && <button className="icon-button" aria-label={`Edit ${conferenceLabel.toLowerCase()} ${dates}`}
            onClick={() => edit({ resource, unit, row: conference })}><Pencil size={16} aria-hidden /></button>}
        </li>;
      })}
    </ul> : <p className="unit-conferences-empty">{conferences === null
      ? "Apply the ward conferences migration in Supabase to enable conference scheduling."
      : "No conferences scheduled."}</p>}
  </section>;
}
