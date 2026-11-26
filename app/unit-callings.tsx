"use client";

import { useState } from "react";
import { RouteLink } from "./route-navigation";
import { ChevronDown, Pencil, Plus, UserRound } from "lucide-react";
import {
  compareCallingOrder, type Assignment, type CallingType, type Directory, type Organization, type Position, type Unit,
} from "../lib/directory";
import { AssignmentBuildings } from "./assignment-buildings";
import { Modal, type EditorState } from "./editor";
import { standardCallingGroups, standardGroupFor, standardGroupsForUnit, standardRoleIndex, type StandardCallingGroup } from "../lib/standard-callings";
import { UnitSectionHeading } from "./unit-section-heading";
import { PersonCard } from "./person-card";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function UnitCallings({ unit, directory, edit, title, admin }: {
  unit: Unit; directory: Directory; edit: (state: EditorState) => void; title: string; admin: boolean;
}) {
  const [managing, setManaging] = useState<string | null>(null);
  const organizations = directory.organizations.filter((organization) => organization.level === unit.level).sort(compareCallingOrder);
  const groups: { key: string; name: string; organization?: Organization; template?: StandardCallingGroup }[] =
    organizations.map((organization) => ({
      key: organization.id, name: organization.name, organization, template: standardGroupFor(organization.name, organization.level),
    }));
  for (const template of standardGroupsForUnit(unit.kind)) {
    if (!groups.some((group) => group.template === template)) {
      groups.push({ key: template, name: standardCallingGroups[template].name, template });
    }
  }
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
  const contacts = new Map(directory.contacts.map((person) => [person.id, person]));
  const buildings = new Map(directory.buildings.map((building) => [building.id, building]));

  function holderName(assignment: Assignment) {
    return contacts.get(assignment.contact_id)?.name ?? "Unknown holder";
  }

  function holderCard(assignment: Assignment, calling: CallingType, position: Position, canAddAnother = false) {
    const name = holderName(assignment);
    const callingName = assignment.released_on ? assignment.calling_name : calling.name;
    return <PersonCard className="panel unit-holder-card" key={assignment.id} person={contacts.get(assignment.contact_id)}>
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
        {canAddAnother && <button type="button" className="text-button" aria-label={`Add another holder for ${calling.name}`}
          onClick={() => addHolder(calling, position)}><Plus size={16} aria-hidden />Add another holder</button>}
      </div>
      <button className="icon-button" aria-label={`Edit ${callingName} assignment for ${name}`}
        title={assignment.released_on ? "Edit assignment" : "Edit or release"}
        onClick={() => edit({ resource: "assignments", position, row: assignment })}>
        <Pencil size={16} aria-hidden />
      </button>
    </PersonCard>;
  }

  function addHolder(calling: CallingType, position?: Position) {
    edit(position ? { resource: "assignments", position } : { resource: "assignments", unit, callingType: calling });
  }

  function vacantCard(key: string, name: string, add: () => void, retired = false) {
    const element = <li key={key} className="panel unit-holder-vacant">
      {retired ? <div className="unit-vacancy-content"><strong>{name}</strong><small>Retired</small></div>
        : <button type="button" className="unit-vacancy-content unit-vacancy-add" onClick={add} aria-label={`Add holder for ${name}`}>
          <span className="unit-holder-icon"><Plus size={19} aria-hidden /></span>
          <strong>{name}</strong>
        </button>}
    </li>;
    return { element, vacancy: !retired };
  }

  return <section className="unit-tab-section" aria-labelledby="unit-callings-heading">
    <UnitSectionHeading id="unit-callings-heading" title={title} unit={unit} />
    {groups.length === 0 ? <div className="panel empty"><h3>No callings yet</h3>
      {admin && <RouteLink href="/?tab=callings">Manage organizations and callings</RouteLink>}
    </div> : <div className="calling-list unit-callings-list">
      {groups.map(({ key, name, organization, template }) => {
        const roles = callings.filter((calling) => calling.organization_id === organization?.id).map((calling) => {
          const position = positions.get(calling.id);
          const holders = position ? assignmentsByPosition.get(position.id) ?? [] : [];
          const current = holders.filter((assignment) => !assignment.released_on)
            .sort((a, b) => holderName(a).localeCompare(holderName(b)));
          const cards = position && current.length > 0
            ? current.map((assignment, index) => ({
              element: holderCard(assignment, calling, position, index === 0 && !position.retired_on), vacancy: false,
            }))
            : [vacantCard(calling.id, calling.name, () => addHolder(calling, position), Boolean(position?.retired_on))];
          return { calling, position, holders, cards };
        });
        const past = roles.flatMap(({ calling, position, holders }) => position
          ? holders.filter((assignment) => assignment.released_on).map((assignment) => ({ calling, position, assignment })) : [])
          .sort((a, b) => (b.assignment.released_on ?? "").localeCompare(a.assignment.released_on ?? ""));

        let cards = roles.flatMap((role) => role.cards);
        if (template && standardCallingGroups[template].kind === unit.kind) {
          const standard = standardCallingGroups[template];
          const numbered = new Map<number, typeof roles[number]>();
          for (const role of roles) {
            const index = standardRoleIndex(template, role.calling.name);
            if (index >= 0 && index < standard.roles.length && !numbered.has(index)) numbered.set(index, role);
          }
          const numberedRoles = new Set(numbered.values());
          const unnumbered = roles.filter((role) => !numberedRoles.has(role));
          const shared = unnumbered.filter(({ calling, position }) => !position?.retired_on && (template === "high-council"
            ? /council|member/i.test(calling.name) && !/clerk|secretary/i.test(calling.name)
            : /coun[sc]ell?or/i.test(calling.name)));
          const sharedRoles = new Set(shared);
          const unassignedCards = shared.flatMap((role) => role.cards);
          const sharedCouncilRole = template === "high-council" ? shared[0] : undefined;

          cards = standard.roles.flatMap((title, index) => {
            const configured = numbered.get(index);
            if (configured) return configured.cards;
            const sharedCard = unassignedCards.shift();
            if (sharedCard) return [sharedCard];
            return [vacantCard(`${template}-${index}`, title, () => {
              if (sharedCouncilRole) addHolder(sharedCouncilRole.calling, sharedCouncilRole.position);
              else edit({ resource: "assignments", unit, standardRole: { group: template, index } });
            })];
          });
          cards.push(...unassignedCards, ...unnumbered.filter((role) => !sharedRoles.has(role)).flatMap((role) => role.cards));
        }
        if (template === "high-council") {
          const nextVacancy = cards.find((card) => card.vacancy);
          cards = cards.filter((card) => !card.vacancy);
          if (nextVacancy) cards.push(nextVacancy);
        }

        function openEditor(state: EditorState) {
          setManaging(null);
          edit(state);
        }

        return <section className="unit-calling" key={key} aria-labelledby={`unit-organization-${key}`}>
          <div className="unit-calling-heading">
            <h3 id={`unit-organization-${key}`}>{name}</h3>
            <button type="button" className="icon-button" aria-label={`Edit ${name}`} title={`Edit ${name}`}
              onClick={() => setManaging(key)}><Pencil size={16} aria-hidden /></button>
          </div>
          {cards.length ? <ul className="unit-holder-grid" aria-label={`${name} calling holders and vacancies`}>
            {cards.map(({ element }) => element)}
          </ul>
            : <p className="muted">No callings yet.</p>}
          {past.length > 0 && <details className="unit-calling-details">
            <summary className="text-button"><ChevronDown size={16} aria-hidden />Past holders ({past.length})</summary>
            <ul className="unit-holder-grid" aria-label="Past holders">
              {past.map(({ assignment, calling, position }) => holderCard(assignment, calling, position))}
            </ul>
          </details>}
          {managing === key && <Modal title={`Edit ${name}`} close={() => setManaging(null)}>
            <div className="modal-body stack">
              <div className="toolbar">
                <button type="button" className="button" onClick={() => openEditor({
                  resource: "organizations", row: organization, defaults: { name, level: unit.level },
                })}>{organization ? "Edit organization" : "Set up organization"}</button>
                {organization && <button type="button" className="button"
                  onClick={() => openEditor({ resource: "calling_types", organization })}>Add calling</button>}
              </div>
              {roles.length > 0 && <ul className="management-list unit-calling-roles">
                {roles.map(({ calling, position }) => {
                  const addPast = Boolean(position?.retired_on);
                  return <li key={calling.id}>
                    <div><strong>{calling.name}</strong>
                      {position?.retired_on && <small>Retired {dateFormat.format(new Date(position.retired_on))}</small>}
                    </div>
                    <button type="button" className="button" aria-label={`${addPast ? "Add past holder" : "Add holder"} for ${calling.name}`}
                      onClick={() => openEditor(position ? { resource: "assignments", position } : { resource: "assignments", unit, callingType: calling })}>
                      {addPast ? "Add past holder" : "Add holder"}
                    </button>
                    {position && <button type="button" className="icon-button" aria-label={`Edit calling settings for ${calling.name}`}
                      title="Edit calling settings" onClick={() => openEditor({ resource: "positions", row: position })}>
                      <Pencil size={16} aria-hidden />
                    </button>}
                  </li>;
                })}
              </ul>}
            </div>
          </Modal>}
        </section>;
      })}
    </div>}
  </section>;
}
