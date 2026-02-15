import { describe, expect, it } from "vitest";
import { defaultRuleConfig } from "../core/models/defaults";
import { runNotificationPipeline } from "../core/services/notificationPipeline";
import type { GitHubPort } from "../ports/github";
import type { SlackPort } from "../ports/slack";
import type { StorePort } from "../ports/store";

function makeGithubPort(overrides?: Partial<GitHubPort>): GitHubPort {
  return {
    async fetchNotifications() {
      return [];
    },
    async resolveLatestCommentActor() {
      return null;
    },
    async enrichNotification(_tokenRef, notification) {
      return notification;
    },
    async resolveNotificationTargetUrl() {
      return null;
    },
    async fetchMyOpenPrs() {
      return [];
    },
    async fetchReviewRequests() {
      return [];
    },
    async testConnection() {
      return "ok";
    },
    formatSlackMessage() {
      return "msg";
    },
    ...overrides
  };
}

describe("notification pipeline", () => {
  it("delivers unsuppressed notifications", async () => {
    const sent: string[] = [];
    const processed = new Set<string>();

    const github = makeGithubPort({
      async fetchNotifications() {
        return [
          {
            id: "a",
            reason: "mention",
            updatedAt: "2026-02-13T00:00:00.000Z",
            repositoryFullName: "acme/kiki",
            subjectType: "PullRequest",
            subjectTitle: "Title",
            isPersonalPrActivity: true
          }
        ];
      },
      formatSlackMessage(notification) {
        return notification.subjectTitle;
      }
    });

    const slack: SlackPort = {
      async sendMessage(_tokenRef, _userId, text) {
        sent.push(text);
      },
      async testConnection() {
        return "ok";
      }
    };

    const store: StorePort = {
      async hasProcessedKey(key) {
        return processed.has(key);
      },
      async logDelivery(entry) {
        processed.add(entry.key);
      },
      async logSuppression(entry) {
        processed.add(entry.key);
      },
      async listDeliveries() {
        return [];
      },
      async listSuppressions() {
        return [];
      }
    };

    const result = await runNotificationPipeline(
      { github, slack, store },
      {
        userId: "u1",
        slackUserId: "U123",
        githubTokenRef: "gh",
        slackTokenRef: "sl",
        rules: { ...defaultRuleConfig, focusMode: "calm" }
      }
    );

    expect(result.delivered).toBe(1);
    expect(sent).toEqual(["Title"]);
  });

  it("suppresses copilot based on resolved latest actor", async () => {
    const github = makeGithubPort({
      async fetchNotifications() {
        return [
          {
            id: "b",
            reason: "comment",
            updatedAt: "2026-02-13T00:00:00.000Z",
            repositoryFullName: "acme/kiki",
            subjectType: "PullRequest",
            subjectTitle: "Title",
            latestCommentUrl: "https://api.github.com/comment/1",
            isPersonalPrActivity: true
          }
        ];
      },
      async resolveLatestCommentActor() {
        return "github-copilot[bot]";
      }
    });

    const slack: SlackPort = {
      async sendMessage() {
        throw new Error("should not send");
      },
      async testConnection() {
        return "ok";
      }
    };

    const suppressions: string[] = [];

    const store: StorePort = {
      async hasProcessedKey() {
        return false;
      },
      async logDelivery() {
        throw new Error("should not deliver");
      },
      async logSuppression(entry) {
        suppressions.push(entry.reason);
      },
      async listDeliveries() {
        return [];
      },
      async listSuppressions() {
        return [];
      }
    };

    const result = await runNotificationPipeline(
      { github, slack, store },
      {
        userId: "u1",
        slackUserId: "U123",
        githubTokenRef: "gh",
        slackTokenRef: "sl",
        rules: { ...defaultRuleConfig, focusMode: "calm" }
      }
    );

    expect(result.suppressed).toBe(1);
    expect(suppressions[0]).toBe("latest_comment_from_github_copilot_bot");
  });
});
