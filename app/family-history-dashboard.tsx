"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { type Unit } from "../lib/directory";
import {
  countMetrics, formatReportMonth, generationsLabel, monthNames, reportMonthPattern, reportNumber,
  reportSummary, reportUnits, scopeWards, submitterGroups, type FamilyHistoryReport, type ReportSummary,
} from "../lib/family-history";
import { MetricChart, metricText, SubmittersChart } from "./report-charts";
import { ReportEntry } from "./report-entry";

const yearColors = ["#12674f", "#78877f", "#a1aea8"];
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

export function FamilyHistoryDashboard({ units, reports, currentMonth, loadError, fixedUnit, title = "Family History Activity Report" }: {
  units: Unit[];
  reports: FamilyHistoryReport[];
  currentMonth: string;
  loadError: string | null;
  fixedUnit?: Unit;
  title?: string;
}) {
  const [scopeId, setScope] = useState("");
  const [compareId, setCompare] = useState("");
  const [chosenMonth, setChosenMonth] = useState("");
  const [entry, setEntry] = useState<{ unit: string; month: string } | null>(null);
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
  const inScope = scopeWards(wards, scope);
  const isWard = scope?.level === "ward";
  const alternatives = fixedUnit ? [] : (scope?.kind === "stake" ? stakes : isWard ? wards : []).filter(({ id }) => id !== scopeId);
  const reportIndex = new Map(reports.map((report) => [`${report.unit_id}/${report.report_month.slice(0, 7)}`, report]));
  const latest = reports.reduce((latest, { report_month }) => {
    const month = report_month.slice(0, 7);
    return month > latest ? month : latest;
  }, "");
  const month = chosenMonth || latest || currentMonth;
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const targets = [scope, ...(comparison ? [comparison] : [])];
  const emptySummary = reportSummary([], 0, false);

  function readMonth(target: Unit | undefined, period: string) {
    const eligible = scopeWards(wards, target);
    const found = eligible.flatMap(({ id }) => reportIndex.get(`${id}/${period}`) ?? []);
    return { summary: reportSummary(found, eligible.length, target?.level === "ward"), filed: found.length, total: eligible.length };
  }

  const periodFor = (year: number, index: number) => `${year}-${String(index + 1).padStart(2, "0")}`;
  const label = (target: Unit | undefined) => target ? unitNames.get(target.id) ?? target.name : "Regional overview";
  const reportsForMonth = readMonth(scope, month);
  const trend = targets.flatMap((target, targetIndex) => [year, year - 1].map((displayYear, yearIndex) => ({
    label: comparison ? `${label(target)} · ${displayYear}` : `YTD ${displayYear}`,
    color: (targetIndex === 0 ? yearColors : compareColors)[yearIndex],
    dashed: yearIndex === 1,
    metrics: monthNames.map((_, index) => yearIndex === 0 && index > monthIndex
      ? emptySummary.submitters : readMonth(target, periodFor(displayYear, index)).summary.submitters),
  })));
  const yearToDate = targets.flatMap((target, targetIndex) => [year, year - 1, year - 2].map((displayYear, yearIndex) => ({
    label: comparison ? `${label(target)} · ${displayYear}` : `${monthNames[monthIndex].slice(0, 3)} ${displayYear}`,
    color: (targetIndex === 0 ? yearColors : compareColors)[yearIndex],
    summary: readMonth(target, periodFor(displayYear, monthIndex)).summary,
  })));
  const current = trend[0].metrics[monthIndex];
  const previous = trend[1].metrics[monthIndex];
  let trendCaption = "Year-to-date counts by reporting month";
  if (!comparison && current.value !== null && previous.value !== null && current.units === current.total && previous.units === previous.total) {
    const change = current.value - previous.value;
    trendCaption = change === 0 ? `Same number of submitters through ${monthNames[monthIndex]} as last year.`
      : `${reportNumber(Math.abs(change))} ${change > 0 ? "more" : "fewer"} ${Math.abs(change) === 1 ? "member" : "members"} submitted through ${monthNames[monthIndex]} than last year.`;
  }

  function series(...fields: (keyof ReportSummary)[]) {
    return yearToDate.map(({ label, color, summary }) => ({ label, color, metrics: fields.map((key) => summary[key]) }));
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
        return <td key={key}>
          {metricText(metric, true)}{metric.value !== null && metric.estimated && <sup aria-label="Estimated">~</sup>}
          {metric.fraction && <small>{metric.fraction.map((value) => reportNumber(value)).join(" / ")}</small>}
          {metric.value !== null && metric.units < metric.total && <small>{metric.units} of {metric.total} units</small>}
        </td>;
      })}
    </tr>;
  }

  return (
    <section className="family-report" aria-labelledby="report-heading">
      <div className="section-heading report-heading">
        <div>
          {fixedUnit
            ? <h2 id="report-heading" className="unit-section-heading">{title}</h2>
            : <h1 id="report-heading">{title}</h1>}
          <p>{label(scope)} · {formatReportMonth(month)}</p>
        </div>
        <button className="button primary" disabled={Boolean(loadError) || !inScope.length}
          onClick={() => { setStatus(""); setEntry({ unit: isWard ? scope.id : "", month }); }}>
          <Plus size={17} aria-hidden />
          {isWard && reportIndex.has(`${scope.id}/${month}`) ? "Edit report" : "Enter report"}
        </button>
      </div>
      <div className="report-filter-bar">
        <div className="report-coverage">
          {reportsForMonth.filed} of {reportsForMonth.total} unit reports for {formatReportMonth(month)}
          {comparison && <small>{label(comparison)} · {readMonth(comparison, month).filed} of {scopeWards(wards, comparison).length} reports</small>}
        </div>
        <div className="report-filters">
          <label>Reporting month
            <input type="month" aria-label="Reporting month" min="1900-01" max="9999-12" value={month}
              onChange={(event) => { if (reportMonthPattern.test(event.target.value)) setChosenMonth(event.target.value); }} />
          </label>
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
        <SubmittersChart series={trend} comparison={trendCaption} />
        <div className="report-metrics">
          <MetricChart title={generationsLabel} series={series("first_four_generations")} categories={[""]} percentage />
          <MetricChart title={countMetrics[1].label} series={series("familysearch_logins")} categories={[""]} />
          <MetricChart title="Members participating in family history activities" series={series("added_ancestor", "added_memory")}
            categories={[countMetrics[2].label, countMetrics[3].label]} />
        </div>
        <section className="panel report-detail">
          <h2>YTD Submitters Unit Detail</h2>
          <div className="report-table-scroll">
            <table className="report-table">
              <thead><tr><th scope="col">Unit</th>
                {submitterGroups.map(({ key, label }) => <th key={key} scope="col">{label}</th>)}
              </tr></thead>
              <tbody>
                {summaryRow(scope, true)}
                {comparison ? summaryRow(comparison, true) : !isWard && (scope ? inScope : stakes).map((unit) => summaryRow(unit))}
              </tbody>
            </table>
          </div>
          <p className="field-help">A dash means no usable data. Partial figures show how many units contributed. A ~ marks an estimate based on reported percentages or total eligible membership.</p>
        </section>
      </>}
      {entry && <ReportEntry fixedUnit={Boolean(fixedUnit && isWard)} wards={inScope} unitNames={unitNames} initialUnit={entry.unit} initialMonth={entry.month} reports={reportIndex}
        close={() => setEntry(null)} saved={(unit, period) => {
          setEntry(null);
          setChosenMonth(period);
          setStatus(`Saved ${formatReportMonth(period)} for ${directory.get(unit)?.name ?? "this unit"}.`);
        }} />}
    </section>
  );
}
