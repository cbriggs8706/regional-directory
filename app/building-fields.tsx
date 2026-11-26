"use client";

import { Plus } from "lucide-react";
import Image from "next/image";
import { useId, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  buildingPhotoMaxBytes, buildingPhotoTypes, buildingPhotoUrl, formatBuildingAddress, groupBuildingsByCity, unitPath,
  type Building, type Unit,
} from "../lib/directory";
import { saveBuilding } from "./actions";
import { Modal } from "./modal";

export function BuildingFields({ building, units }: { building?: Building; units: Unit[] }) {
  const photoHelp = useId();
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const stakes = units.filter((unit) => unit.kind === "stake")
    .map((unit) => ({ unit, path: unitPath(unit, unitsById) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return <>
    <label>Street address
      <input name="address" autoComplete="address-line1" maxLength={300} required defaultValue={building?.address} />
    </label>
    <label>City
      <input name="city" autoComplete="address-level2" maxLength={150} required defaultValue={building?.city ?? ""} />
    </label>
    <div className="building-address-fields">
      <label>State
        <input name="state" autoComplete="address-level1" autoCapitalize="characters" pattern="[A-Za-z]{2}"
          title="Two-letter state abbreviation" maxLength={2} required defaultValue={building?.state ?? "ID"} />
      </label>
      <label>ZIP code
        <input name="zip_code" autoComplete="postal-code" pattern="[0-9]{5}(-[0-9]{4})?"
          title="Five digits, or ZIP+4" maxLength={10} required defaultValue={building?.zip_code ?? ""} />
      </label>
    </div>
    <label>Agent Stake <span className="optional">optional</span>
      <select name="agent_stake_id" defaultValue={building?.agent_stake_id ?? ""}>
        <option value="">Choose a stake</option>
        {stakes.map(({ unit }) =>
          <option key={unit.id} value={unit.id}>{unitPath(unit, unitsById, "dropdown")}</option>)}
      </select>
    </label>
    {building?.photo_path && <Image className="building-photo-preview" src={buildingPhotoUrl(building)}
      width={480} height={240} alt="Current building picture" unoptimized />}
    <label>{building?.photo_path ? "Replace picture" : "Building picture"} <span className="optional">optional</span>
      <input name="photo" type="file" accept={Object.keys(buildingPhotoTypes).join(",")} aria-describedby={photoHelp} />
      <span className="field-help" id={photoHelp}>
        {building?.photo_path ? "" : "You can add a picture later. "}JPEG, PNG, or WebP up to 4 MB.
      </span>
    </label>
  </>;
}

export function prepareBuildingPhoto(data: FormData) {
  const photo = data.get("photo");
  if (!(photo instanceof File) || (!photo.name && photo.size === 0)) {
    data.delete("photo");
    return "";
  }
  if (photo.size === 0 || photo.size > buildingPhotoMaxBytes || !Object.hasOwn(buildingPhotoTypes, photo.type)) {
    return "Choose a JPEG, PNG, or WebP picture up to 4 MB.";
  }
  return "";
}

function AddBuildingDialog({ units, close, onSave }: {
  units: Unit[]; close: () => void; onSave: (building: Building) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;

    const data = new FormData(event.currentTarget);
    const photoError = prepareBuildingPhoto(data);
    if (photoError) {
      setError(photoError);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await saveBuilding(null, data);
      if (result.error !== null) setError(result.error);
      else onSave(result.building);
    } catch {
      setError("Could not save the building. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <Modal title="Add building" close={() => { if (!busy) close(); }}>
    <form className="modal-body stack" onSubmit={submit}>
      <fieldset disabled={busy}>
        <BuildingFields units={units} />
      </fieldset>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="button" disabled={busy} onClick={close}>Cancel</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? "Saving…" : "Save building"}</button>
      </div>
    </form>
  </Modal>;
}

export function BuildingField({ buildings, units, initialId, disabled }: {
  buildings: Building[]; units: Unit[]; initialId?: string | null; disabled: boolean;
}) {
  const [buildingId, setBuildingId] = useState(initialId ?? "");
  const [adding, setAdding] = useState(false);
  const [addedBuildings, setAddedBuildings] = useState<Building[]>([]);
  const options = [...buildings, ...addedBuildings.filter((added) => !buildings.some(({ id }) => id === added.id))];

  return <div>
    <label>Building <span className="optional">optional</span>
      <select name="building_id" value={buildingId} onChange={(event) => setBuildingId(event.target.value)}>
        <option value="">Choose a building</option>
        {groupBuildingsByCity(options).map(({ city, buildings }) => (
          <optgroup key={city} label={city || "City not set"}>
            {buildings.map((building) =>
              <option key={building.id} value={building.id}>{formatBuildingAddress(building)}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
    <button type="button" className="text-button" disabled={disabled} onClick={() => setAdding(true)}>
      <Plus size={16} aria-hidden /> Add building
    </button>
    {adding && createPortal(<AddBuildingDialog units={units} close={() => setAdding(false)} onSave={(building) => {
      setAddedBuildings((current) => [...current, building]);
      setBuildingId(building.id);
      setAdding(false);
    }} />, document.body)}
  </div>;
}
