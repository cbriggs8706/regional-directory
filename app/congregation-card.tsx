import Image from "next/image";
import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import { buildingPhotoUrl, unitNameWithType, type Building, type Language, type Unit } from "../lib/directory";
import { UnitLanguageBadges } from "./unit-facts";

export function CongregationCard({ unit, building, languagesById, leaderSubtitle, id, onNavigate }: {
  unit: Unit;
  building?: Building;
  languagesById: Map<string, Language>;
  leaderSubtitle?: string;
  id?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link id={id} href={`/units/${unit.id}`} prefetch={false} onNavigate={onNavigate} className="panel child-unit-card">
      <span className="stake-unit-photo">
        {building?.photo_path
          ? <Image src={buildingPhotoUrl(building)} alt="" fill unoptimized />
          : <Building2 size={36} aria-hidden />}
        <span className="chips stake-unit-photo-badges"><UnitLanguageBadges unit={unit} languagesById={languagesById} /></span>
      </span>
      <span className="child-unit-caption">
        <span className="unit-node-title">
          <strong>{unitNameWithType(unit)}</strong>
          {leaderSubtitle && <small>{leaderSubtitle}</small>}
        </span>
        <ChevronRight size={19} aria-hidden />
      </span>
    </Link>
  );
}
