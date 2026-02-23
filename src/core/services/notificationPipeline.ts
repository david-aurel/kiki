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
  failed: number;
}

export async function runNotificationPipeline(
  deps: { github: GitHubPort; slack: SlackPort; store: StorePort },
  input: PipelineInput
): Promise<PipelineResult> {
  const notifications = await deps.github.fetchNotifications(input.githubTokenRef);

  let delivered = 0;
  let suppressed = 0;
  let skipped = 0;
  let failed = 0;

  for (const notification of notifications) {
    const key = deliveryKey(input.userId, notification);
    if (await deps.store.hasProcessedKey(key)) {
      skipped += 1;
      continue;
    }

    try {
      const result = await processNotification(deps, input, notification, key);
      if (result === "deliver") delivered += 1;
      else suppressed += 1;
    } catch {
      // Keep sync progressing even if one delivery attempt fails.
      // Failed items are not marked processed and will be retried on next sync.
      failed += 1;
    }
  }

  return { scanned: notifications.length, delivered, suppressed, skipped, failed };
}

async function processNotification(
  deps: { github: GitHubPort; slack: SlackPort; store: StorePort },
  input: PipelineInput,
  notification: GitHubNotification,
  key: string
): Promise<"deliver" | "suppress"> {
  const enriched = notification;
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
