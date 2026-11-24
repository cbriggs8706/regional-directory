"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Building2, ChevronRight, Plus } from "lucide-react";
import { buildingPhotoUrl, formatBuildingAddress, hasSacramentMeeting, unitLabels, type Building, type Unit } from "../lib/directory";
import { addStakeUnits } from "./actions";
import { Modal } from "./editor";
import { UnitLanguageBadges } from "./unit-facts";

export function StakeUnits({ stake, units, buildings, languageNames }: {
  stake: Unit; units: Unit[]; buildings: Building[]; languageNames: Map<string, string>;
}) {
  const [addingUnits, setAddingUnits] = useState(false);
  const [addResult, setAddResult] = useState("");
  const children = units.filter((unit) => unit.parent_id === stake.id && hasSacramentMeeting(unit.kind))
    .sort((a, b) => a.name.localeCompare(b.name));
  const buildingsById = new Map(buildings.map((building) => [building.id, building]));
  const unitsByBuilding = new Map<Building | undefined, Unit[]>();
  for (const unit of children) {
    const building = buildingsById.get(unit.building_id ?? "");
    const group = unitsByBuilding.get(building) ?? [];
    group.push(unit);
    unitsByBuilding.set(building, group);
  }
  const groups = [...unitsByBuilding].map(([building, members]) => ({
    building, members, address: building ? formatBuildingAddress(building) : "No building assigned",
  })).sort((a, b) => Number(!a.building) - Number(!b.building) || a.address.localeCompare(b.address, undefined, { numeric: true }));

  return (
    <section aria-labelledby="stake-units-heading">
      <div className="section-heading">
        <h2 id="stake-units-heading">Units</h2>
        <button type="button" className="button primary" onClick={() => {
          setAddResult("");
          setAddingUnits(true);
        }}>
          <Plus size={16} aria-hidden />Add units
        </button>
      </div>
      {addResult && <p className="notice" role="status">{addResult}</p>}
      {groups.length === 0 ? <p className="panel empty">This stake has no wards or branches yet.</p>
        : <div className="stake-unit-groups">
          {groups.map(({ building, address, members }) => (
            <div key={building?.id ?? "unassigned"}>
              <h3 className="stake-unit-building">{address}</h3>
              <ul className="stake-unit-grid" aria-label={address}>
                {members.map((unit) => <li key={unit.id}>
                  <Link href={`/units/${unit.id}`} prefetch={false} className="panel stake-unit-card">
                    <span className="stake-unit-photo">
                      {building?.photo_path
                        ? <Image src={buildingPhotoUrl(building)} alt="" fill unoptimized />
                        : <Building2 size={36} aria-hidden />}
                    </span>
                    <span className="stake-unit-caption">
                      <span className="unit-node-title">
                        <strong>{unit.name}</strong>
                        <small>{unitLabels[unit.kind]}</small>
                        <span className="chips"><UnitLanguageBadges unit={unit} languageNames={languageNames} /></span>
                      </span>
                      <ChevronRight size={19} aria-hidden />
                    </span>
                  </Link>
                </li>)}
              </ul>
            </div>
          ))}
        </div>}
      {addingUnits && <AddStakeUnits stake={stake} close={() => setAddingUnits(false)} onSaved={(added, skipped) => {
        setAddingUnits(false);
        const message = `Added ${added} ${added === 1 ? "unit" : "units"}.`;
        setAddResult(skipped ? `${message} Skipped ${skipped} ${skipped === 1 ? "duplicate" : "duplicates"}.` : message);
      }} />}
    </section>
  );
}

function AddStakeUnits({ stake, close, onSaved }: {
  stake: Unit;
  close: () => void;
  onSaved: (added: number, skipped: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await addStakeUnits(stake.id, form);
      if (result.error !== null) setError(result.error);
      else onSaved(result.added, result.skipped);
    } catch {
      setError("Could not save the units. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add wards and branches" close={() => { if (!busy) close(); }}>
      <form className="modal-body stack" onSubmit={submit}>
        <p>Add units to <strong>{stake.name}</strong>. Type or paste one name per line.</p>
        <label>Wards<textarea name="wards" rows={5} disabled={busy} /></label>
        <label>Branches<textarea name="branches" rows={3} disabled={busy} /></label>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="button" onClick={close} disabled={busy}>Cancel</button>
          <button className="button primary" disabled={busy}>{busy ? "Adding…" : "Add units"}</button>
        </div>
      </form>
    </Modal>
  );
}
