import { describe, expect, it } from "vitest";
import { defaultRuleConfig } from "../core/models/defaults";
import { ciRollupFromStatuses, classifySlaAgeHours } from "../core/rules/classifiers";
import { matchesFocus } from "../core/rules/focus";
import { getDeliveryDecision } from "../core/rules/notificationDecision";

describe("classifiers", () => {
  it("classifies SLA bands", () => {
    expect(classifySlaAgeHours(2)).toBe("excellent");
    expect(classifySlaAgeHours(5)).toBe("very_good");
    expect(classifySlaAgeHours(12)).toBe("good");
    expect(classifySlaAgeHours(30)).toBe("degrading");
    expect(classifySlaAgeHours(80)).toBe("critical");
  });

  it("rolls up CI state", () => {
    expect(ciRollupFromStatuses(["pending", "passing"])).toBe("pending");
    expect(ciRollupFromStatuses(["passing"])).toBe("passing");
    expect(ciRollupFromStatuses(["failing", "passing"])).toBe("failing");
    expect(ciRollupFromStatuses([])).toBe("none");
  });
});

describe("delivery decisions", () => {
  const base = {
    id: "n1",
    reason: "mention",
    updatedAt: "2026-02-13T00:00:00.000Z",
    repositoryFullName: "acme/kiki",
    subjectType: "PullRequest",
    subjectTitle: "Test",
    isPersonalPrActivity: true,
    isReviewRequest: false,
    isDirectMention: true,
    isCiStateChange: false
  };

  it("suppresses copilot", () => {
    const decision = getDeliveryDecision(
      { ...base, latestCommentActor: "github-copilot[bot]" },
      { ...defaultRuleConfig, focusMode: "calm" }
    );
    expect(decision.action).toBe("suppress");
  });

  it("filters by focus", () => {
    const rule = { ...defaultRuleConfig, focusMode: "focused" as const };
    const nonPersonal = { ...base, isPersonalPrActivity: false };
    expect(matchesFocus(nonPersonal, rule)).toBe(false);
  });
});
