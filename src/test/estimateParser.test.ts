import { describe, expect, it } from "vitest";
import { parseEstimate } from "../core/rules/estimateParser";

describe("estimate parser", () => {
  it("parses immediate", () => {
    const parsed = parseEstimate("hello\n**⚡️ Immediate**\nworld");
    expect(parsed.normalized).toBe("immediate");
  });

  it("parses half working day", () => {
    const parsed = parseEstimate("hello\n**🐬 Half working day**\nworld");
    expect(parsed.normalized).toBe("half_day");
  });

  it("parses one to two days", () => {
    const parsed = parseEstimate("hello\n**🐝 1-2 days**\nworld");
    expect(parsed.normalized).toBe("one_two_days");
  });

  it("parses estimate markers without bold markdown", () => {
    const parsed = parseEstimate("hello\n🐬 Half working day\nworld");
    expect(parsed.normalized).toBe("half_day");
  });

  it("returns unknown when multiple conflicting markers are present", () => {
    const parsed = parseEstimate("**⚡️ Immediate**\n...\n**🐬 Half working day**");
    expect(parsed.normalized).toBe("unknown");
  });

  it("returns unknown when missing", () => {
    const parsed = parseEstimate("no eta");
    expect(parsed.normalized).toBe("unknown");
  });
});
