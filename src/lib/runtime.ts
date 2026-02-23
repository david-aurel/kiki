import type { GitHubNotification, PullRequestSnapshot } from "../core/models/types";
import { GitHubHttpAdapter } from "../adapters/github/githubHttpAdapter";
import { KeychainAdapter } from "../adapters/secrets/keychainAdapter";
import { SlackHttpAdapter } from "../adapters/slack/slackHttpAdapter";
import { SqliteStoreAdapter } from "../adapters/store/sqliteStoreAdapter";
import { runNotificationPipeline } from "../core/services/notificationPipeline";
import { getDeliveryDecision } from "../core/rules/notificationDecision";
import { getSettings } from "./appState";
import { invoke } from "@tauri-apps/api/core";

const secrets = new KeychainAdapter();
const github = new GitHubHttpAdapter(secrets);
const slack = new SlackHttpAdapter(secrets);
const store = new SqliteStoreAdapter();

export type SlackDebugEventType =
  | "review_request"
  | "comment"
  | "review_approved"
  | "review_changes_requested"
  | "review_commented";

export interface NotificationProbeSnapshot {
  label: string;
  count: number;
  latestUpdatedAt: string | null;
  top: Array<{ id: string; reason: string; updatedAt: string; title: string; repo: string }>;
  error?: string;
}

export async function saveSecret(name: string, value: string): Promise<void> {
  await secrets.set(name, value);
}

export async function syncNow(): Promise<{ scanned: number; delivered: number; suppressed: number; skipped: number; failed: number }> {
  const settings = getSettings();
  return runNotificationPipeline(
    { github, slack, store },
    {
      userId: "local-user",
      slackUserId: settings.slackUserId,
      githubTokenRef: settings.githubTokenRef,
      slackTokenRef: settings.slackTokenRef,
      rules: settings.rules
    }
  );
}

export async function getLogs(): Promise<{ deliveries: Awaited<ReturnType<SqliteStoreAdapter["listDeliveries"]>>; suppressions: Awaited<ReturnType<SqliteStoreAdapter["listSuppressions"]>> }> {
  const [deliveries, suppressions] = await Promise.all([
    store.listDeliveries(),
    store.listSuppressions()
  ]);

  return { deliveries, suppressions };
}

export async function loadMyPrs(): Promise<PullRequestSnapshot[]> {
  const settings = getSettings();
  return github.fetchMyOpenPrs(settings.githubTokenRef);
}

export async function loadReviewRequests(): Promise<PullRequestSnapshot[]> {
  const settings = getSettings();
  return github.fetchReviewRequests(settings.githubTokenRef, settings.rules.teamHandles);
}

export async function loadRecentNotifications(limit = 10): Promise<GitHubNotification[]> {
  const settings = getSettings();
  const notifications = await github.fetchNotifications(settings.githubTokenRef);
  const picked = [...notifications]
    .sort(
      (a, b) =>
        new Date(b.occurredAt || b.updatedAt).getTime() -
        new Date(a.occurredAt || a.updatedAt).getTime()
    )
    .slice(0, Math.max(limit, 1));
  const enriched = await Promise.all(
    picked.map((notification) => enrichNotificationSafe(settings.githubTokenRef, notification, settings.rules))
  );

  return enriched;
}

export async function loadDebugNotifications(limit = 200): Promise<GitHubNotification[]> {
  const settings = getSettings();
  const notifications = await github.fetchNotifications(settings.githubTokenRef);
  const picked = [...notifications]
    .sort(
      (a, b) =>
        new Date(b.occurredAt || b.updatedAt).getTime() -
        new Date(a.occurredAt || a.updatedAt).getTime()
    )
    .slice(0, Math.max(limit, 1));

  const enriched = await Promise.all(
    picked.map((notification) => enrichNotificationSafe(settings.githubTokenRef, notification, settings.rules))
  );

  return enriched;
}

export async function loadDebugNotificationProbe(): Promise<NotificationProbeSnapshot[]> {
  const settings = getSettings();
  return github.debugFetchNotificationProbe(settings.githubTokenRef);
}

export async function testGithubConnection(): Promise<string> {
  const settings = getSettings();
  return github.testConnection(settings.githubTokenRef);
}

export async function testSlackConnection(): Promise<string> {
  const settings = getSettings();
  return slack.testConnection(settings.slackTokenRef);
}

export async function sendSlackDebugEvent(type: SlackDebugEventType): Promise<string> {
  const settings = getSettings();
  const now = new Date().toISOString();
  const subjectTitle = "feat(kiki): notification mapping cleanup";
  const repo = "kiki/demo";

  const sampleByType: Record<SlackDebugEventType, GitHubNotification> = {
    review_request: {
      id: "debug:review_request",
      reason: "review_requested",
      updatedAt: now,
      occurredAt: now,
      repositoryFullName: repo,
      subjectType: "PullRequest",
      subjectTitle,
      targetUrl: "https://github.com/octocat/Hello-World/pull/1347",
      actorLogin: "teammate-alice",
      category: "review_request",
      isReviewRequest: true,
      isDirectReviewRequest: true,
      isTeamReviewRequest: false,
      isPersonalPrActivity: false
    },
    comment: {
      id: "debug:comment",
      reason: "comment",
      updatedAt: now,
      occurredAt: now,
      repositoryFullName: repo,
      subjectType: "PullRequest",
      subjectTitle,
      targetUrl: "https://github.com/octocat/Hello-World/pull/1347#issuecomment-1",
      actorLogin: "teammate-bob",
      category: "comment",
      previewText: "Can we split this into two commits? The migration and runtime change are hard to review together.",
      isPersonalPrActivity: true
    },
    review_approved: {
      id: "debug:review_approved",
      reason: "review_approved",
      updatedAt: now,
      occurredAt: now,
      repositoryFullName: repo,
      subjectType: "PullRequest",
      subjectTitle,
      targetUrl: "https://github.com/octocat/Hello-World/pull/1347#pullrequestreview-1",
      actorLogin: "teammate-carol",
      category: "review_approved",
      previewText: "Approved",
      isPersonalPrActivity: true
    },
    review_changes_requested: {
      id: "debug:review_changes_requested",
      reason: "review_changes_requested",
      updatedAt: now,
      occurredAt: now,
      repositoryFullName: repo,
      subjectType: "PullRequest",
      subjectTitle,
      targetUrl: "https://github.com/octocat/Hello-World/pull/1347#pullrequestreview-2",
      actorLogin: "teammate-dan",
      category: "review_changes_requested",
      previewText: "Requested changes",
      isPersonalPrActivity: true
    },
    review_commented: {
      id: "debug:review_commented",
      reason: "review_commented",
      updatedAt: now,
      occurredAt: now,
      repositoryFullName: repo,
      subjectType: "PullRequest",
      subjectTitle,
      targetUrl: "https://github.com/octocat/Hello-World/pull/1347#pullrequestreview-3",
      actorLogin: "teammate-erin",
      category: "review_commented",
      previewText: "Please extract this condition into a named helper; the intent is hard to parse in-line.",
      isPersonalPrActivity: true
    }
  };

  const sample = sampleByType[type];
  const text = github.formatSlackMessage(sample);
  await slack.sendMessage(settings.slackTokenRef, settings.slackUserId, text);
  return `Sent Slack test: ${type}`;
}

export async function updateTrayState(
  theme: "light" | "dark",
  focusMode: "all" | "calm" | "focused" | "zen",
  animating: boolean
): Promise<void> {
  try {
    await invoke("set_tray_state", { theme, focusMode, focus_mode: focusMode, animating });
  } catch {
    // No-op in browser mode or if tray update command is unavailable.
  }
}

export async function quitApp(): Promise<void> {
  try {
    await invoke("quit_app");
  } catch {
    // No-op in browser mode or if quit command is unavailable.
  }
}

async function enrichNotificationSafe(
  tokenRef: string,
  notification: GitHubNotification,
  rules: ReturnType<typeof getSettings>["rules"]
): Promise<GitHubNotification> {
  let next = notification;
  try {
    next = await github.enrichNotification(tokenRef, notification);
  } catch {
    // Best-effort enrichment must not block refresh.
  }

  const decision = getDeliveryDecision(next, rules);
  return {
    ...next,
    delivered: decision.action === "deliver",
    decisionReason: decision.reason
  } satisfies GitHubNotification;
}
