"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Unit } from "../lib/directory";
import { formatReportMonth, monthNames, reportComparisonColor, reportMonthPattern, reportNumber, reportPeriod } from "../lib/family-history";
import { getInvolvedMetrics, type GetInvolvedData, type GetInvolvedMetric, type GetInvolvedReport } from "../lib/get-involved";
import { pointerChartX, useChartHover } from "./chart-hover";
import { Modal } from "./editor";
import { saveGetInvolvedReport } from "./report-actions";

type Point = { value: number | null; units: number };
type ChartSeries = { name: string; wardCount: number; points: Point[] };
type ReportScope = { name: string; wards: Unit[] };

function showChartLabel(index: number, count: number, stride: number) {
  const last = count - 1;
  return index === 0 || index === last || (index % stride === 0 && last - index >= stride);
}

function GetInvolvedChart({ metric, months, series, comparing }: {
  metric: typeof getInvolvedMetrics[number]; months: string[]; series: ChartSeries[]; comparing: boolean;
}) {
  const hover = useChartHover();
  const viewport = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(880);
  useEffect(() => {
    const container = viewport.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      setAvailableWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  const maximum = Math.max(4, ...series.flatMap(({ points }) => points.map(({ value }) => value ?? 0)));
  const magnitude = 10 ** Math.floor(Math.log10(maximum / 4));
  const unit = [1, 2, 2.5, 5, 10].find((step) => step * magnitude >= maximum / 4) ?? 10;
  const step = Math.max(1, unit * magnitude);
  const tickCount = Math.ceil(maximum / step);
  const multipleYears = months[0]?.slice(0, 4) !== months.at(-1)?.slice(0, 4);
  const minWidth = months.length > 12 ? months.length * 32 + 68 : 240;
  const width = Math.max(minWidth, availableWidth);
  const left = Math.max(38, reportNumber(step * tickCount).length * 7 + 12);
  const right = width - 30;
  const spacing = (right - left) / Math.max(1, months.length - 1);
  const monthStride = Math.max(months.length > 12 ? 2 : 1, Math.ceil((multipleYears ? 45 : 29) / spacing));
  const longestValue = Math.max(...series[0].points.map(({ value, units }) => value === null ? 0 : reportNumber(value).length + Number(units < series[0].wardCount)));
  const valueStride = Math.max(1, Math.ceil((longestValue * 7 + 4) / spacing));
  const x = (index: number) => months.length === 1 ? (left + right) / 2 : left + index * spacing;
  const y = (value: number) => 177 - value * 150 / (step * tickCount);

  return <section className="report-chart get-involved-chart">
    <h3>{metric.title}</h3>
    <p>{metric.label}</p>
    {"note" in metric && <p className="field-help">{metric.note}</p>}
    <div className="report-chart-scroll" ref={viewport} onScroll={hover.hide} onWheel={hover.hide}>
      <svg className="get-involved-line-chart" viewBox={`0 0 ${width} 209`} aria-hidden="true" style={{ minWidth }}>
        {Array.from({ length: tickCount + 1 }, (_, index) => index * step).map((tick) => <g key={tick}>
          <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} className="report-gridline" />
          <text x={left - 8} y={y(tick)} dy=".32em" textAnchor="end">{reportNumber(tick)}</text>
        </g>)}
        {months.map((month, index) => {
          if (!showChartLabel(index, months.length, monthStride)) return null;
          const shortMonth = monthNames[Number(month.slice(5)) - 1].slice(0, 3).toUpperCase();
          const label = multipleYears ? `${shortMonth} ${month.slice(2, 4)}` : shortMonth;
          return <g key={month}>
            <line x1={x(index)} x2={x(index)} y1={y(step * tickCount)} y2={y(0)} className="report-gridline" />
            <text x={x(index)} y={199} textAnchor="middle">{label}</text>
          </g>;
        })}
        {series.map(({ name, points, wardCount }, seriesIndex) => {
          const color = comparing ? reportComparisonColor(seriesIndex) : metric.color;
          const details = (index: number) => {
            const { value, units } = points[index];
            return {
              name,
              context: `${formatReportMonth(months[index])} · ${metric.title}`,
              value: value === null ? "No data" : `${reportNumber(value)}${units < wardCount ? ` (${units} of ${wardCount} units)` : ""}`,
            };
          };
          return <g key={seriesIndex}>
            {points.map(({ value }, index) => {
              const previous = points[index - 1]?.value;
              if (value === null || previous == null) return null;
              const segment = { x1: x(index - 1), x2: x(index), y1: y(previous), y2: y(value) };
              return <g key={months[index]}>
                <line {...segment} stroke={color} strokeWidth={2} />
                <line {...segment} className="chart-hit-area" stroke="transparent" strokeWidth={14}
                  {...hover.bind((event) => details(pointerChartX(event) < (segment.x1 + segment.x2) / 2 ? index - 1 : index))} />
              </g>;
            })}
            {points.map(({ value, units }, index) => value !== null && <g key={months[index]}>
              <circle cx={x(index)} cy={y(value)} r={3.5} fill={comparing ? color : "white"} stroke={comparing ? "white" : color} strokeWidth={comparing ? 1 : 2} />
              <circle className="chart-hit-area" cx={x(index)} cy={y(value)} r={8} fill="transparent" {...hover.bind(details(index))} />
              {!comparing && showChartLabel(index, months.length, valueStride) && <text x={x(index)} y={y(value) - 9} className="report-point-label" textAnchor="middle">
                {reportNumber(value)}{units < wardCount ? "*" : ""}
              </text>}
            </g>)}
          </g>;
        })}
      </svg>
    </div>
    {hover.tooltip}
    {comparing && <ul className="report-legend" aria-label="Chart legend">
      {series.map(({ name }, index) => <li key={index}><span className="report-legend-line" aria-hidden="true"
        style={{ borderTopColor: reportComparisonColor(index) }} />{name}</li>)}
    </ul>}
    {series.every(({ points }) => points.every(({ value }) => value === null)) && <p className="field-help">No counts recorded for this period.</p>}
    <details className="report-chart-values">
      <summary>View monthly values</summary>
      <div className="report-table-scroll">
      <table className="report-table">
        <thead><tr><th scope="col">Month</th>{series.map(({ name }, index) => <th key={index} scope="col">{comparing ? name : metric.label}</th>)}</tr></thead>
        <tbody>{months.map((month, index) => <tr key={month}><th scope="row">{formatReportMonth(month)}</th>
          {series.map(({ points, wardCount }, seriesIndex) => {
            const { value, units } = points[index];
            return <td key={seriesIndex}>
              {value === null ? "—" : reportNumber(value)}
              {value !== null && units < wardCount && <small>{units} of {wardCount} units</small>}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
      </div>
    </details>
  </section>;
}

export function GetInvolvedReports({ wards, data, currentMonth, scopeName = "Unit total", comparison, viewControls }: {
  wards: Unit[]; data: GetInvolvedData; currentMonth: string; scopeName?: string;
  comparison?: ReportScope[];
  viewControls?: ReactNode;
}) {
  const currentYear = currentMonth.slice(0, 4);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState("");
  const comparisonScopes = comparison?.length ? comparison : undefined;
  const comparing = Boolean(comparisonScopes);
  const chartYear = comparing ? currentYear : selectedYear;
  const scopes = (comparisonScopes ?? [{ name: scopeName, wards }]).map((scope) => {
    const ids = new Set(scope.wards.map(({ id }) => id));
    const byMonth = new Map<string, GetInvolvedReport[]>();
    for (const report of data.reports) {
      if (!ids.has(report.unit_id)) continue;
      const month = report.report_month.slice(0, 7);
      const entries = byMonth.get(month) ?? [];
      entries.push(report);
      byMonth.set(month, entries);
    }
    return { name: scope.name, wardCount: ids.size, byMonth };
  });
  const savedMonths = [...new Set(scopes.flatMap(({ byMonth }) => [...byMonth.keys()]))].sort();
  const showPeriod = !comparing && savedMonths.length > 0;
  const years = [...new Set([currentYear, ...savedMonths.map((month) => month.slice(0, 4))])].sort().reverse();
  const shownMonths = savedMonths.filter((month) => month.startsWith(chartYear) && (!comparing || month <= currentMonth));
  const end = shownMonths.at(-1) ?? currentMonth;
  const serial = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
  const last = serial(end);
  const first = chartYear && shownMonths.length ? serial(`${chartYear}-01`) : Math.max(serial(shownMonths[0] ?? end), last - 23);
  const months = Array.from({ length: last - first + 1 }, (_, index) => {
    const period = first + index;
    return reportPeriod(Math.floor(period / 12), period % 12);
  });

  function points(key: GetInvolvedMetric, byMonth: Map<string, GetInvolvedReport[]>) {
    return months.map((month) => {
      const counts = (byMonth.get(month) ?? []).flatMap((report) => report[key] ?? []);
      return { value: counts.length ? counts.reduce((sum, count) => sum + count, 0) : null, units: counts.length };
    });
  }

  const charts = getInvolvedMetrics.map((metric) => ({ metric, series: scopes.map(({ name, wardCount, byMonth }) => ({
    name, wardCount, points: points(metric.key, byMonth),
  })) }));
  const partial = charts.some(({ series }) => series.some(({ points, wardCount }) => points.some(({ value, units }) => value !== null && units < wardCount)));
  return <section className="family-report" aria-labelledby="get-involved-heading">
    <div className="section-heading report-heading">
      <div><h2 id="get-involved-heading" className="unit-section-heading">Get Involved</h2>
        {shownMonths.length > 0 && <p>{first === last ? formatReportMonth(end) : `${formatReportMonth(months[0])} – ${formatReportMonth(end)}`}</p>}
      </div>
      {wards.length > 0 && <button type="button" className="button" disabled={Boolean(data.loadError)} onClick={() => { setStatus(""); setEditing(true); }}>Enter Get Involved counts</button>}
    </div>
    {status && <p className="notice" role="status">{status}</p>}
    {data.loadError ? <p className="notice error" role="alert">{data.loadError}</p> : <>
      {(showPeriod || viewControls) && <div className="report-filters get-involved-filters">
        {showPeriod && <label>Chart period
          <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
            <option value="">Latest 24 months</option>
          </select>
        </label>}
        {viewControls}
      </div>}
      {partial && <p className="field-help">{comparing ? "View monthly values to see how many wards or branches contributed to partial totals."
        : "* Only some wards or branches reported a count for that month."}</p>}
      {shownMonths.length === 0 ? <p className="notice">{savedMonths.length > 0
        ? `No Get Involved counts are saved for ${chartYear}.${comparing ? "" : " Choose another chart period to see earlier counts."}`
        : "No Get Involved counts are saved for this unit."}</p> : <div className="panel report-sheet">
        {charts.map(({ metric, series }) => <GetInvolvedChart key={metric.key} metric={metric} months={months} series={series} comparing={comparing} />)}
      </div>}
    </>}
    {editing && <GetInvolvedEntry wards={wards} reports={data.reports} initialMonth={end} close={() => setEditing(false)}
      saved={(month) => {
        setEditing(false);
        if (!comparing && (selectedYear || serial(month) < first)) setSelectedYear(month.slice(0, 4));
        setStatus(`Saved Get Involved counts for ${formatReportMonth(month)}.`);
      }} />}
  </section>;
}

function GetInvolvedEntry({ wards, reports, initialMonth, close, saved }: {
  wards: Unit[]; reports: GetInvolvedReport[]; initialMonth: string; close: () => void; saved: (month: string) => void;
}) {
  const [unit, setUnit] = useState(wards.length === 1 ? wards[0].id : "");
  const [month, setMonth] = useState(initialMonth);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = unit && reportMonthPattern.test(month);
  const existing = reports.find((report) => report.unit_id === unit && report.report_month === `${month}-01`);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(getInvolvedMetrics.map(({ key }) => {
      const value = form.get(key);
      return [key, typeof value === "string" && value.trim() ? Number(value) : null];
    }));
    setBusy(true);
    setError("");
    try {
      const result = await saveGetInvolvedReport({ unit_id: unit, month, revision: existing?.revision ?? null, values });
      if (result.error) setError(result.error);
      else saved(month);
    } catch {
      setError("Could not save the Get Involved report. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return <Modal title="Enter Get Involved counts" close={() => { if (!busy) close(); }}>
    <form className="modal-body stack" onSubmit={submit}>
      <fieldset disabled={busy} className="report-entry-fields">
        <div className="report-entry-target">
          {wards.length === 1 ? <div className="report-entry-unit"><small>Ward or branch</small><strong>{wards[0].name}</strong></div>
            : <label>Ward or branch<select required value={unit} onChange={(event) => { setUnit(event.target.value); setError(""); }}>
              <option value="">Select a ward or branch</option>
              {wards.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select></label>}
          <label>Report month<input type="month" required min="1900-01" max="9999-12" value={month}
            onChange={(event) => { setMonth(event.target.value); setError(""); }} /></label>
        </div>
        {ready && <div className="stack" key={`${unit}/${month}/${existing?.revision ?? ""}`}>
          <p className="field-help">Enter counts for this month. Leave unavailable values blank and enter 0 for a reported zero.</p>
          {getInvolvedMetrics.map(({ key, title, label }) => <label key={key}>{title}<small>{label}</small>
            <input type="number" min="0" max="2147483647" step="1" name={key} defaultValue={existing?.[key] ?? ""} />
          </label>)}
        </div>}
      </fieldset>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="button" disabled={busy} onClick={close}>Cancel</button>
        <button className="button primary" disabled={!ready || busy}>{busy ? "Saving…" : "Save counts"}</button>
      </div>
    </form>
  </Modal>;
}
