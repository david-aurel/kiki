export type FocusMode = "all" | "calm" | "focused" | "zen";

export type EstimateNormalized = "immediate" | "half_day" | "one_two_days" | "unknown";

export type CiRollup = "failing" | "pending" | "passing" | "none";
export type NotificationCategory =
  | "review_request"
  | "comment"
  | "mention"
  | "assignment"
  | "review_approved"
  | "review_changes_requested"
  | "review_commented"
  | "ci"
  | "update";

export interface RuleConfig {
  suppressCopilot: boolean;
  suppressedReasons: string[];
  teamHandles: string[];
  focusMode: FocusMode;
}

export interface GitHubNotification {
  id: string;
  reason: string;
  updatedAt: string;
  occurredAt?: string;
  repositoryFullName: string;
  subjectType: string;
  subjectTitle: string;
  subjectUrl?: string;
  latestCommentUrl?: string;
  latestCommentActor?: string;
  targetUrl?: string;
  actorLogin?: string;
  actorAvatarUrl?: string;
  previewText?: string;
  category?: NotificationCategory;
  delivered?: boolean;
  decisionReason?: string;
  isPersonalPrActivity?: boolean;
  isReviewRequest?: boolean;
  isDirectReviewRequest?: boolean;
  isTeamReviewRequest?: boolean;
  isDirectMention?: boolean;
  isCiStateChange?: boolean;
}

export interface PullRequestSnapshot {
  id: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  authorAvatarUrl?: string;
  state: "open" | "draft" | "ready";
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  ciRollup: CiRollup;
  ciUrl?: string;
  reviewers: Array<{ login: string; state: "approved" | "changes_requested" | "commented"; avatarUrl?: string }>;
  estimateRaw: string;
  estimateNormalized: EstimateNormalized;
  requestedBy?: string;
  requestOrigin?: "direct" | "team";
}

export interface DeliveryDecision {
  action: "deliver" | "suppress";
  reason: string;
}
