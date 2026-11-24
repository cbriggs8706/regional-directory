export const getInvolvedMetrics = [
  { key: "participants", title: "Overall Engagement", label: "Total number of people participating", color: "#679a1e" },
  { key: "quick_name_reviews", title: "Quick Name Review", label: "Total number of names reviewed", color: "#ec577f" },
  { key: "full_name_reviews", title: "Full Name Review", label: "Total number of names reviewed", color: "#af6eeb" },
  { key: "family_reviews", title: "Family Review", label: "Total number of families reviewed", color: "#d87000" },
  { key: "verified_places", title: "Verify Places", label: "Total number of places verified", color: "#357419" },
  { key: "record_hint_reviews", title: "Record Hint Review", label: "Total number of record hints reviewed", color: "#2097b7" },
  { key: "indexed_or_reviewed", title: "Indexing", label: "Total number of records indexed or reviewed", color: "#d87000", note: "Indexing was retired on April 30, 2025." },
] as const;

export type GetInvolvedMetric = typeof getInvolvedMetrics[number]["key"];
export type GetInvolvedReport = Record<GetInvolvedMetric, number | null> & {
  unit_id: string;
  report_month: string;
  revision: string;
};
export type GetInvolvedData = { reports: GetInvolvedReport[]; loadError: string | null };
