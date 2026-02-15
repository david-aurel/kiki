import type { EstimateNormalized } from "../models/types";

const patterns: Array<{ regex: RegExp; value: EstimateNormalized }> = [
  { regex: /ETA:\s*:rotating_light:\s*immediate/i, value: "immediate" },
  { regex: /ETA:\s*:hourglass_flowing_sand:\s*half-day/i, value: "half_day" },
  { regex: /ETA:\s*:calendar:\s*1-2d/i, value: "one_two_days" }
];

export function parseEstimate(prBody: string): { raw: string; normalized: EstimateNormalized } {
  for (const pattern of patterns) {
    const match = prBody.match(pattern.regex);
    if (match) {
      return { raw: match[0], normalized: pattern.value };
    }
  }

  return { raw: "", normalized: "unknown" };
}
