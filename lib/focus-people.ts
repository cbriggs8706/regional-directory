import { countMetrics, generationsLabel } from "./family-history";

export const focusTypes = ["recent_convert", "person_of_interest"] as const;
export type FocusType = typeof focusTypes[number];

export const focusTypeLabels = {
  recent_convert: "Recent Convert",
  person_of_interest: "Person of Interest",
} satisfies Record<FocusType, string>;

export const focusMetrics = [
  ...countMetrics.map(({ key, label }) => ({
    key,
    label: key === "submitters" ? "Submitted a name" : key === "familysearch_logins" ? "Signed in to FamilySearch" : label,
  })),
  { key: "first_four_generations", label: generationsLabel },
] as const;

export type FocusMetric = typeof focusMetrics[number]["key"];
export type FocusActivity = Record<FocusMetric, boolean | null> & {
  contact_id: string;
  report_month: string;
  revision: string;
};
export type FocusActivityData = { activity: FocusActivity[]; loadError: string | null };
