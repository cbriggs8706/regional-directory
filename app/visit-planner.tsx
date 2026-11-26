"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, GripVertical, Plus } from "lucide-react";
import { formatBuildingAddress, unitLabels, unitPath, type Directory, type Unit } from "../lib/directory";
import { AddressLink } from "./address-link";
import {
  formatVisitTime, offsetDate, shiftVisitPeriod, startOfWeek, timeToMinute, todayInVisitZone, visitPeriod,
  type VisitEvent, type VisitView,
} from "../lib/visits";
import { loadVisitEvents, saveVisit, scheduleVisit } from "./visit-actions";
import { VisitCalendar } from "./visit-calendar";
import { scheduledMessage, VisitEditor, type VisitEditorEntry } from "./visit-editor";
import { languageColor } from "../lib/language-colors";
import { UnitLanguageBadges } from "./unit-facts";
import { SectionSkeleton } from "./pending-content";

const weekLabel = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
const views = { rolling: "3 months", month: "Month", week: "Week" } as const;
type Notice = { text: string; error?: boolean };

export function VisitPlanner({ directory, userId }: { directory: Directory; userId: string }) {
  const [anchor, setAnchor] = useState(todayInVisitZone);
  const [view, setView] = useState<VisitView>("rolling");
  const [allDays, setAllDays] = useState(false);
  const [includeTeam, setIncludeTeam] = useState(false);
  const [unitFilter, setUnitFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [editor, setEditor] = useState<VisitEditorEntry | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<{ key: string; events: VisitEvent[]; error: string | null } | null>(null);
  const [draggedUnit, setDraggedUnit] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const { from, until, days } = visitPeriod(anchor, view, allDays);
  const queryKey = `${from}:${until}:${includeTeam}:${reload}`;
  const loaded = result?.key === queryKey;
  const events = loaded ? result.events : [];
  const units = new Map(directory.units.map((unit) => [unit.id, unit]));
  const buildings = new Map(directory.buildings.map((building) => [building.id, building]));
  const languagesById = new Map(directory.languages.map((language) => [language.id, language]));
  const sortedUnits = [...directory.units].sort((a, b) => unitPath(a, units).localeCompare(unitPath(b, units)));
  const availableUnits = sortedUnits.filter((unit) => {
    let within = !unitFilter;
    for (let parent: Unit | undefined = unit; parent && !within; parent = units.get(parent.parent_id ?? "")) {
      within = parent.id === unitFilter;
    }
    return within && (!languageFilter || unit.language_id === languageFilter || unit.sub_congregation_language_id === languageFilter);
  });

  useEffect(() => {
    let active = true;
    loadVisitEvents(from, until, includeTeam).then((response) => {
      if (active) setResult({ ...response, key: queryKey });
    }).catch(() => {
      if (active) setResult({ key: queryKey, events: [], error: "Could not load visits for this date range." });
    });
    return () => { active = false; };
  }, [from, until, includeTeam, queryKey]);

  function afterChange(day: string, text: string) {
    if (day < from || day >= until) setAnchor(day);
    if (day !== startOfWeek(day)) setAllDays(true);
    setReload((value) => value + 1);
    setNotice({ text });
  }

  async function dropUnit(id: string, day: string) {
    const unit = units.get(id);
    setDraggedUnit("");
    if (!unit || scheduling) return;
    if (!unit.sacrament_meeting_time && !unit.council_meeting_time) {
      setEditor({ unit, day });
      return;
    }
    setScheduling(true);
    setNotice(null);
    try {
      const response = await scheduleVisit(unit.id, day);
      if (response.error) setNotice({ text: response.error, error: true });
      else afterChange(day, scheduledMessage(response.added));
    } catch {
      setNotice({ text: "Could not schedule the unit’s meetings.", error: true });
    } finally {
      setScheduling(false);
    }
  }

  async function resize(event: VisitEvent, start: number, end: number) {
    try {
      const response = await saveVisit({
        id: event.id, unit_id: event.unit_id, kind: event.kind, event_date: event.event_date,
        start_minute: start, end_minute: end,
      });
      if (response.error) setNotice({ text: response.error, error: true });
      else {
        setResult((previous) => previous?.key === queryKey ? { ...previous,
          events: previous.events.map((entry) => entry.id === event.id ? { ...entry, start_minute: start, end_minute: end } : entry),
        } : previous);
        setNotice({ text: "Visit time updated." });
      }
    } catch {
      setNotice({ text: "Could not update the visit time.", error: true });
    }
  }

  function moveCalendar(next: string) {
    setAnchor(next);
    setNotice(null);
  }

  return <section aria-labelledby="visits-heading">
    <div className="section-heading visit-heading">
      <h1 id="visits-heading">My Calendar</h1>
      <label className="check"><input type="checkbox" checked={includeTeam}
        onChange={(event) => setIncludeTeam(event.target.checked)} />Show other users’ visits</label>
    </div>
    {notice && <p className={`notice visit-notice${notice.error ? " error" : ""}`} role={notice.error ? "alert" : "status"}>{notice.text}</p>}
    <div className="visit-layout">
      <aside className="panel visit-sidebar" aria-labelledby="visit-units">
        <div className="visit-sidebar-heading">
          <h2 id="visit-units">Units to visit</h2>
          <label>Unit<select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)}>
            <option value="">All units</option>
            {sortedUnits.map((unit) => <option key={unit.id} value={unit.id}>{unitPath(unit, units, "dropdown")}</option>)}
          </select></label>
          <label>Language<select value={languageFilter} data-language-color={languageColor(languagesById.get(languageFilter))}
            onChange={(event) => setLanguageFilter(event.target.value)}>
            <option value="">All languages</option>
            {[...directory.languages].sort((a, b) => a.name.localeCompare(b.name)).map((language) =>
              <option key={language.id} value={language.id} data-language-color={languageColor(language)}>{language.name}</option>)}
          </select></label>
          <p className="field-help">Drag a unit onto a day, or choose Schedule.</p>
        </div>
        <ul className="visit-unit-list">
          {availableUnits.map((unit) => {
            const building = buildings.get(unit.building_id ?? "");
            return <li key={unit.id} draggable={!scheduling} onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", unit.id);
              event.dataTransfer.effectAllowed = "copy";
              setDraggedUnit(unit.id);
            }} onDragEnd={() => setDraggedUnit("")}>
              <div className="visit-unit-name"><GripVertical size={15} aria-hidden /><strong>{unit.name}</strong></div>
              <small>{unitLabels[unit.kind]}</small>
              <span className="chips"><UnitLanguageBadges unit={unit} languagesById={languagesById} /></span>
              {unit.sacrament_meeting_time && <small>Sacrament {formatVisitTime(timeToMinute(unit.sacrament_meeting_time))}</small>}
              {unit.council_meeting_time && <small>Council {formatVisitTime(timeToMinute(unit.council_meeting_time))}</small>}
              {building && <small><AddressLink address={formatBuildingAddress(building)} /></small>}
              <div className="toolbar">
                <button className="text-button" disabled={scheduling} onClick={() => {
                  setEditor({ unit, day: days.find((day) => day >= anchor) ?? days[0] ?? anchor });
                }}><Plus size={15} aria-hidden />Schedule</button>
              </div>
            </li>;
          })}
        </ul>
        {availableUnits.length === 0 && <p className="visit-sidebar-heading muted">No units match your filters.</p>}
      </aside>
      <div className="panel visit-calendar-panel">
        <div className="visit-calendar-toolbar">
          <h2>{weekLabel.formatRange(new Date(from), new Date(offsetDate(until, -1)))}</h2>
          <div className="toolbar">
            <button className="icon-button" aria-label="Previous period" onClick={() => moveCalendar(shiftVisitPeriod(anchor, view, -1))}><ChevronLeft size={19} /></button>
            <button className="button" onClick={() => moveCalendar(todayInVisitZone())}>Today</button>
            <button className="icon-button" aria-label="Next period" onClick={() => moveCalendar(shiftVisitPeriod(anchor, view, 1))}><ChevronRight size={19} /></button>
            <label className="visit-date-jump"><span className="visually-hidden">Jump to date</span>
              <input type="date" value={anchor} onChange={(event) => { if (event.target.value) moveCalendar(event.target.value); }} />
            </label>
          </div>
        </div>
        <div className="visit-view-controls">
          <div className="visit-view-switch" role="group" aria-label="Calendar view">
            {Object.entries(views).map(([mode, label]) => <button className={`button${view === mode ? " primary" : ""}`}
              key={mode} aria-pressed={view === mode} onClick={() => setView(mode as VisitView)}>{label}</button>)}
          </div>
          <label className="check"><input type="checkbox" checked={allDays}
            onChange={(event) => setAllDays(event.target.checked)} />All days</label>
        </div>
        <p className="visit-calendar-caption field-help">Mountain Time{loaded && " · Click a time to add a driving block."}</p>
        {loaded && result.error && <p className="notice error" role="alert">{result.error} <button className="text-button" onClick={() => setReload((value) => value + 1)}>Retry</button></p>}
        {loaded ? <VisitCalendar days={days} events={events} units={units} userId={userId} draggedUnit={draggedUnit}
          addDrive={(day, minute) => setEditor({ day, minute })}
          dropUnit={dropUnit} resize={resize} openEvent={(event) => {
            const unit = units.get(event.unit_id ?? "");
            if (unit || event.kind === "drive") setEditor({ unit, day: event.event_date, event });
          }} /> : <SectionSkeleton label="visits" chart />}
      </div>
    </div>
    {editor && <VisitEditor entry={editor} editable={!editor.event || editor.event.owner_id === userId}
      building={buildings.get(editor.unit?.building_id ?? "")} parentUnit={units.get(editor.unit?.parent_id ?? "")}
      close={() => setEditor(null)}
      done={(day, message) => { setEditor(null); afterChange(day, message); }} />}
  </section>;
}
