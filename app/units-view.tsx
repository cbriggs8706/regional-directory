"use client";

import { useEffect, useRef, useState } from "react";
import { RouteLink } from "./route-navigation";
import { Building2, ChevronDown, ChevronRight, ChevronsDown, ChevronsUp, Search, X } from "lucide-react";
import { hasSacramentMeeting, unitNameWithType, type Building, type Directory, type Language, type Unit } from "../lib/directory";
import { organizationLeaderSubtitles, type DirectoryOrganization, type OrganizationDirectory } from "../lib/organizations";
import { unitLeaderSubtitles } from "../lib/standard-callings";
import { UnitLanguageBadges } from "./unit-facts";
import { BuildingThumbnailCard } from "./building-thumbnail-card";
import { CongregationCard } from "./congregation-card";

const nonEnglishOnlyStorageKey = "regional-directory:units:non-english-only";
const browserStateKey = "regionalDirectoryUnits";

type BrowseState = {
  regionId: string;
  expandedUnits: [string, boolean][];
  search: string;
  unitId: string;
};

type UnitTreeProps = {
  childrenByParent: Map<string, Unit[]>;
  organizationsByAgent: Map<string, DirectoryOrganization[]>;
  organizationLeaderSubtitles: Map<string, string>;
  buildingsById: Map<string, Building>;
  languagesById: Map<string, Language>;
  leaderSubtitles: Map<string, string>;
  congregationCounts: Map<string, number>;
  isExpanded: (unitId: string) => boolean;
  toggleExpanded: (unitId: string) => void;
  rememberNavigation: (unitId: string) => void;
};

function browseLinkId(unitId: string) {
  return `unit-browse-${unitId}`;
}

function OrganizationNode({ organization, tree, agent }: {
  organization: DirectoryOrganization;
  tree: UnitTreeProps;
  agent?: Unit;
}) {
  const leader = tree.organizationLeaderSubtitles.get(organization.id);
  return <li>
    <BuildingThumbnailCard id={browseLinkId(organization.id)} href={`/organizations/${organization.id}`}
      name={organization.name} building={tree.buildingsById.get(organization.building_id ?? "")}
      className="unit-organization-card" onNavigate={() => tree.rememberNavigation(organization.id)}>
      {leader && <small>{leader}</small>}
      <small>{organization.type}</small>
      {agent && <small>{unitNameWithType(agent)}</small>}
    </BuildingThumbnailCard>
  </li>;
}

function UnitNode({ unit, ...tree }: UnitTreeProps & { unit: Unit }) {
  const name = unitNameWithType(unit);
  const leaderSubtitle = tree.leaderSubtitles.get(unit.id);
  const openDetails = () => tree.rememberNavigation(unit.id);
  if (hasSacramentMeeting(unit.kind)) {
    return <li>
      <CongregationCard unit={unit} building={tree.buildingsById.get(unit.building_id ?? "")}
        languagesById={tree.languagesById} leaderSubtitle={leaderSubtitle} id={browseLinkId(unit.id)} onNavigate={openDetails} />
    </li>;
  }

  const children = tree.childrenByParent.get(unit.id) ?? [];
  const organizations = tree.organizationsByAgent.get(unit.id) ?? [];
  const hasChildren = children.length > 0 || organizations.length > 0;
  const expanded = hasChildren && tree.isExpanded(unit.id);
  const childListId = `unit-children-${unit.id}`;
  const isStake = unit.kind === "stake";
  const viewLabel = isStake ? "View stake" : "View council";
  const subunitCount = tree.congregationCounts.get(unit.id) ?? 0;
  const childLabels = [
    children.length ? `${children.length} ${children.length === 1 ? "stake" : "stakes"}` : "",
    organizations.length ? `${organizations.length} ${organizations.length === 1 ? "organization" : "organizations"}` : "",
  ].filter(Boolean).join(" and ");
  const toggleLabel = children.length && organizations.length ? "Hide stakes and organizations"
    : organizations.length ? "Hide organizations" : "Hide stakes";

  return (
    <li className={`unit-node unit-node-${unit.kind}`}>
      <div className="unit-node-row">
        <button type="button" className="unit-card unit-toggle" aria-expanded={expanded} disabled={!hasChildren}
          aria-controls={childListId} onClick={() => tree.toggleExpanded(unit.id)}>
          <ChevronDown size={19} aria-hidden />
          {isStake && <span className="chip unit-count-badge">{subunitCount}
            <span className="visually-hidden"> {subunitCount === 1 ? "subunit" : "subunits"}</span>
          </span>}
          <span className="unit-node-title">
            <span className="unit-name-and-languages">
              <strong>{name}</strong>
              <UnitLanguageBadges unit={unit} languagesById={tree.languagesById} />
            </span>
            {isStake ? leaderSubtitle && <small>{leaderSubtitle}</small>
              : <small>{expanded ? toggleLabel : hasChildren ? `Show ${childLabels}` : "No stakes yet"}</small>}
          </span>
        </button>
        <RouteLink id={browseLinkId(unit.id)} href={`/units/${unit.id}`} className="unit-open-details"
          onNavigate={openDetails} aria-label={`${viewLabel}: ${name}`}>
          {viewLabel}
        </RouteLink>
      </div>
      <div id={childListId} hidden={!expanded}>
        {expanded && <ul className={`unit-children${isStake ? " child-unit-grid congregation-grid" : ""}`}>
          {children.map((child) => <UnitNode key={child.id} unit={child} {...tree} />)}
          {organizations.map((organization) => <OrganizationNode key={organization.id} organization={organization} tree={tree} />)}
        </ul>}
      </div>
    </li>
  );
}

export function UnitsView({ directory, browseUnitId, organizationDirectory }: {
  directory: Directory;
  organizationDirectory: OrganizationDirectory;
  browseUnitId: string;
}) {
  const { units, buildings, languages } = directory;
  const { organizations } = organizationDirectory;
  const [regionId, setRegionId] = useState("");
  const [nonEnglishOnly, setNonEnglishOnly] = useState(false);
  const [expandedUnits, setExpandedUnits] = useState(() => new Map<string, boolean>());
  const [search, setSearch] = useState("");
  const [restoreUnitId, setRestoreUnitId] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const regions: Unit[] = [];
  const childrenByParent = new Map<string, Unit[]>();
  const organizationsByAgent = new Map<string, DirectoryOrganization[]>();
  const congregationCounts = new Map<string, number>();
  const leaderSubtitles = unitLeaderSubtitles(directory);
  const languagesById = new Map(languages.map((language) => [language.id, language]));
  const buildingsById = new Map(buildings.map((building) => [building.id, building]));
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const sortedUnits = [...units].sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    const saved: BrowseState | undefined = window.history.state?.[browserStateKey];
    if (saved) {
      setRegionId(saved.regionId);
      setExpandedUnits(new Map(saved.expandedUnits));
      setSearch(saved.search);
    }
    setRestoreUnitId(saved?.unitId ?? browseUnitId);
  }, [browseUnitId]);

  useEffect(() => {
    if (!restoreUnitId) return;
    const frame = requestAnimationFrame(() => {
      const link = document.getElementById(browseLinkId(restoreUnitId));
      link?.focus({ preventScroll: true });
      link?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [restoreUnitId]);

  useEffect(() => {
    try {
      setNonEnglishOnly(window.localStorage.getItem(nonEnglishOnlyStorageKey) === "true");
    } catch {
      // The filter still works when browser storage is unavailable.
    }
  }, []);

  function updateNonEnglishOnly(checked: boolean) {
    setNonEnglishOnly(checked);
    setExpandedUnits(new Map());
    try {
      window.localStorage.setItem(nonEnglishOnlyStorageKey, String(checked));
    } catch {
      // Keep the selection for the current view.
    }
  }

  function isNonEnglish(languageId: string | null) {
    const name = languageId ? languagesById.get(languageId)?.name.trim().toLowerCase() : undefined;
    return Boolean(name && name !== "english");
  }

  const matchingPaths = new Set<string>();
  if (nonEnglishOnly) {
    for (const unit of units) {
      if (!hasSacramentMeeting(unit.kind)) continue;
      if (!isNonEnglish(unit.language_id)
        && !(unit.has_sub_congregation && isNonEnglish(unit.sub_congregation_language_id))) continue;

      let ancestor: Unit | undefined = unit;
      while (ancestor && !matchingPaths.has(ancestor.id)) {
        matchingPaths.add(ancestor.id);
        ancestor = ancestor.parent_id ? unitsById.get(ancestor.parent_id) : undefined;
      }
    }
  }

  for (const unit of sortedUnits) {
    if (unit.parent_id && hasSacramentMeeting(unit.kind)) {
      congregationCounts.set(unit.parent_id, (congregationCounts.get(unit.parent_id) ?? 0) + 1);
    }
    if (unit.kind === "region") {
      regions.push(unit);
    } else if (unit.parent_id && (!nonEnglishOnly || matchingPaths.has(unit.id))) {
      const siblings = childrenByParent.get(unit.parent_id) ?? [];
      siblings.push(unit);
      childrenByParent.set(unit.parent_id, siblings);
    }
  }

  if (!nonEnglishOnly) {
    for (const organization of [...organizations].sort((a, b) => a.name.localeCompare(b.name))) {
      const siblings = organizationsByAgent.get(organization.agent_id) ?? [];
      siblings.push(organization);
      organizationsByAgent.set(organization.agent_id, siblings);
    }
  }

  const browsePath = new Set<string>();
  let ancestor = unitsById.get(browseUnitId);
  let browseRegionId = "";
  while (ancestor && !browsePath.has(ancestor.id)) {
    browsePath.add(ancestor.id);
    if (ancestor.kind === "region") browseRegionId = ancestor.id;
    ancestor = unitsById.get(ancestor.parent_id ?? "");
  }

  const region = regions.find((entry) => entry.id === (regionId || browseRegionId)) ?? regions[0];
  const councils = region ? childrenByParent.get(region.id) ?? [] : [];
  const regionOrganizations = region ? organizationsByAgent.get(region.id) ?? [] : [];
  const expandedByDefault = (unitId: string) => nonEnglishOnly || browsePath.has(unitId);
  const tree: UnitTreeProps = {
    childrenByParent, organizationsByAgent, buildingsById, languagesById, leaderSubtitles, congregationCounts,
    organizationLeaderSubtitles: organizationLeaderSubtitles(organizationDirectory, directory.contacts),
    isExpanded: (unitId) => expandedUnits.get(unitId) ?? expandedByDefault(unitId),
    toggleExpanded: (unitId) => setExpandedUnits((current) =>
      new Map(current).set(unitId, !(current.get(unitId) ?? expandedByDefault(unitId)))),
    rememberNavigation: (unitId) => {
      const state: BrowseState = { regionId, expandedUnits: [...expandedUnits], search, unitId };
      window.history.replaceState({ ...window.history.state, [browserStateKey]: state }, "");
    },
  };

  const expandableUnits = councils.flatMap((council) => [council, ...(childrenByParent.get(council.id) ?? [])])
    .filter((unit) => childrenByParent.has(unit.id) || organizationsByAgent.has(unit.id));
  const allExpanded = expandableUnits.every(({ id }) => tree.isExpanded(id));

  function toggleAll() {
    setExpandedUnits((current) => {
      const next = new Map(current);
      for (const { id } of expandableUnits) next.set(id, !allExpanded);
      return next;
    });
  }

  const query = search.trim().toLocaleLowerCase();
  const searchResults: (Unit | DirectoryOrganization)[] = [];
  function searchOrganizations(organizations: DirectoryOrganization[]) {
    searchResults.push(...organizations.filter(({ name, type }) => `${name} ${type}`.toLocaleLowerCase().includes(query)));
  }
  if (query) {
    searchOrganizations(regionOrganizations);
    const remaining = [...councils];
    const visited = new Set<string>();
    while (remaining.length) {
      const unit = remaining.pop()!;
      if (visited.has(unit.id)) continue;
      visited.add(unit.id);
      if (unitNameWithType(unit).toLocaleLowerCase().includes(query)) searchResults.push(unit);
      searchOrganizations(organizationsByAgent.get(unit.id) ?? []);
      remaining.push(...(childrenByParent.get(unit.id) ?? []));
    }
    searchResults.sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <section aria-labelledby="units-heading">
      <div className="section-heading">
        <div><h1 id="units-heading">Units</h1><p>Browse coordinating councils, stakes, wards, branches, and organizations.</p></div>
      </div>
      {region && <div className="unit-filters">
        <div className="unit-search">
          <Search size={18} aria-hidden />
          <input ref={searchInput} type="search" aria-label="Find a unit or organization" placeholder="Find a unit or organization" value={search}
            onChange={(event) => setSearch(event.target.value)} />
          {search && <button type="button" className="icon-button" aria-label="Clear unit search" onClick={() => {
            setSearch("");
            searchInput.current?.focus();
          }}>
            <X size={17} aria-hidden />
          </button>}
        </div>
        <label className="button">
          <input type="checkbox" checked={nonEnglishOnly} onChange={(event) => updateNonEnglishOnly(event.target.checked)} />
          Non-English
        </label>
        {!query && expandableUnits.length > 0 && <button type="button" className="button" aria-controls="unit-councils" onClick={toggleAll}>
          {allExpanded ? <ChevronsUp size={17} aria-hidden /> : <ChevronsDown size={17} aria-hidden />}
          {allExpanded ? "Collapse all" : "Expand all"}
        </button>}
      </div>}
      {region && <div className="unit-region">
        {regions.length > 1 && <label>Browse region
          <select value={region.id} onChange={(event) => setRegionId(event.target.value)}>
            {regions.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </label>}
        <div className="unit-node-row">
          <span className="unit-region-title unit-node-title unit-name-and-languages">
            <strong>{unitNameWithType(region)}</strong>
            <UnitLanguageBadges unit={region} languagesById={languagesById} />
          </span>
          <RouteLink id={browseLinkId(region.id)} href={`/units/${region.id}`} className="unit-open-details"
            onNavigate={() => tree.rememberNavigation(region.id)} aria-label={`View region: ${unitNameWithType(region)}`}>
            View region
          </RouteLink>
        </div>
      </div>}
      {region && query ? <div className="unit-search-results">
        <p className="muted" role="status">{searchResults.length === 0 ? "No matches" : `${searchResults.length} ${searchResults.length === 1 ? "match" : "matches"}`}</p>
        {searchResults.length > 0 && <ul aria-label="Unit and organization search results">
          {searchResults.map((unit) => {
            if (!("kind" in unit)) return <OrganizationNode key={unit.id} organization={unit}
              agent={unitsById.get(unit.agent_id)} tree={tree} />;
            const parent = unitsById.get(unit.parent_id ?? "");
            const leaderSubtitle = leaderSubtitles.get(unit.id);
            return <li key={unit.id}>
              <RouteLink id={browseLinkId(unit.id)} href={`/units/${unit.id}`} className="unit-card unit-search-result"
                onNavigate={() => tree.rememberNavigation(unit.id)}>
                <span className="unit-node-title">
                  <span className="unit-name-and-languages">
                    <strong>{unitNameWithType(unit)}</strong>
                    <UnitLanguageBadges unit={unit} languagesById={languagesById} />
                  </span>
                  {leaderSubtitle && <small>{leaderSubtitle}</small>}
                  {parent && <small>{unitNameWithType(parent)}</small>}
                </span>
                <ChevronRight size={18} aria-hidden />
              </RouteLink>
            </li>;
          })}
        </ul>}
      </div> : region && (councils.length > 0 || regionOrganizations.length > 0) ? <ul id="unit-councils" className="unit-councils" aria-label={`${region.name} children`}>
        {councils.map((unit) => <UnitNode key={unit.id} unit={unit} {...tree} />)}
        {regionOrganizations.map((organization) => <OrganizationNode key={organization.id} organization={organization} tree={tree} />)}
      </ul> : <div className="panel empty">
        <span><Building2 size={25} aria-hidden /></span>
        <h2>{region ? (nonEnglishOnly ? "No non-English units in this region" : "No coordinating councils yet") : "No region yet"}</h2>
      </div>}
    </section>
  );
}
