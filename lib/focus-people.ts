import { generationsLabel } from "./family-history";

export const focusTypes = ["recent_convert", "person_of_interest"] as const;
export type FocusType = typeof focusTypes[number];

export const focusTypeLabels = {
  recent_convert: "Recent Convert",
  person_of_interest: "Person of Interest",
} satisfies Record<FocusType, string>;

export const focusMetrics = [
  { key: "submitters", label: "Submitted a name" },
  { key: "familysearch_logins", label: "Signed in to FamilySearch" },
  { key: "added_ancestor", label: "Added ancestor to tree" },
  { key: "added_memory", label: "Added memory to tree" },
  { key: "first_four_generations", label: generationsLabel },
] as const;

export type FocusMetric = typeof focusMetrics[number]["key"];
export type FocusActivity = Record<FocusMetric, boolean | null> & {
  contact_id: string;
  report_month: string;
  revision: string;
};
export type FocusActivityData = { activity: FocusActivity[]; loadError: string | null };
