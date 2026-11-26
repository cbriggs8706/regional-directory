"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  AtSign, Cloud, Facebook, Ghost, Globe, Instagram, Linkedin, Link2, Maximize2, MessageCircle,
  Music2, Pencil, Twitch, X, Youtube, type LucideIcon,
} from "lucide-react";
import { buildingPhotoUrl, formatBuildingAddress, type Building } from "../lib/directory";
import { socialChannels, type SocialChannel, type SocialLink } from "../lib/social-links";
import { AddressLink } from "./address-link";
import { Modal } from "./editor";

const socialIcons = {
  facebook: Facebook, instagram: Instagram, youtube: Youtube, tiktok: Music2, x: X, threads: AtSign,
  linkedin: Linkedin, whatsapp: MessageCircle, bluesky: Cloud, snapchat: Ghost, twitch: Twitch, other: Link2,
} satisfies Record<SocialChannel, LucideIcon>;

export function BuildingPageHeader({ name, recordLabel, building, website, socialLinks = [], facts, children, edit }: {
  name: string;
  recordLabel: "Unit" | "Organization";
  building?: Building;
  website: string | null;
  socialLinks?: SocialLink[];
  facts: ReactNode;
  children?: ReactNode;
  edit: () => void;
}) {
  const [showPhoto, setShowPhoto] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const cover = useRef<HTMLButtonElement>(null);
  const photo = building?.photo_path ? buildingPhotoUrl(building) : null;
  const address = building ? formatBuildingAddress(building) : null;
  const channelTotals = new Map<SocialChannel, number>();
  const channelIndexes = new Map<SocialChannel, number>();
  for (const { channel } of socialLinks) {
    channelTotals.set(channel, (channelTotals.get(channel) ?? 0) + 1);
  }

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);

  return <>
    <header className="panel unit-overview">
      {photo && <div className="unit-building-hero">
        <button ref={cover} type="button" className="unit-building-cover" aria-label="Enlarge building photo"
          aria-haspopup="dialog" onClick={() => setShowPhoto(true)}>
          <Image src={photo} fill alt="" unoptimized />
          <span className="unit-building-cover-expand"><Maximize2 size={16} aria-hidden /></span>
        </button>
        <div className="unit-building-tags">{facts}</div>
      </div>}
      <div className={socialLinks.length > 1 ? "unit-heading-row unit-heading-row-wrap" : "unit-heading-row"}>
        <h1 ref={heading} tabIndex={-1}>{name}</h1>
        <div className="unit-heading-actions">
          <button type="button" className="icon-button" aria-label={`Edit ${name}`} title={`Edit ${recordLabel.toLowerCase()}`}
            onClick={edit}><Pencil size={18} aria-hidden /></button>
          {website && <a className="icon-button" href={website} target="_blank" rel="noopener noreferrer"
            aria-label={`${recordLabel} website`} title={`${recordLabel} website`}><Globe size={19} aria-hidden /></a>}
          {socialLinks.map(({ channel, url }, index) => {
            const channelIndex = (channelIndexes.get(channel) ?? 0) + 1;
            channelIndexes.set(channel, channelIndex);
            const numbered = (channelTotals.get(channel) ?? 0) > 1;
            const label = `${recordLabel} ${socialChannels[channel]} link${numbered ? ` ${channelIndex}` : ""}`;
            const Icon = socialIcons[channel];
            return <a key={`${index}-${url}`} className="icon-button social-media-link" href={url} target="_blank"
              rel="noopener noreferrer" aria-label={label} title={label}>
              <Icon size={19} aria-hidden />
              {numbered && <sup aria-hidden>{channelIndex}</sup>}
            </a>;
          })}
        </div>
      </div>
      {address && <p className="unit-heading-address"><AddressLink address={address} /></p>}
      {!photo && facts}
      {children}
    </header>
    {showPhoto && photo && <Modal title="Building photo" className="unit-building-modal" close={() => {
      setShowPhoto(false);
      requestAnimationFrame(() => cover.current?.focus());
    }}>
      <div className="unit-building-modal-photo">
        <Image src={photo} fill alt={address ? `Building at ${address}` : `Building for ${name}`} unoptimized />
      </div>
      {address && <p className="unit-building-modal-address"><AddressLink address={address} /></p>}
    </Modal>}
  </>;
}
