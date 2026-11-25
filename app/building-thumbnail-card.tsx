import Image from "next/image";
import { RouteLink } from "./route-navigation";
import { Building2, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { buildingPhotoUrl, type Building } from "../lib/directory";

export function BuildingThumbnailCard({ href, name, building, badges, children, id, onNavigate, className }: {
  href: string;
  name: string;
  building?: Building;
  badges?: ReactNode;
  children?: ReactNode;
  id?: string;
  onNavigate?: () => void;
  className?: string;
}) {
  return <RouteLink id={id} href={href} onNavigate={onNavigate}
    className={`panel child-unit-card${className ? ` ${className}` : ""}`}>
    <span className="stake-unit-photo">
      {building?.photo_path
        ? <Image src={buildingPhotoUrl(building)} alt="" fill unoptimized />
        : <Building2 size={36} aria-hidden />}
      {badges && <span className="chips stake-unit-photo-badges">{badges}</span>}
    </span>
    <span className="child-unit-caption">
      <span className="unit-node-title"><strong>{name}</strong>{children}</span>
      <ChevronRight size={19} aria-hidden />
    </span>
  </RouteLink>;
}
