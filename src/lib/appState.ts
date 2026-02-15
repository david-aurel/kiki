import { defaultRuleConfig } from "../core/models/defaults";
import type { FocusMode, RuleConfig } from "../core/models/types";

const settingsKey = "kiki_settings_v1";

export interface AppSettings {
  githubTokenRef: string;
  slackTokenRef: string;
  slackUserId: string;
  rules: RuleConfig;
}

const defaultSettings: AppSettings = {
  githubTokenRef: "github_pat",
  slackTokenRef: "slack_bot",
  slackUserId: "",
  rules: defaultRuleConfig
};

export function getSettings(): AppSettings {
  const raw = localStorage.getItem(settingsKey);
  if (!raw) return defaultSettings;

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const incomingMode = parsed.rules?.focusMode as string | undefined;
    const migratedMode = incomingMode === "personal_prs_only"
      ? "focused"
      : incomingMode === "review_requests_only"
      ? "focused"
      : incomingMode === "custom"
      ? "all"
      : incomingMode;
    const validFocusMode = migratedMode === "all" || migratedMode === "calm" || migratedMode === "focused" || migratedMode === "zen"
      ? migratedMode
      : defaultSettings.rules.focusMode;

    return {
      ...defaultSettings,
      ...parsed,
      rules: {
        ...defaultSettings.rules,
        ...parsed.rules,
        focusMode: validFocusMode
      }
    };
  } catch {
    return defaultSettings;
  }
}

export function setSettings(next: AppSettings): void {
  localStorage.setItem(settingsKey, JSON.stringify(next));
}

export function setFocusMode(mode: FocusMode): AppSettings {
  const current = getSettings();
  const next = { ...current, rules: { ...current.rules, focusMode: mode } };
  setSettings(next);
  return next;
}
