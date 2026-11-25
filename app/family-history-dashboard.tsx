"use client";

import { useState, type ReactNode } from "react";
import { ChartNoAxesColumn, History } from "lucide-react";
import { type Unit } from "../lib/directory";
import {
  countMetrics, formatReportMonth, generationsLabel, monthNames, reportComparisonColor, reportMonthPattern, reportNumber, reportPeriod,
  reportSummary, reportUnits, scopeWards, submitterGroups, type FamilyHistoryReport, type ReportSummary,
} from "../lib/family-history";
import { MetricChart, SubmittersChart } from "./report-charts";
import { ReportEntry } from "./report-entry";
import { SubmitterHistoryEntry } from "./submitter-history-entry";
import { AddMenu } from "./add-menu";
import { familyHistoryReportTitle, UnitSectionHeading } from "./unit-section-heading";

const previousYearColor = "#bbb7b2";
const olderYearColor = "#dcdcdc";
const compareColors = ["#78529a", "#967bb0", "#b19ac6"];

function UnitOptions({ stakes, wards, unitNames }: { stakes: Unit[]; wards: Unit[]; unitNames: Map<string, string> }) {
  return <>
    {stakes.length > 0 && <optgroup label="Stakes">
      {stakes.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
    </optgroup>}
    {wards.length > 0 && <optgroup label="Wards and branches">
      {wards.map(({ id }) => <option key={id} value={id}>{unitNames.get(id)}</option>)}
    </optgroup>}
  </>;
}

export function FamilyHistoryDashboard({ units, reports, currentMonth, loadError, fixedUnit, comparisonUnits, viewControls, entryDialog, historyDialog, addHost }: {
  units: Unit[];
  reports: FamilyHistoryReport[];
  currentMonth: string;
  loadError: string | null;
  fixedUnit?: Unit;
  comparisonUnits?: Unit[];
  viewControls?: ReactNode;
  entryDialog?: { open: boolean; close: () => void };
  historyDialog?: { open: boolean; close: () => void };
  addHost?: HTMLElement | null;
}) {
  const [scopeId, setScope] = useState("");
  const [compareId, setCompare] = useState("");
  const [chosenMonth, setChosenMonth] = useState("");
  const [comparisonMonth, setComparisonMonth] = useState("");
  const [showPercentages, setShowPercentages] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [status, setStatus] = useState("");
  const sorted = [...units].sort((a, b) => a.name.localeCompare(b.name));
  const wards = reportUnits(sorted);
  const stakes = sorted.filter(({ kind }) => kind === "stake");
  const directory = new Map(sorted.map((unit) => [unit.id, unit]));
  const unitNames = new Map(wards.map(({ id, parent_id, name }) => {
    const stake = directory.get(parent_id ?? "");
    return [id, stake ? `${name} · ${stake.name}` : name];
  }));
  const scope = fixedUnit ?? directory.get(scopeId);
  const comparison = directory.get(compareId);
  const compareAll = Boolean(comparisonUnits?.length);
  const inScope = scopeWards(sorted, scope);
  const canEnterReport = !loadError && inScope.length > 0;
  const closeEntry = entryDialog?.close ?? (() => setEntryOpen(false));
  const closeHistory = historyDialog?.close ?? (() => setHistoryOpen(false));
  const compareWards = comparison ? scopeWards(sorted, comparison) : [];
  const isWard = scope?.level === "ward";
  const alternatives = fixedUnit ? [] : (scope?.kind === "stake" ? stakes : isWard ? wards : []).filter(({ id }) => id !== scopeId);
  const reportIndex = new Map(reports.map((report) => [`${report.unit_id}/${report.report_month.slice(0, 7)}`, report]));
  const scopeUnitIds = new Set([...inScope, ...compareWards].map(({ id }) => id));
  const childUnits = scope ? sorted.filter(({ parent_id }) => parent_id === scope.id) : stakes;
  const savedMonths = [...new Set(reports.filter(({ unit_id }) => scopeUnitIds.has(unit_id))
    .map(({ report_month }) => report_month.slice(0, 7)))].sort().reverse();
  const currentYear = currentMonth.slice(0, 4);
  const availableMonths = compareAll ? savedMonths.filter((period) => period.startsWith(`${currentYear}-`) && period <= currentMonth) : savedMonths;
  const requestedMonth = compareAll ? comparisonMonth : chosenMonth;
  const month = availableMonths.includes(requestedMonth) ? requestedMonth : availableMonths[0] ?? currentMonth;
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const trendMonthIndex = compareAll ? Number(currentMonth.slice(5, 7)) - 1 : monthIndex;
  const targets = [scope, ...(comparison ? [comparison] : [])];
  const emptySummary = reportSummary([], 0, false);
  const wardScopes = new Map([[scope?.id, inScope]]);
  if (comparison) wardScopes.set(comparison.id, compareWards);

  function readMonth(target: Unit | undefined, period: string) {
    const eligible = wardScopes.get(target?.id) ?? scopeWards(sorted, target);
    wardScopes.set(target?.id, eligible);
    const found = eligible.flatMap(({ id }) => reportIndex.get(`${id}/${period}`) ?? []);
    return { summary: reportSummary(found, eligible.length, target?.level === "ward"), filed: found.length, total: eligible.length };
  }

  const label = (target: Unit | undefined) => target ? unitNames.get(target.id) ?? target.name : "Regional overview";
  const reportsForMonth = readMonth(scope, month);
  const percentFiled = reportsForMonth.total ? reportsForMonth.filed / reportsForMonth.total * 100 : 0;
  const unitSeries = comparisonUnits?.map((target, index) => ({
    id: target.id, label: label(target), unitName: target.name, color: reportComparisonColor(index), target,
  }));
  const trend = compareAll && unitSeries ? unitSeries.map(({ target, ...series }) => ({
    ...series,
    year,
    metrics: monthNames.map((_, index) => index > trendMonthIndex
      ? emptySummary.submitters : readMonth(target, reportPeriod(year, index)).summary.submitters),
  })) : targets.flatMap((target, targetIndex) => [year, year - 1].map((displayYear, yearIndex) => ({
    label: comparison ? `${label(target)} · YTD ${displayYear}` : `YTD ${displayYear}`,
    unitName: target?.name ?? label(target),
    year: displayYear,
    color: targetIndex === 0 ? (yearIndex === 0 ? "#86b940" : previousYearColor) : compareColors[yearIndex],
    dashed: targetIndex > 0,
    previous: yearIndex === 1,
    metrics: monthNames.map((_, index) => yearIndex === 0 && index > monthIndex
      ? emptySummary.submitters : readMonth(target, reportPeriod(displayYear, index)).summary.submitters),
  })));
  const yearToDate = compareAll && unitSeries ? unitSeries.map(({ target, ...series }) => ({
    ...series, label: target.name, period: formatReportMonth(month), summary: readMonth(target, month).summary,
  })) : targets.flatMap((target, targetIndex) => [year - 2, year - 1, year].map((displayYear, yearIndex) => ({
    label: comparison ? `${label(target)} · YTD ${displayYear}` : `YTD ${displayYear}`,
    unitName: target?.name ?? label(target),
    period: formatReportMonth(reportPeriod(displayYear, monthIndex)),
    color: targetIndex === 0 ? [olderYearColor, previousYearColor, null][yearIndex] : compareColors[2 - yearIndex],
    summary: readMonth(target, reportPeriod(displayYear, monthIndex)).summary,
  })));
  const current = trend[0]?.metrics[monthIndex];
  const previous = trend[1]?.metrics[monthIndex];
  let trendCaption = compareAll ? `${currentYear} year-to-date counts by unit` : "Year-to-date counts by reporting month";
  if (!compareAll && !comparison && current && previous && current.value !== null && previous.value !== null && current.units === current.total && previous.units === previous.total) {
    const change = current.value - previous.value;
    trendCaption = change === 0 ? `Same number of submitters through ${monthNames[monthIndex]} as last year.`
      : `${reportNumber(Math.abs(change))} ${change > 0 ? "more" : "fewer"} ${Math.abs(change) === 1 ? "member" : "members"} submitted a name year to date (YTD) than last year at this date.`;
  }

  function series(currentColor: string, ...fields: (keyof ReportSummary)[]) {
    return yearToDate.map(({ color, summary, ...series }) => ({ ...series, color: color ?? currentColor, metrics: fields.map((key) => summary[key]) }));
  }

  function chooseMonth(period: string) {
    if (!reportMonthPattern.test(period)) return;
    if (compareAll) {
      if (period.startsWith(`${currentYear}-`) && period <= currentMonth) setComparisonMonth(period);
    } else setChosenMonth(period);
  }

  function summaryRow(target: Unit | undefined, emphasize = false) {
    const { summary } = readMonth(target, month);
    return <tr key={target?.id ?? "region"} className={emphasize ? "report-total" : undefined}>
      <th scope="row">
        {target && !fixedUnit && !comparison && !isWard ?
          <button className="text-button" onClick={() => { setScope(target.id); setCompare(""); }}>{target.name}</button> : label(target)}
      </th>
      {submitterGroups.map(({ key }) => {
        const metric = summary[`${key}_percent`];
        const display = showPercentages
          ? (metric.value === null ? "—" : `${metric.value.toFixed(1)}%`)
          : (metric.fraction?.join(" / ") ?? "—");
        return <td key={key}>
          {display}
          {metric.fraction && (!showPercentages || metric.value !== null) && metric.units < metric.total && <small>{metric.units} of {metric.total} units</small>}
        </td>;
      })}
    </tr>;
  }

  return (
    <section className={`family-report${addHost && canEnterReport ? " family-report-with-add-menu" : ""}`} aria-labelledby="report-heading">
      {fixedUnit ? <UnitSectionHeading id="report-heading" title={familyHistoryReportTitle} unit={fixedUnit} />
        : <div className="section-heading report-heading">
          <div>
            <h1 id="report-heading">{familyHistoryReportTitle}</h1>
            <p>{label(scope)} · {formatReportMonth(month)}</p>
          </div>
        </div>}
      <div className="report-filter-bar">
        {!loadError && <div className="report-coverage">
          <svg className="report-coverage-ring" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
            <circle className="report-coverage-track" cx="16" cy="16" r="13" />
            {percentFiled > 0 && <circle className="report-coverage-fill" cx="16" cy="16" r="13"
              pathLength="100" strokeDasharray={`${percentFiled} 100`} transform="rotate(-90 16 16)" />}
          </svg>
          <div>
            {reportsForMonth.filed} of {reportsForMonth.total} unit reports for {formatReportMonth(month)}
            {comparison && <small>{label(comparison)} · {readMonth(comparison, month).filed} of {compareWards.length} reports</small>}
          </div>
        </div>}
        <div className="report-filters">
          <label>Saved reports
            <select value={availableMonths.length ? month : ""} disabled={Boolean(loadError) || !availableMonths.length}
              onChange={(event) => chooseMonth(event.target.value)}>
              {!availableMonths.length && <option value="">{loadError ? "Saved reports unavailable" : "No saved reports"}</option>}
              {availableMonths.map((period) => <option key={period} value={period}>{formatReportMonth(period)}</option>)}
            </select>
          </label>
          {viewControls}
          {!fixedUnit && <label>Stake or ward/branch
            <select value={scopeId} onChange={(event) => { setScope(event.target.value); setCompare(""); }}>
              <option value="">Regional overview</option>
              <UnitOptions stakes={stakes} wards={wards} unitNames={unitNames} />
            </select>
          </label>}
          {alternatives.length > 0 && <label>Compare with
            <select value={compareId} onChange={(event) => setCompare(event.target.value)}>
              <option value="">None</option>
              <UnitOptions stakes={isWard ? [] : alternatives} wards={isWard ? alternatives : []} unitNames={unitNames} />
            </select>
          </label>}
        </div>
      </div>

      {status && <p className="notice" role="status">{status}</p>}
      {loadError ? <p className="notice error" role="alert">{loadError}</p> : <>
        {reportsForMonth.filed === 0 && <p className="notice">No unit reports for this view in {formatReportMonth(month)}.</p>}
        <div className={`panel report-sheet${comparison || compareAll ? " report-sheet-comparison" : ""}`}>
          <SubmittersChart series={trend} comparison={trendCaption} compareUnits={compareAll} />
          <div className="report-metrics">
            <MetricChart title={generationsLabel} series={series("#27c4f5", "first_four_generations")} percentage compareUnits={compareAll} />
            <MetricChart title={countMetrics[1].label} series={series("#fcb34c", "familysearch_logins")} compareUnits={compareAll} />
            <MetricChart title="Members Participating in Family History Activities" series={series("#9b6798", "added_ancestor", "added_memory", "indexed")} compareUnits={compareAll}
              categories={["Added Names\nto Tree", "Added Memory\nto Tree", "Indexed"]} />
          </div>
          <section className="report-detail">
            <h2>YTD Submitters Unit Detail</h2>
            <div className="report-detail-display" role="group" aria-label="Submitter detail display">
              <button className="button" type="button" aria-pressed={!showPercentages} onClick={() => setShowPercentages(false)}>Totals</button>
              <button className="button" type="button" aria-pressed={showPercentages} onClick={() => setShowPercentages(true)}>Percentages</button>
            </div>
            <div className="report-table-scroll">
              <table className="report-table">
                <thead><tr><th scope="col">Unit</th>
                  {submitterGroups.map(({ key, label }) => <th key={key} scope="col">{label}</th>)}
                </tr></thead>
                <tbody>
                  {!compareAll && summaryRow(scope, true)}
                  {compareAll ? comparisonUnits?.map((unit) => summaryRow(unit))
                    : comparison ? summaryRow(comparison, true) : !isWard && childUnits.map((unit) => summaryRow(unit))}
                </tbody>
              </table>
            </div>
            <p className="field-help">Percentages use saved submitter and eligible member counts. A dash means the selected value is unavailable. Partial totals show how many units contributed.</p>
          </section>
        </div>
      </>}
      {canEnterReport && (entryDialog?.open ?? entryOpen) && <ReportEntry fixedUnit={Boolean(fixedUnit && isWard)}
        wards={inScope} unitNames={unitNames} initialUnit={isWard ? scope.id : ""} initialMonth={month} reports={reportIndex}
        close={closeEntry} saved={(unit, period) => {
          closeEntry();
          chooseMonth(period);
          setStatus(`Saved ${formatReportMonth(period)} for ${directory.get(unit)?.name ?? "this unit"}.`);
        }} />}
      {addHost && canEnterReport && <AddMenu host={addHost} label="Add to family history reports" actions={[
        {
          label: isWard && reportIndex.has(`${scope.id}/${month}`) ? "Edit report" : "Enter report",
          Icon: ChartNoAxesColumn,
          run: () => { setStatus(""); setEntryOpen(true); },
        },
        { label: "Enter submitter history", Icon: History, run: () => { setStatus(""); setHistoryOpen(true); } },
      ]} />}
      {canEnterReport && (historyDialog?.open ?? historyOpen) && <SubmitterHistoryEntry fixedUnit={Boolean(isWard)} wards={inScope} unitNames={unitNames}
        initialUnit={isWard ? scope.id : inScope.length === 1 ? inScope[0].id : ""} initialMonth={month} reports={reportIndex}
        close={closeHistory} saved={(unit, period, changedMonths) => {
          closeHistory();
          chooseMonth(period);
          setStatus(`Saved ${changedMonths} ${changedMonths === 1 ? "month" : "months"} of submitter history for ${directory.get(unit)?.name ?? "this unit"}.`);
        }} />}
    </section>
  );
}
