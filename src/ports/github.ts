import type { GitHubNotification, PullRequestSnapshot } from "../core/models/types";

export interface GitHubPort {
  fetchNotifications(tokenRef: string): Promise<GitHubNotification[]>;
  enrichNotification(tokenRef: string, notification: GitHubNotification): Promise<GitHubNotification>;
  resolveLatestCommentActor(tokenRef: string, notification: GitHubNotification): Promise<string | null>;
  resolveNotificationTargetUrl(tokenRef: string, notification: GitHubNotification): Promise<string | null>;
  fetchMyOpenPrs(tokenRef: string): Promise<PullRequestSnapshot[]>;
  fetchReviewRequests(tokenRef: string, teamHandles: string[]): Promise<PullRequestSnapshot[]>;
  testConnection(tokenRef: string): Promise<string>;
  formatSlackMessage(notification: GitHubNotification): string;
}
