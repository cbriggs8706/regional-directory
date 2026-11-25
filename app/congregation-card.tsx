import { unitNameWithType, type Building, type Language, type Unit } from "../lib/directory";
import { BuildingThumbnailCard } from "./building-thumbnail-card";
import { UnitLanguageBadges } from "./unit-facts";

export function CongregationCard({ unit, building, languagesById, leaderSubtitle, id, onNavigate }: {
  unit: Unit;
  building?: Building;
  languagesById: Map<string, Language>;
  leaderSubtitle?: string;
  id?: string;
  onNavigate?: () => void;
}) {
  return <BuildingThumbnailCard id={id} href={`/units/${unit.id}`} name={unitNameWithType(unit)} building={building}
    badges={<UnitLanguageBadges unit={unit} languagesById={languagesById} />} onNavigate={onNavigate}>
    {leaderSubtitle && <small>{leaderSubtitle}</small>}
  </BuildingThumbnailCard>;
}
