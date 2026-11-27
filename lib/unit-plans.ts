export const unitPlanBucket = "ward-plans";
export const unitPlanMaxBytes = 4 * 1024 * 1024;
export const unitPlanMigrationMessage = "Apply the unit plan migrations in Supabase to enable PDF uploads.";

export type UnitPlan = {
  id: string;
  filename: string;
  created_at: string;
};

export function unitPlanPath(unitId: string, planId: string) {
  return `${unitId}/${planId}.pdf`;
}

export type UnitPlanCoverageData = {
  uploadedUnitIds: string[];
  loadError: string | null;
};
