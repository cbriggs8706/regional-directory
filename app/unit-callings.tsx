"use client";

import { ChevronDown, Pencil, Plus, UserRound } from "lucide-react";
import { callingTree, compareCallingOrder, type Assignment, type Directory, type Unit } from "../lib/directory";
import type { EditorState } from "./editor";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function UnitCallings({ unit, directory, edit, title }: {
  unit: Unit; directory: Directory; edit: (state: EditorState) => void; title: string;
}) {
  const callings = callingTree(directory.calling_types.filter((type) => type.level === unit.level).sort(compareCallingOrder));
  const positions = new Map(directory.positions.filter((position) => position.unit_id === unit.id)
    .map((position) => [position.calling_type_id, position]));
  const contacts = new Map(directory.contacts.map((person) => [person.id, person.name]));

  return <section aria-labelledby="unit-callings-heading">
    <h2 className="unit-section-heading" id="unit-callings-heading">{title}</h2>
    {callings.length === 0 ? <div className="panel empty"><h3>No calling titles yet</h3>
      <p>Add a calling type for this level in Callings.</p>
    </div> : <div className="calling-list unit-callings-list">
      {callings.map(({ calling, depth }) => {
        const position = positions.get(calling.id);
        const assignments = position ? directory.assignments.filter((assignment) => assignment.position_id === position.id) : [];
        const current = assignments.filter((assignment) => !assignment.released_on);
        const past = assignments.filter((assignment) => assignment.released_on)
          .sort((a, b) => (b.released_on ?? "").localeCompare(a.released_on ?? ""));

        function holderCard(assignment: Assignment) {
          const name = contacts.get(assignment.contact_id) ?? "Unknown holder";
          return <li className="panel unit-holder-card" key={assignment.id}>
            <span className="unit-holder-icon"><UserRound size={19} aria-hidden /></span>
            <div className="unit-holder-info"><strong>{name}</strong>
              {assignment.sustained_on && <small>Sustained {dateFormat.format(new Date(assignment.sustained_on))}</small>}
              {assignment.released_on && <small>Released {dateFormat.format(new Date(assignment.released_on))}</small>}
              {assignment.calling_name !== calling.name && <small>Assigned as {assignment.calling_name}</small>}
              {calling.parent_calling_type_id && assignment.fh_assignment && <span className="chip">FH Assignment</span>}
            </div>
            {position && <button className="button" aria-label={`Edit assignment for ${name}`}
              onClick={() => edit({ resource: "assignments", position, row: assignment })}>
              {assignment.released_on ? "Edit" : "Edit / release"}
            </button>}
          </li>;
        }

        return <section className="unit-calling calling-tree-item" key={calling.id} aria-labelledby={`unit-calling-${calling.id}`}
          data-nested={depth > 0 ? "" : undefined}
          style={{ marginInlineStart: `calc(var(--calling-indent) * ${Math.min(depth, 5)})` }}>
          <div className="unit-calling-heading">
            <div>
              <h3 id={`unit-calling-${calling.id}`}>{calling.name}</h3>
              {position?.retired_on ? <p>Retired {dateFormat.format(new Date(position.retired_on))}</p>
                : current.length === 0 && <p>Vacant</p>}
            </div>
            <div className="toolbar unit-calling-actions">
              {!position?.retired_on && (!current.length || position?.multiple_holders) &&
                <button className="button" aria-label={`Add holder for ${calling.name}`} onClick={() => edit(position
                  ? { resource: "assignments", position } : { resource: "assignments", unit, callingType: calling })}>
                  <Plus size={16} aria-hidden />Add holder
                </button>}
              {position && <button className="icon-button" aria-label={`Edit calling settings for ${calling.name}`}
                onClick={() => edit({ resource: "positions", row: position })}><Pencil size={16} aria-hidden /></button>}
            </div>
          </div>
          {current.length > 0 && <ul className="unit-holder-grid" aria-label="Current holders">{current.map(holderCard)}</ul>}
          {past.length > 0 && <details className="unit-calling-history">
            <summary className="button"><ChevronDown size={16} aria-hidden />Past holders ({past.length})</summary>
            <ul className="unit-holder-grid" aria-label="Past holders">{past.map(holderCard)}</ul>
          </details>}
        </section>;
      })}
    </div>}
  </section>;
}
