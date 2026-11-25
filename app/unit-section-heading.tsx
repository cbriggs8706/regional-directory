import { unitNameWithType, type Unit } from "../lib/directory";

export const familyHistoryReportTitle = "Family History Activity Report";

export function UnitSectionHeading({ id, title, unit }: { id: string; title: string; unit: Unit }) {
  return <header className="section-heading unit-section-heading">
    <div className="unit-section-title">
      <span aria-hidden="true">{familyHistoryReportTitle}</span>
      <h2 id={id}>{title}</h2>
    </div>
    <p>{unitNameWithType(unit)}</p>
  </header>;
}
