"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

export function usePageSection<Section extends string>(path: string, sections: readonly Section[], defaultSection: Section) {
  const params = useSearchParams();
  const requestedSection = params.get("section");
  const section = sections.find((id) => id === requestedSection) ?? defaultSection;

  function sectionHref(next: Section) {
    const query = new URLSearchParams(params.toString());
    if (next === defaultSection) query.delete("section");
    else query.set("section", next);
    const search = query.toString();
    return search ? `${path}?${search}` : path;
  }

  function showSection(next: Section) {
    if (next !== section || window.location.hash) window.history.replaceState(null, "", sectionHref(next));
  }

  return { section, sectionHref, showSection };
}

export function PageSectionTabs<Section extends string>({ label, sections, labels, section, sectionHref, showSection }: {
  label: string;
  sections: readonly Section[];
  labels: Record<Section, string>;
  section: Section;
  sectionHref: (next: Section) => string;
  showSection: (next: Section) => void;
}) {
  const sectionNav = useRef<HTMLElement>(null);
  const currentSectionLink = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const nav = sectionNav.current;
    const current = currentSectionLink.current;
    if (!nav || !current) return;
    const start = current.offsetLeft;
    const end = start + current.offsetWidth;
    if (start < nav.scrollLeft) nav.scrollLeft = start;
    else if (end > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = end - nav.clientWidth;
  }, [section]);

  return <nav ref={sectionNav} className="unit-page-switch" aria-label={label}>
    {sections.map((id) => <Link key={id} ref={section === id ? currentSectionLink : undefined} href={sectionHref(id)} prefetch={false}
      aria-current={section === id ? "page" : undefined} onNavigate={(event) => {
        event.preventDefault();
        showSection(id);
      }}>{labels[id]}</Link>)}
  </nav>;
}
