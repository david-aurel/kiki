import type { GitHubPort } from "../../ports/github";
import type { SlackPort } from "../../ports/slack";
import type { StorePort } from "../../ports/store";
import type { GitHubNotification, RuleConfig } from "../models/types";
import { getDeliveryDecision, deliveryKey } from "../rules/notificationDecision";

export interface PipelineInput {
  userId: string;
  slackUserId: string;
  githubTokenRef: string;
  slackTokenRef: string;
  rules: RuleConfig;
}

export interface PipelineResult {
  scanned: number;
  delivered: number;
  suppressed: number;
  skipped: number;
}

export async function runNotificationPipeline(
  deps: { github: GitHubPort; slack: SlackPort; store: StorePort },
  input: PipelineInput
): Promise<PipelineResult> {
  const notifications = await deps.github.fetchNotifications(input.githubTokenRef);

  let delivered = 0;
  let suppressed = 0;
  let skipped = 0;

  for (const notification of notifications) {
    const key = deliveryKey(input.userId, notification);
    if (await deps.store.hasProcessedKey(key)) {
      skipped += 1;
      continue;
    }

    await processNotification(deps, input, notification, key)
      .then((result) => {
        if (result === "deliver") delivered += 1;
        else suppressed += 1;
      });
  }

  return { scanned: notifications.length, delivered, suppressed, skipped };
}

async function processNotification(
  deps: { github: GitHubPort; slack: SlackPort; store: StorePort },
  input: PipelineInput,
  notification: GitHubNotification,
  key: string
): Promise<"deliver" | "suppress"> {
  const shouldResolveCopilotActor =
    input.rules.suppressCopilot || input.rules.focusMode === "calm" || input.rules.focusMode === "focused";
  const enriched = await maybeEnrichCopilotActor(deps.github, input.githubTokenRef, notification, shouldResolveCopilotActor);
  const decision = getDeliveryDecision(enriched, input.rules);

  if (decision.action === "suppress") {
    await deps.store.logSuppression({
      key,
      userId: input.userId,
      notificationId: notification.id,
      reason: decision.reason,
      createdAt: new Date().toISOString()
    });
    return "suppress";
  }

  const text = deps.github.formatSlackMessage(enriched);
  await deps.slack.sendMessage(input.slackTokenRef, input.slackUserId, text);
  await deps.store.logDelivery({
    key,
    userId: input.userId,
    notificationId: notification.id,
    reason: decision.reason,
    createdAt: new Date().toISOString()
  });

  return "deliver";
}

async function maybeEnrichCopilotActor(
  github: GitHubPort,
  tokenRef: string,
  notification: GitHubNotification,
  suppressCopilot: boolean
): Promise<GitHubNotification> {
  if (!suppressCopilot || notification.latestCommentActor || !notification.latestCommentUrl) {
    return notification;
  }

  const actor = await github.resolveLatestCommentActor(tokenRef, notification);
  return { ...notification, latestCommentActor: actor || undefined };
}
