import { monthNames, reportNumber, type ReportMetric } from "../lib/family-history";
import { pointerChartX, useChartHover } from "./chart-hover";

export type ReportSeries = {
  id?: string; label: string; unitName?: string; year?: number; period?: string;
  color: string; metrics: ReportMetric[]; dashed?: boolean; previous?: boolean;
};

function coverage(metric: ReportMetric) {
  return metric.units < metric.total ? ` (${metric.units} of ${metric.total} units)` : "";
}

export function metricText(metric: ReportMetric, percentage = false) {
  return metric.value === null ? "—" : reportNumber(metric.value, percentage);
}

function chartStep(maximum: number) {
  const magnitude = 10 ** Math.floor(Math.log10(maximum / 4));
  const step = maximum / 4 / magnitude;
  return (step <= 1 ? 1 : step <= 2 ? 2 : step <= 5 ? 5 : 10) * magnitude;
}

export function SubmittersChart({ series, comparison, compareUnits = false }: {
  series: ReportSeries[]; comparison: string; compareUnits?: boolean;
}) {
  const hover = useChartHover();
  const maximum = Math.max(4, ...series.flatMap(({ metrics }) => metrics.map(({ value }) => value ?? 0)));
  const step = chartStep(maximum);
  const upper = step * Math.ceil(maximum / step);
  const x = (month: number) => 74 + month * 77;
  const y = (value: number) => 24 + (1 - value / upper) * 184;
  const ticks = Array.from({ length: upper / step + 1 }, (_, index) => index * step);
  const displaySeries = compareUnits ? series : [...series].reverse();

  return (
    <section className="report-chart report-submitters">
      <h2>Members Submitting This Year</h2>
      <p className="report-chart-caption">{comparison}</p>
      <div className="report-chart-scroll" onScroll={hover.hide} onWheel={hover.hide}>
        <svg viewBox="0 0 960 248" aria-hidden="true" className="report-line-chart">
          {ticks.map((tick) => <g key={tick}>
            <line x1={64} x2={930} y1={y(tick)} y2={y(tick)} className="report-gridline" />
            <text x={55} y={y(tick)} dy=".32em" textAnchor="end">{reportNumber(tick)}</text>
          </g>)}
          {monthNames.map((month, index) => <g key={month}>
            <line x1={x(index)} x2={x(index)} y1={y(upper)} y2={y(0)} className="report-gridline" />
            <text x={x(index)} y={233} textAnchor="middle">{month.slice(0, 3)}</text>
          </g>)}
          {displaySeries.map(({ id, label, unitName, year, color, metrics, dashed, previous }) => {
            const details = (month: number) => ({
              name: unitName ?? label,
              context: `${monthNames[month]}${year ? ` ${year}` : ""} · Members submitting`,
              value: `${metricText(metrics[month])}${coverage(metrics[month])}`,
            });
            return <g key={id ?? label}>
              {metrics.map(({ value }, month) => {
                const priorMonth = metrics[month - 1]?.value;
                if (value === null || priorMonth == null) return null;
                const x1 = x(month - 1), x2 = x(month);
                const y1 = y(priorMonth), y2 = y(value);
                const handle = (x2 - x1) / 3;
                const path = `M ${x1} ${y1} C ${x1 + handle} ${y1}, ${x2 - handle} ${y2}, ${x2} ${y2}`;
                return <g key={month}>
                  <path d={path} fill="none" stroke={color} strokeWidth={previous ? 2 : 2.8} strokeDasharray={dashed ? "6 4" : undefined} />
                  <path className="chart-hit-area" d={path} fill="none" stroke="transparent" strokeWidth={14}
                    {...hover.bind((event) => details(pointerChartX(event) < (x1 + x2) / 2 ? month - 1 : month))} />
                </g>;
              })}
              {metrics.map((metric, month) => metric.value !== null && <g key={month}>
                <circle cx={x(month)} cy={y(metric.value)} r={4.5} fill={color} stroke="white" strokeWidth={1} />
                <circle className="chart-hit-area" cx={x(month)} cy={y(metric.value)} r={8} fill="transparent" {...hover.bind(details(month))} />
                {!compareUnits && series.length <= 2 && <text x={x(month)} y={y(metric.value) + (previous ? 15 : -10)}
                  textAnchor="middle" className="report-point-label">{metricText(metric)}</text>}
              </g>)}
            </g>;
          })}
        </svg>
      </div>
      {hover.tooltip}
      <ul className="report-legend" aria-label="Chart legend">
        {displaySeries.map(({ id, label, color, dashed }) => <li key={id ?? label}>
          <span className="report-legend-line" style={{ borderColor: color, borderTopStyle: dashed ? "dashed" : "solid" }} />{label}
        </li>)}
      </ul>
      <details className="report-chart-values">
        <summary>View monthly values</summary>
        <div className="report-table-scroll">
          <table className="report-table">
            <thead><tr><th scope="col">Month</th>{series.map(({ id, label }) => <th key={id ?? label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{monthNames.map((month, index) => <tr key={month}>
              <th scope="row">{month}</th>
              {series.map(({ id, label, metrics }) => <td key={id ?? label}>{metricText(metrics[index])}
                {metrics[index].value !== null && <small>{coverage(metrics[index])}</small>}
              </td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export function MetricChart({ title, series, categories, percentage = false, compareUnits = false }: {
  title: string;
  series: ReportSeries[];
  categories?: string[];
  percentage?: boolean;
  compareUnits?: boolean;
}) {
  const hover = useChartHover();
  const maximum = Math.max(percentage ? 1 : 4, ...series.flatMap(({ metrics }) => metrics.map(({ value }) => value ?? 0)));
  const step = percentage ? chartStep(maximum) : Math.max(1, chartStep(maximum));
  const steps = Math.ceil(maximum / step);
  const width = compareUnits ? Math.max(300, 52 + (categories?.length ?? 1) * (series.length * 48 + 8)) : series.length > 3 ? 520 : 300;
  const left = 35, right = width - 10, top = 23, bottom = 185;
  const groupWidth = (right - left) / (categories?.length ?? 1);
  const barWidth = (groupWidth - 8) / series.length;
  const showLegend = compareUnits || Boolean(categories) || series.length > 3;
  const y = (value: number) => bottom - value / (step * steps) * (bottom - top);
  const ticks = Array.from({ length: steps + 1 }, (_, index) => index * step);
  const accessibleValues = (categories ?? [title]).flatMap((category, index) => series.map(({ label, metrics }) => {
    const metric = metrics[index];
    return `${category.replace("\n", " ")}, ${label}: ${metric.value === null ? "no data" : `${barValue(metric, percentage)}${coverage(metric)}`}`;
  }));
  return (
    <section className="report-chart report-metric">
      <h2>{title}</h2>
      <div className="report-chart-scroll" onScroll={hover.hide} onWheel={hover.hide}>
      <svg viewBox={`0 0 ${width} 225`} className="report-column-chart" role="img" aria-label={accessibleValues.join(". ")}
        style={compareUnits ? { minWidth: width } : undefined}>
        {ticks.map((tick) => <g key={tick}>
          <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} className="report-gridline" />
          <text x={left - 7} y={y(tick)} dy=".32em" textAnchor="end">{reportNumber(tick)}</text>
        </g>)}
        <line x1={left} x2={left} y1={top} y2={bottom} className="report-gridline" />
        <line x1={right} x2={right} y1={top} y2={bottom} className="report-gridline" />
        {(categories ?? [""]).map((category, index) => <g key={category}>
          {series.map(({ id, label, unitName, period, color, metrics }, seriesIndex) => {
            const metric = metrics[index];
            const x = left + index * groupWidth + 4 + seriesIndex * barWidth;
            const center = x + barWidth / 2;
            const barTop = metric.value === null ? bottom : y(metric.value);
            const details = {
              name: unitName ?? label,
              context: [period, category.replace("\n", " ") || title].filter(Boolean).join(" · "),
              value: metric.value === null ? "No data" : `${barValue(metric, percentage)}${coverage(metric)}`,
            };
            return <g key={id ?? label} {...hover.bind(details)}>
              {metric.value !== null && <rect x={x} y={barTop} width={barWidth - 1} height={bottom - barTop} fill={color} />}
              <rect className="chart-hit-area" x={x} y={Math.min(barTop, bottom - 8)} width={barWidth - 1}
                height={Math.max(8, bottom - barTop)} fill="transparent" />
              <text x={center} y={barTop - 5} textAnchor="middle" className="report-point-label">{barValue(metric, percentage)}</text>
              {!showLegend && <text x={center} y={bottom + 17} textAnchor="middle">{label}</text>}
            </g>;
          })}
          {category.split("\n").map((line, lineIndex) => <text key={line} x={left + (index + 0.5) * groupWidth}
            y={bottom + 17 + lineIndex * 13} textAnchor="middle">{line}</text>)}
        </g>)}
      </svg>
      </div>
      {hover.tooltip}
      {showLegend && <ul className="report-legend" aria-label="Chart legend">
        {series.map(({ id, label, color }) => <li key={id ?? label}><span className="report-legend-square" style={{ backgroundColor: color }} />{label}</li>)}
      </ul>}
    </section>
  );
}

function barValue(metric: ReportMetric, percentage: boolean) {
  if (metric.value === null) return "—";
  const value = percentage ? `${metric.value.toFixed(1)}%` : reportNumber(metric.value);
  return metric.estimated ? `${value}~` : value;
}
