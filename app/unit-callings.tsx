"use client";

import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { compareCallingOrder, type Assignment, type Directory, type Unit } from "../lib/directory";
import type { EditorState } from "./editor";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function UnitCallings({ unit, directory, edit, close }: {
  unit: Unit; directory: Directory; edit: (state: EditorState) => void; close: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const callings = directory.calling_types.filter((type) => type.level === unit.level)
    .sort(compareCallingOrder);
  const positions = new Map(directory.positions.filter((position) => position.unit_id === unit.id)
    .map((position) => [position.calling_type_id, position]));
  const contacts = new Map(directory.contacts.map((person) => [person.id, person.name]));

  return <section aria-labelledby="unit-callings-heading">
    <button className="text-button" onClick={close}><ArrowLeft size={16} aria-hidden />Back to units</button>
    <div className="section-heading"><div>
      <h1 id="unit-callings-heading" tabIndex={-1} ref={heading}>{unit.name}</h1>
      <p>Callings</p>
    </div></div>
    {callings.length === 0 ? <div className="panel empty"><h2>No calling titles yet</h2>
      <p>Add a calling type for this level in Callings.</p>
    </div> : <div className="calling-list">
      {callings.map((calling) => {
        const position = positions.get(calling.id);
        const assignments = position ? directory.assignments.filter((assignment) => assignment.position_id === position.id) : [];
        const current = assignments.filter((assignment) => !assignment.released_on);
        const past = assignments.filter((assignment) => assignment.released_on)
          .sort((a, b) => (b.released_on ?? "").localeCompare(a.released_on ?? ""));

        function holderRow(assignment: Assignment) {
          const name = contacts.get(assignment.contact_id);
          return <div className="assignment" key={assignment.id}>
            <div><strong>{name}</strong>
              {assignment.sustained_on && <small>Sustained {dateFormat.format(new Date(assignment.sustained_on))}</small>}
              {assignment.released_on && <small>Released {dateFormat.format(new Date(assignment.released_on))}</small>}
              {assignment.calling_name !== calling.name && <small>Assigned as {assignment.calling_name}</small>}
              {assignment.fh_assignment && <span className="chip">FH Assignment</span>}
            </div>
            {position && <button className="button" aria-label={`Edit assignment for ${name}`}
              onClick={() => edit({ resource: "assignments", position, row: assignment })}>
              {assignment.released_on ? "Edit" : "Edit / release"}
            </button>}
          </div>;
        }

        return <article className="panel position" key={calling.id}>
          <div className="position-heading"><div>
            <h2>{calling.name}</h2>
            {position?.retired_on ? <p>Retired {dateFormat.format(new Date(position.retired_on))}</p>
              : current.length === 0 && <p>Vacant</p>}
          </div>
            {position && <button className="icon-button" aria-label={`Edit calling settings for ${calling.name}`}
              onClick={() => edit({ resource: "positions", row: position })}><Pencil size={16} /></button>}
          </div>
          {current.map(holderRow)}
          {!position?.retired_on && (!current.length || position?.multiple_holders) &&
            <button className="text-button add-holder" onClick={() => edit(position
              ? { resource: "assignments", position } : { resource: "assignments", unit, callingType: calling })}>
              <Plus size={16} aria-hidden />Add holder
            </button>}
          {past.length > 0 && <details className="unit-calling-history">
            <summary className="text-button">Past holders ({past.length})</summary>
            {past.map(holderRow)}
          </details>}
        </article>;
      })}
    </div>}
  </section>;
}
