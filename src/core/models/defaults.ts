import type { RuleConfig } from "./types";

export const defaultRuleConfig: RuleConfig = {
  suppressCopilot: false,
  suppressedReasons: ["subscribed"],
  teamHandles: [],
  focusMode: "all"
};
