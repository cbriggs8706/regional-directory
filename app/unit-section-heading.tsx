import { unitNameWithType, type Unit } from "../lib/directory";

export const familyHistoryReportTitle = "Family History Activity Report";

export function UnitSectionHeading({ id, title, unit }: { id: string; title: string; unit: Unit }) {
  return <PageSectionHeading id={id} title={title} name={unitNameWithType(unit)} />;
}

export function PageSectionHeading({ id, title, name }: { id: string; title: string; name: string }) {
  return <header className="section-heading unit-section-heading">
    <div className="unit-section-title">
      <span aria-hidden="true">{familyHistoryReportTitle}</span>
      <h2 id={id}>{title}</h2>
    </div>
    <p>{name}</p>
  </header>;
}
