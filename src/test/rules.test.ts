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

  it("keeps review comments distinct from normal comments", () => {
    const reviewComment = { ...base, reason: "review_commented", category: "review_commented" as const };
    const normalComment = { ...base, reason: "comment", category: "comment" as const };
    expect(reviewComment.category).not.toBe(normalComment.category);
  });

  it("suppresses copilot", () => {
    const decision = getDeliveryDecision(
      { ...base, latestCommentActor: "github-copilot[bot]" },
      { ...defaultRuleConfig, focusMode: "calm" }
    );
    expect(decision.action).toBe("suppress");
  });

  it("suppresses known copilot reviewer bot in calm mode", () => {
    const decision = getDeliveryDecision(
      { ...base, latestCommentActor: "copilot-pull-request-reviewer[bot]" },
      { ...defaultRuleConfig, focusMode: "calm" }
    );
    expect(decision.action).toBe("suppress");
  });

  it("does not suppress copilot in all mode", () => {
    const decision = getDeliveryDecision(
      { ...base, latestCommentActor: "github-copilot[bot]" },
      { ...defaultRuleConfig, focusMode: "all" }
    );
    expect(decision.action).toBe("deliver");
  });

  it("filters by focus", () => {
    const rule = { ...defaultRuleConfig, focusMode: "focused" as const };
    const nonPersonal = { ...base, isPersonalPrActivity: false };
    expect(matchesFocus(nonPersonal, rule)).toBe(false);
  });

  it("suppresses team-only review requests outside all mode", () => {
    const decision = getDeliveryDecision(
      {
        ...base,
        reason: "review_requested",
        isReviewRequest: true,
        isDirectReviewRequest: false,
        isTeamReviewRequest: true,
        isPersonalPrActivity: false
      },
      { ...defaultRuleConfig, focusMode: "calm" }
    );
    expect(decision.action).toBe("suppress");
    expect(decision.reason).toBe("team_review_request_suppressed_outside_all");
  });

  it("delivers direct review requests in calm mode", () => {
    const decision = getDeliveryDecision(
      {
        ...base,
        reason: "review_requested",
        isReviewRequest: true,
        isDirectReviewRequest: true,
        isTeamReviewRequest: true,
        isPersonalPrActivity: false
      },
      { ...defaultRuleConfig, focusMode: "calm" }
    );
    expect(decision.action).toBe("deliver");
  });
});
