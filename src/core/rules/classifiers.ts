import type { CiRollup } from "../models/types";

export function classifySlaAgeHours(ageHours: number): "excellent" | "very_good" | "good" | "degrading" | "critical" {
  if (ageHours <= 3) return "excellent";
  if (ageHours <= 6) return "very_good";
  if (ageHours <= 24) return "good";
  if (ageHours <= 48) return "degrading";
  return "critical";
}

export function ciRollupFromStatuses(statuses: Array<"failing" | "pending" | "passing">): CiRollup {
  if (statuses.includes("failing")) return "failing";
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("passing")) return "passing";
  return "none";
}
