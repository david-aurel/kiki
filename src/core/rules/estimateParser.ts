import type { EstimateNormalized } from "../models/types";

const patterns: Array<{ regex: RegExp; value: EstimateNormalized }> = [
  { regex: /^\s*(?:\*\*)?\s*⚡(?:️)?\s*Immediate\s*(?:\*\*)?\s*$/im, value: "immediate" },
  { regex: /^\s*(?:\*\*)?\s*🐬\s*Half working day\s*(?:\*\*)?\s*$/im, value: "half_day" },
  { regex: /^\s*(?:\*\*)?\s*🐝\s*1-2 days\s*(?:\*\*)?\s*$/im, value: "one_two_days" }
];

export function parseEstimate(prBody: string): { raw: string; normalized: EstimateNormalized } {
  const matches: Array<{ raw: string; value: EstimateNormalized }> = [];

  for (const line of prBody.split(/\r?\n/)) {
    for (const pattern of patterns) {
      if (pattern.regex.test(line)) {
        matches.push({ raw: line.trim(), value: pattern.value });
      }
    }
  }

  const unique = [...new Set(matches.map((match) => match.value))];
  if (unique.length === 1) {
    const selected = matches.find((match) => match.value === unique[0]);
    if (selected) {
      return { raw: selected.raw, normalized: selected.value };
    }
  }

  return { raw: "", normalized: "unknown" };
}
