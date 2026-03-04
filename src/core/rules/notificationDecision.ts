import type { DeliveryDecision, GitHubNotification, RuleConfig } from "../models/types";
import { matchesFocus } from "./focus";

export function getDeliveryDecision(notification: GitHubNotification, rule: RuleConfig): DeliveryDecision {
  if (rule.focusMode === "zen") {
    return { action: "suppress", reason: "focus_mode_zen" };
  }

  if (rule.focusMode === "all") {
    return { action: "deliver", reason: "focus_mode_all" };
  }

  // Team-only review requests are still shown in Kiki, but should not notify
  // outside of All mode.
  if (
    notification.isReviewRequest &&
    notification.isTeamReviewRequest &&
    !notification.isDirectReviewRequest
  ) {
    return { action: "suppress", reason: "team_review_request_suppressed_outside_all" };
  }

  const suppressCopilotByMode = rule.focusMode === "calm" || rule.focusMode === "focused";
  if ((rule.suppressCopilot || suppressCopilotByMode) && isCopilotActor(notification)) {
    return { action: "suppress", reason: "latest_comment_from_github_copilot_bot" };
  }

  if (rule.suppressedReasons.includes(notification.reason)) {
    return { action: "suppress", reason: `suppressed_reason:${notification.reason}` };
  }

  if (!matchesFocus(notification, rule)) {
    return { action: "suppress", reason: "focus_mode_filtered" };
  }

  return { action: "deliver", reason: "deliverable" };
}

export function deliveryKey(userId: string, notification: GitHubNotification): string {
  return `${userId}:${notification.id}`;
}

function isCopilotActor(notification: GitHubNotification): boolean {
  const actor = (notification.latestCommentActor || notification.actorLogin || "").trim().toLowerCase();
  if (!actor) return false;
  if (actor === "github-copilot[bot]") return true;
  if (actor === "copilot-pull-request-reviewer[bot]") return true;
  return actor.includes("copilot");
}
