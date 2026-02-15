import type { GitHubNotification, RuleConfig } from "../models/types";

export function matchesFocus(notification: GitHubNotification, rule: RuleConfig): boolean {
  switch (rule.focusMode) {
    case "all":
      return true;
    case "calm":
      return !!(notification.isPersonalPrActivity || notification.isReviewRequest);
    case "focused":
      return !!notification.isPersonalPrActivity && !notification.isReviewRequest;
    case "zen":
      return false;
  }
}
