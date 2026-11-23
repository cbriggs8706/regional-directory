import { monthNames, reportNumber, type ReportMetric } from "../lib/family-history";

export type ReportSeries = { label: string; color: string; metrics: ReportMetric[]; dashed?: boolean };

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

export function SubmittersChart({ series, comparison }: { series: ReportSeries[]; comparison: string }) {
  const maximum = Math.max(4, ...series.flatMap(({ metrics }) => metrics.map(({ value }) => value ?? 0)));
  const step = chartStep(maximum);
  const upper = step * Math.ceil(maximum / step);
  const x = (month: number) => 74 + month * 77;
  const y = (value: number) => 24 + (1 - value / upper) * 184;
  const ticks = Array.from({ length: upper / step + 1 }, (_, index) => index * step);

  return (
    <section className="panel report-chart report-submitters">
      <h2>Members Submitting This Year</h2>
      <p className="report-chart-caption">{comparison}</p>
      <div className="report-chart-scroll">
        <svg viewBox="0 0 960 248" aria-hidden="true" className="report-line-chart">
          {ticks.map((tick) => <g key={tick}>
            <line x1={64} x2={930} y1={y(tick)} y2={y(tick)} className="report-gridline" />
            <text x={55} y={y(tick)} dy=".32em" textAnchor="end">{reportNumber(tick)}</text>
          </g>)}
          {monthNames.map((month, index) => <text key={month} x={x(index)} y={233} textAnchor="middle">{month.slice(0, 3)}</text>)}
          {series.map(({ label, color, metrics, dashed }) => <g key={label}>
            {metrics.map(({ value }, month) => {
              const previous = metrics[month - 1]?.value;
              return value !== null && previous != null && <line key={month} x1={x(month - 1)} x2={x(month)}
                y1={y(previous)} y2={y(value)} stroke={color} strokeWidth={2.5} strokeDasharray={dashed ? "6 4" : undefined} />;
            })}
            {metrics.map((metric, month) => metric.value !== null && <g key={month}>
              <circle cx={x(month)} cy={y(metric.value)} r={4.5} fill={color} stroke="white" strokeWidth={1}>
                <title>{`${label} · ${monthNames[month]} · ${metricText(metric)}${coverage(metric)}`}</title>
              </circle>
              {series.length <= 2 && <text x={x(month)} y={y(metric.value) + (dashed ? 16 : -10)}
                textAnchor="middle" className="report-point-label">{metricText(metric)}</text>}
            </g>)}
          </g>)}
        </svg>
      </div>
      <ul className="report-legend" aria-label="Chart legend">
        {series.map(({ label, color, dashed }) => <li key={label}>
          <span className="report-legend-line" style={{ borderColor: color, borderTopStyle: dashed ? "dashed" : "solid" }} />{label}
        </li>)}
      </ul>
      <details className="report-chart-values">
        <summary>View monthly values</summary>
        <div className="report-table-scroll">
          <table className="report-table">
            <thead><tr><th scope="col">Month</th>{series.map(({ label }) => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{monthNames.map((month, index) => <tr key={month}>
              <th scope="row">{month}</th>
              {series.map(({ label, metrics }) => <td key={label}>{metricText(metrics[index])}
                {metrics[index].value !== null && <small>{coverage(metrics[index])}</small>}
              </td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export function MetricChart({ title, series, categories, percentage = false }: {
  title: string;
  series: ReportSeries[];
  categories: string[];
  percentage?: boolean;
}) {
  const maximum = Math.max(4, ...series.flatMap(({ metrics }) => metrics.map(({ value }) => value ?? 0)));
  const step = chartStep(maximum);
  const upper = percentage ? 100 : step * Math.ceil(maximum / step);
  return (
    <section className="panel report-chart">
      <h2>{title}</h2>
      {categories.map((category, index) => <div key={category} className="report-bar-group">
        {category && <h3>{category}</h3>}
        <ul className={series.length <= 3 ? "report-bars report-bars-vertical" : "report-bars"} aria-label={category || title}>
          {series.map(({ label, color, metrics }) => {
            const metric = metrics[index];
            return <li key={label} className="report-bar-row">
              <span>{label}</span>
              <span className="report-bar-track" aria-hidden="true">
                {metric.value !== null && <span style={{ "--bar-size": `${metric.value / upper * 100}%`, backgroundColor: color } as React.CSSProperties} />}
              </span>
              <span className="report-bar-value" title={metric.value !== null && coverage(metric) ? coverage(metric).trim() : undefined}>
                {metricText(metric, percentage)}{metric.value !== null && metric.estimated && <sup aria-label="Estimated">~</sup>}
                {metric.value !== null && metric.units < metric.total && <small aria-label={coverage(metric).trim()}> {metric.units}/{metric.total}</small>}
              </span>
            </li>;
          })}
        </ul>
      </div>)}
    </section>
  );
}
