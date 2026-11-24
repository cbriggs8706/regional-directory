"use client";

import Link from "next/link";
import { ChevronDown, Pencil, Plus, UserRound } from "lucide-react";
import {
  compareCallingOrder, type Assignment, type CallingType, type Directory, type Position, type Unit,
} from "../lib/directory";
import { AssignmentBuildings } from "./assignment-buildings";
import type { EditorState } from "./editor";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function UnitCallings({ unit, directory, edit, title }: {
  unit: Unit; directory: Directory; edit: (state: EditorState) => void; title: string;
}) {
  const organizations = directory.organizations.filter((organization) => organization.level === unit.level).sort(compareCallingOrder);
  const callings = directory.calling_types.filter((calling) => calling.level === unit.level).sort(compareCallingOrder);
  const positions = new Map(directory.positions.filter((position) => position.unit_id === unit.id)
    .map((position) => [position.calling_type_id, position]));
  const positionIds = new Set([...positions.values()].map(({ id }) => id));
  const assignmentsByPosition = new Map<string, Assignment[]>();
  for (const assignment of directory.assignments) {
    if (!positionIds.has(assignment.position_id)) continue;
    const holders = assignmentsByPosition.get(assignment.position_id) ?? [];
    holders.push(assignment);
    assignmentsByPosition.set(assignment.position_id, holders);
  }
  const contacts = new Map(directory.contacts.map((person) => [person.id, person.name]));
  const buildings = new Map(directory.buildings.map((building) => [building.id, building]));

  function holderName(assignment: Assignment) {
    return contacts.get(assignment.contact_id) ?? "Unknown holder";
  }

  function holderCard(assignment: Assignment, calling: CallingType, position: Position) {
    const name = holderName(assignment);
    const callingName = assignment.released_on ? assignment.calling_name : calling.name;
    return <li className="panel unit-holder-card" key={assignment.id}>
      <span className="unit-holder-icon"><UserRound size={19} aria-hidden /></span>
      <div className="unit-holder-info">
        <strong>{name}</strong>
        <span className="unit-holder-calling">{callingName}</span>
        {assignment.sustained_on && <small>Sustained {dateFormat.format(new Date(assignment.sustained_on))}</small>}
        {assignment.released_on && <small>Released {dateFormat.format(new Date(assignment.released_on))}</small>}
        {assignment.assignment_labels.length > 0 && <div className="chips">
          {assignment.assignment_labels.map((label) => <span className="chip" key={label}>{label}</span>)}
        </div>}
        <AssignmentBuildings assignment={assignment} buildings={buildings} />
      </div>
      <button className="icon-button" aria-label={`Edit ${callingName} assignment for ${name}`}
        title={assignment.released_on ? "Edit assignment" : "Edit or release"}
        onClick={() => edit({ resource: "assignments", position, row: assignment })}>
        <Pencil size={16} aria-hidden />
      </button>
    </li>;
  }

  return <section aria-labelledby="unit-callings-heading">
    <h2 className="unit-section-heading" id="unit-callings-heading">{title}</h2>
    {callings.length === 0 ? <div className="panel empty"><h3>No callings yet</h3>
      <Link href="/?tab=callings">Manage organizations and callings</Link>
    </div> : <div className="calling-list unit-callings-list">
      {organizations.map((organization) => {
        const roles = callings.filter((calling) => calling.organization_id === organization.id).map((calling) => {
          const position = positions.get(calling.id);
          const holders = position ? assignmentsByPosition.get(position.id) ?? [] : [];
          const current = holders.filter((assignment) => !assignment.released_on)
            .sort((a, b) => holderName(a).localeCompare(holderName(b)));
          return { calling, position, current, holders };
        });
        if (roles.length === 0) return null;

        const current = roles.flatMap(({ calling, position, current }) => position
          ? current.map((assignment) => ({ calling, position, assignment })) : []);
        const past = roles.flatMap(({ calling, position, holders }) => position
          ? holders.filter((assignment) => assignment.released_on).map((assignment) => ({ calling, position, assignment })) : [])
          .sort((a, b) => (b.assignment.released_on ?? "").localeCompare(a.assignment.released_on ?? ""));

        return <section className="unit-calling" key={organization.id} aria-labelledby={`unit-organization-${organization.id}`}>
          <div className="unit-calling-heading">
            <h3 id={`unit-organization-${organization.id}`}>{organization.name}</h3>
          </div>
          {current.length ? <ul className="unit-holder-grid" aria-label="Current holders">
            {current.map(({ assignment, calling, position }) => holderCard(assignment, calling, position))}
          </ul> : <p className="muted">No current holders.</p>}
          <details className="unit-calling-details">
            <summary className="text-button"><ChevronDown size={16} aria-hidden />Manage callings</summary>
            <ul className="management-list unit-calling-roles">
              {roles.map(({ calling, position, current }) => {
                const addPast = Boolean(position?.retired_on || (current.length && !position?.multiple_holders));
                return <li key={calling.id}>
                  <div><strong>{calling.name}</strong>
                    {position?.retired_on ? <small>Retired {dateFormat.format(new Date(position.retired_on))}</small>
                      : current.length === 0 && <small>Vacant</small>}
                  </div>
                  <button className="button" aria-label={`${addPast ? "Add past holder" : "Add holder"} for ${calling.name}`}
                    onClick={() => edit(position ? { resource: "assignments", position } : { resource: "assignments", unit, callingType: calling })}>
                    <Plus size={16} aria-hidden />{addPast ? "Add past holder" : "Add holder"}
                  </button>
                  {position && <button className="icon-button" aria-label={`Edit calling settings for ${calling.name}`}
                    title="Edit calling settings" onClick={() => edit({ resource: "positions", row: position })}>
                    <Pencil size={16} aria-hidden />
                  </button>}
                </li>;
              })}
            </ul>
          </details>
          {past.length > 0 && <details className="unit-calling-details">
            <summary className="text-button"><ChevronDown size={16} aria-hidden />Past holders ({past.length})</summary>
            <ul className="unit-holder-grid" aria-label="Past holders">
              {past.map(({ assignment, calling, position }) => holderCard(assignment, calling, position))}
            </ul>
          </details>}
        </section>;
      })}
    </div>}
  </section>;
}
