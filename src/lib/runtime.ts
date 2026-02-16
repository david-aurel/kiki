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

export async function saveSecret(name: string, value: string): Promise<void> {
  await secrets.set(name, value);
}

export async function syncNow(): Promise<{ scanned: number; delivered: number; suppressed: number; skipped: number }> {
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
  const picked = notifications.slice(0, Math.max(limit, 1));
  const enriched = await Promise.all(
    picked.map(async (notification) => {
      let next = await github.enrichNotification(settings.githubTokenRef, notification);
      if (!next.latestCommentActor && next.latestCommentUrl) {
        const actor = await github.resolveLatestCommentActor(settings.githubTokenRef, next);
        if (actor) next = { ...next, latestCommentActor: actor };
      }
      const decision = getDeliveryDecision(next, settings.rules);
      return {
        ...next,
        delivered: decision.action === "deliver",
        decisionReason: decision.reason
      } satisfies GitHubNotification;
    })
  );

  return enriched;
}

export async function testGithubConnection(): Promise<string> {
  const settings = getSettings();
  return github.testConnection(settings.githubTokenRef);
}

export async function testSlackConnection(): Promise<string> {
  const settings = getSettings();
  return slack.testConnection(settings.slackTokenRef);
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
