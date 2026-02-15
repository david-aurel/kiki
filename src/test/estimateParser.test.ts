import { describe, expect, it } from "vitest";
import { parseEstimate } from "../core/rules/estimateParser";

describe("estimate parser", () => {
  it("parses immediate", () => {
    const parsed = parseEstimate("hello\nETA: :rotating_light: immediate\nworld");
    expect(parsed.normalized).toBe("immediate");
  });

  it("returns unknown when missing", () => {
    const parsed = parseEstimate("no eta");
    expect(parsed.normalized).toBe("unknown");
  });
});
