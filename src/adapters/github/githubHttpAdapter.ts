import type { NotificationCategory, PullRequestSnapshot } from "../../core/models/types";
import { ciRollupFromStatuses } from "../../core/rules/classifiers";
import { parseEstimate } from "../../core/rules/estimateParser";
import type { GitHubPort } from "../../ports/github";
import type { GitHubNotification } from "../../core/models/types";
import type { SecretsPort } from "../../ports/secrets";
import { invoke } from "@tauri-apps/api/core";

const GITHUB_API = "https://api.github.com";
const EXCLUDED_ACTORS = new Set(["prosperity-bot", "ps-bot"]);

function runningInTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface SearchItem {
  id: number;
  number: number;
  pull_request?: { url: string };
}

interface NotificationApi {
  id: string;
  reason: string;
  updated_at: string;
  repository: { full_name: string };
  subject: { type: string; title: string; url?: string; latest_comment_url?: string };
}

interface PullRequestApi {
  id: number;
  number: number;
  title: string;
  html_url: string;
  draft: boolean;
  state: string;
  created_at: string;
  updated_at: string;
  additions: number;
  deletions: number;
  changed_files: number;
  body: string | null;
  user: { login: string; avatar_url?: string };
  head: { sha: string };
  base: { repo: { full_name: string } };
  requested_reviewers?: Array<{ login: string }>;
  requested_teams?: Array<{ slug?: string; name?: string }>;
}

interface ReviewApi {
  id?: number;
  html_url?: string;
  user: { login: string; avatar_url?: string };
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | string;
  submitted_at?: string;
}

interface SubjectApi {
  html_url?: string;
  updated_at?: string;
  user?: { login?: string; avatar_url?: string };
  requested_reviewers?: Array<{ login?: string }>;
  requested_teams?: Array<{ slug?: string; name?: string }>;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface GraphqlMyPrActivityCoreData {
  viewer: {
    login: string;
    pullRequests: {
      nodes: Array<{
        id: string;
        number: number;
        title: string;
        url: string;
        updatedAt: string;
        repository: { nameWithOwner: string };
        comments: {
          nodes: Array<{
            id: string;
            bodyText?: string | null;
            createdAt?: string | null;
            updatedAt?: string | null;
            url: string;
            author?: { login?: string | null; avatarUrl?: string | null } | null;
          }>;
        };
        reviews: {
          nodes: Array<{
            id: string;
            state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | string;
            submittedAt?: string | null;
            updatedAt?: string | null;
            url?: string | null;
            bodyText?: string | null;
            author?: { login?: string | null; avatarUrl?: string | null } | null;
          }>;
        };
      }>;
    };
  };
}

interface GraphqlMyPrThreadCommentsData {
  viewer: {
    pullRequests: {
      nodes: Array<{
        id: string;
        title: string;
        url: string;
        updatedAt: string;
        repository: { nameWithOwner: string };
        reviewThreads: {
          nodes: Array<{
            comments: {
              nodes: Array<{
                id: string;
                bodyText?: string | null;
                createdAt?: string | null;
                updatedAt?: string | null;
                url?: string | null;
                author?: { login?: string | null; avatarUrl?: string | null } | null;
                pullRequestReview?: {
                  id: string;
                  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | string;
                  submittedAt?: string | null;
                  updatedAt?: string | null;
                  url?: string | null;
                  bodyText?: string | null;
                  author?: { login?: string | null; avatarUrl?: string | null } | null;
                } | null;
              }>;
            };
          }>;
        };
      }>;
    };
  };
}

export class GitHubHttpAdapter implements GitHubPort {
  constructor(private readonly secrets: SecretsPort) {}

  async fetchNotifications(tokenRef: string): Promise<GitHubNotification[]> {
    const token = await this.requireToken(tokenRef);
    const [reviewRequestsResult, personalActivityResult] = await Promise.allSettled([
      this.fetchReviewRequestNotifications(token),
      this.fetchMyPrActivityNotifications(token)
    ]);

    const mergedById = new Map<string, GitHubNotification>();

    if (reviewRequestsResult.status === "fulfilled") {
      for (const notification of reviewRequestsResult.value) {
        const existing = mergedById.get(notification.id);
        if (!existing || new Date(notification.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
          mergedById.set(notification.id, notification);
        }
      }
    }

    if (personalActivityResult.status === "fulfilled") {
      for (const notification of personalActivityResult.value) {
        const existing = mergedById.get(notification.id);
        if (!existing || new Date(notification.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
          mergedById.set(notification.id, notification);
        }
      }
    }

    if (mergedById.size === 0) {
      const errors: string[] = [];
      if (reviewRequestsResult.status === "rejected") {
        errors.push(`review_requests_source:${reviewRequestsResult.reason instanceof Error ? reviewRequestsResult.reason.message : String(reviewRequestsResult.reason)}`);
      }
      if (personalActivityResult.status === "rejected") {
        errors.push(`my_pr_activity_source:${personalActivityResult.reason instanceof Error ? personalActivityResult.reason.message : String(personalActivityResult.reason)}`);
      }
      throw new Error(errors.join(" | ") || "No notifications available from any source");
    }

    return [...mergedById.values()]
      .filter((notification) => !this.isExcludedActor(notification.actorLogin || notification.latestCommentActor))
      .sort(
        (a, b) =>
          new Date(b.occurredAt || b.updatedAt).getTime() -
          new Date(a.occurredAt || a.updatedAt).getTime()
      );
  }

  async debugFetchNotificationProbe(tokenRef: string): Promise<Array<{
    label: string;
    count: number;
    latestUpdatedAt: string | null;
    top: Array<{ id: string; reason: string; updatedAt: string; title: string; repo: string }>;
    error?: string;
  }>> {
    const token = await this.requireToken(tokenRef);
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const requestStamp = Date.now();
    const queries = [
      { label: "all=false p1", path: `/notifications?all=false&per_page=50&page=1&_kiki_ts=${requestStamp}` },
      { label: "all=true p1", path: `/notifications?all=true&per_page=50&page=1&_kiki_ts=${requestStamp}` },
      { label: "all=true p2", path: `/notifications?all=true&per_page=50&page=2&_kiki_ts=${requestStamp}` },
      { label: "all=true participating=true p1", path: `/notifications?all=true&participating=true&per_page=50&page=1&_kiki_ts=${requestStamp}` },
      { label: "all=true since24h p1", path: `/notifications?all=true&since=${encodeURIComponent(since24h)}&per_page=50&page=1&_kiki_ts=${requestStamp}` },
      { label: "all=true participating=true since24h p1", path: `/notifications?all=true&participating=true&since=${encodeURIComponent(since24h)}&per_page=50&page=1&_kiki_ts=${requestStamp}` }
    ];

    const snapshots = await Promise.all(
      queries.map(async (query) => {
        try {
          const rows = await this.fetchJson<NotificationApi[]>(token, query.path);
          const sorted = [...rows].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          return {
            label: query.label,
            count: rows.length,
            latestUpdatedAt: sorted[0]?.updated_at || null,
            top: sorted.slice(0, 8).map((row) => ({
              id: row.id,
              reason: row.reason,
              updatedAt: row.updated_at,
              title: row.subject.title,
              repo: row.repository.full_name
            }))
          };
        } catch (error) {
          return {
            label: query.label,
            count: 0,
            latestUpdatedAt: null,
            top: [],
            error: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );

    try {
      const gqlRows = await this.fetchMyPrActivityNotifications(token);
      snapshots.push({
        label: "graphql my_pr_activity",
        count: gqlRows.length,
        latestUpdatedAt: gqlRows[0]?.occurredAt || gqlRows[0]?.updatedAt || null,
        top: gqlRows.slice(0, 8).map((row) => ({
          id: row.id,
          reason: row.reason,
          updatedAt: row.occurredAt || row.updatedAt,
          title: row.subjectTitle,
          repo: row.repositoryFullName
        }))
      });
    } catch (error) {
      snapshots.push({
        label: "graphql my_pr_activity",
        count: 0,
        latestUpdatedAt: null,
        top: [],
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return snapshots;
  }

  async resolveLatestCommentActor(tokenRef: string, notification: GitHubNotification): Promise<string | null> {
    if (!notification.latestCommentUrl) return null;

    const token = await this.requireToken(tokenRef);
    try {
      const payload = await this.fetchJson<{ user?: { login?: string } }>(token, notification.latestCommentUrl);
      return payload.user?.login || null;
    } catch {
      return null;
    }
  }

  async enrichNotification(tokenRef: string, notification: GitHubNotification): Promise<GitHubNotification> {
    let next: GitHubNotification = {
      ...notification,
      category: notification.category || this.categoryFromReason(notification.reason),
      occurredAt: notification.occurredAt || notification.updatedAt
    };

    if (notification.id.startsWith("gql:")) {
      return next;
    }

    if (next.category === "review_request" && notification.subjectUrl) {
      const token = await this.requireToken(tokenRef);
      try {
        const payload = await this.fetchJson<SubjectApi>(token, notification.subjectUrl);
        next = {
          ...next,
          category: "review_request",
          targetUrl: payload.html_url || next.targetUrl || this.mapApiSubjectUrlToHtml(notification.subjectUrl),
          actorLogin: payload.user?.login || next.actorLogin,
          actorAvatarUrl: payload.user?.avatar_url || next.actorAvatarUrl,
          occurredAt: payload.updated_at || next.occurredAt
        };
      } catch {
        // Best-effort enrichment only; keep notification visible.
      }
    }

    if (!next.targetUrl) {
      const resolved = await this.resolveNotificationTargetUrl(tokenRef, next);
      if (resolved) next = { ...next, targetUrl: resolved };
    }

    return next;
  }

  async resolveNotificationTargetUrl(tokenRef: string, notification: GitHubNotification): Promise<string | null> {
    if (notification.targetUrl) {
      return notification.targetUrl;
    }

    if (notification.subjectUrl) {
      const token = await this.requireToken(tokenRef);
      try {
        const payload = await this.fetchJson<{ html_url?: string }>(token, notification.subjectUrl);
        if (payload.html_url) return payload.html_url;
      } catch {
        const mapped = this.mapApiSubjectUrlToHtml(notification.subjectUrl);
        if (mapped) return mapped;
      }
    }

    return null;
  }

  private async fetchReviewRequestNotifications(token: string): Promise<GitHubNotification[]> {
    const allById = new Map<string, NotificationApi>();
    const requestStamp = Date.now();
    const scopes = ["", "participating=true"];

    for (const scope of scopes) {
      for (let page = 1; page <= 3; page += 1) {
        const queryBits = ["all=true", scope, "per_page=50", `page=${page}`, `_kiki_ts=${requestStamp}`].filter(Boolean).join("&");
        const payload = await this.fetchJson<NotificationApi[]>(token, `/notifications?${queryBits}`);
        if (payload.length === 0) break;

        for (const item of payload) {
          if (item.reason !== "review_requested") continue;
          const existing = allById.get(item.id);
          if (!existing || new Date(item.updated_at).getTime() > new Date(existing.updated_at).getTime()) {
            allById.set(item.id, item);
          }
        }

        if (payload.length < 50) break;
      }
    }

    const viewerLogin = (await this.fetchViewerLogin(token)).toLowerCase();
    const requestMetaCache = new Map<string, { isDirect: boolean; isTeam: boolean }>();

    const resolveRequestMeta = async (subjectUrl?: string): Promise<{ isDirect: boolean; isTeam: boolean }> => {
      if (!subjectUrl) return { isDirect: false, isTeam: false };
      const cached = requestMetaCache.get(subjectUrl);
      if (cached) return cached;

      try {
        const payload = await this.fetchJson<SubjectApi>(token, subjectUrl);
        const isDirect = (payload.requested_reviewers || []).some(
          (reviewer) => reviewer.login?.toLowerCase() === viewerLogin
        );
        const isTeam = (payload.requested_teams || []).length > 0;
        const meta = { isDirect, isTeam };
        requestMetaCache.set(subjectUrl, meta);
        return meta;
      } catch {
        const meta = { isDirect: false, isTeam: false };
        requestMetaCache.set(subjectUrl, meta);
        return meta;
      }
    };

    const rows = await Promise.all(
      [...allById.values()].map(async (item) => {
        const meta = await resolveRequestMeta(item.subject.url);
        return {
          id: item.id,
          reason: item.reason,
          updatedAt: item.updated_at,
          occurredAt: item.updated_at,
          repositoryFullName: item.repository.full_name,
          subjectType: item.subject.type,
          subjectTitle: item.subject.title,
          subjectUrl: item.subject.url,
          latestCommentUrl: item.subject.latest_comment_url,
          targetUrl: this.mapApiSubjectUrlToHtml(item.subject.url),
          category: "review_request" as const,
          isPersonalPrActivity: false,
          isReviewRequest: true,
          isDirectReviewRequest: meta.isDirect,
          isTeamReviewRequest: meta.isTeam,
          isDirectMention: false,
          isCiStateChange: false
        } satisfies GitHubNotification;
      })
    );

    return rows;
  }

  private async fetchMyPrActivityNotifications(token: string): Promise<GitHubNotification[]> {
    const corePayload = await this.fetchMyPrActivityCore(token);
    const threadPayload = await this.fetchMyPrThreadComments(token);

    const viewerLogin = corePayload.viewer.login.toLowerCase();
    const events: GitHubNotification[] = [];

    for (const pr of corePayload.viewer.pullRequests.nodes || []) {
      for (const comment of pr.comments.nodes || []) {
        const actorLogin = comment.author?.login || undefined;
        if (!actorLogin || actorLogin.toLowerCase() === viewerLogin) continue;
        if (this.isExcludedActor(actorLogin)) continue;

        const occurredAt = comment.createdAt || comment.updatedAt || pr.updatedAt;
        const updatedAt = comment.updatedAt || comment.createdAt || pr.updatedAt;
        const preview = comment.bodyText?.replace(/\s+/g, " ").trim().slice(0, 140);

        events.push({
          id: `gql:issue_comment:${comment.id}`,
          reason: "comment",
          updatedAt,
          occurredAt,
          repositoryFullName: pr.repository.nameWithOwner,
          subjectType: "PullRequest",
          subjectTitle: pr.title,
          targetUrl: comment.url || pr.url,
          actorLogin,
          actorAvatarUrl: comment.author?.avatarUrl || undefined,
          latestCommentActor: actorLogin,
          previewText: preview,
          category: "comment",
          isPersonalPrActivity: true,
          isReviewRequest: false,
          isDirectMention: false,
          isCiStateChange: false
        });
      }

      for (const review of pr.reviews.nodes || []) {
        const actorLogin = review.author?.login || undefined;
        if (!actorLogin || actorLogin.toLowerCase() === viewerLogin) continue;
        if (this.isExcludedActor(actorLogin)) continue;

        const mapped = this.reviewStateCategory(review.state);
        if (!mapped) continue;

        const occurredAt = review.submittedAt || review.updatedAt || pr.updatedAt;
        const updatedAt = review.updatedAt || review.submittedAt || pr.updatedAt;
        const previewBody = review.bodyText?.replace(/\s+/g, " ").trim().slice(0, 140);
        const previewText = previewBody || mapped.previewText;

        events.push({
          id: `gql:review:${review.id}`,
          reason: mapped.category,
          updatedAt,
          occurredAt,
          repositoryFullName: pr.repository.nameWithOwner,
          subjectType: "PullRequest",
          subjectTitle: pr.title,
          targetUrl: review.url || pr.url,
          actorLogin,
          actorAvatarUrl: review.author?.avatarUrl || undefined,
          latestCommentActor: actorLogin,
          previewText,
          category: mapped.category,
          isPersonalPrActivity: true,
          isReviewRequest: false,
          isDirectMention: false,
          isCiStateChange: false
        });
      }
    }

    if (threadPayload) {
      for (const pr of threadPayload.viewer.pullRequests.nodes || []) {
        const emittedReviewIds = new Set<string>(
          events
            .filter((event) => event.id.startsWith("gql:review:"))
            .map((event) => event.id.replace("gql:review:", ""))
        );

        for (const thread of pr.reviewThreads.nodes || []) {
          for (const comment of thread.comments.nodes || []) {
            const actorLogin = comment.author?.login || undefined;
            if (!actorLogin || actorLogin.toLowerCase() === viewerLogin) continue;
            if (this.isExcludedActor(actorLogin)) continue;

            // Review comments that belong to an explicit review should collapse
            // into a single review notification (one per review id).
            const linkedReview = comment.pullRequestReview;
            const linkedReviewId = linkedReview?.id;
            if (linkedReviewId) {
              const commentPreview = comment.bodyText?.replace(/\s+/g, " ").trim().slice(0, 140);
              if (!emittedReviewIds.has(linkedReviewId)) {
                const reviewActorLogin = linkedReview.author?.login || actorLogin;
                if (
                  reviewActorLogin &&
                  reviewActorLogin.toLowerCase() !== viewerLogin &&
                  !this.isExcludedActor(reviewActorLogin)
                ) {
                  const mapped = this.reviewStateCategory(linkedReview.state);
                  if (mapped) {
                    const reviewOccurredAt = linkedReview.submittedAt || linkedReview.updatedAt || comment.createdAt || comment.updatedAt || pr.updatedAt;
                    const reviewUpdatedAt = linkedReview.updatedAt || linkedReview.submittedAt || comment.updatedAt || comment.createdAt || pr.updatedAt;
                    const previewBody = linkedReview.bodyText?.replace(/\s+/g, " ").trim().slice(0, 140);
                    events.push({
                      id: `gql:review:${linkedReviewId}`,
                      reason: mapped.category,
                      updatedAt: reviewUpdatedAt,
                      occurredAt: reviewOccurredAt,
                      repositoryFullName: pr.repository.nameWithOwner,
                      subjectType: "PullRequest",
                      subjectTitle: pr.title,
                      targetUrl: linkedReview.url || comment.url || pr.url,
                      actorLogin: reviewActorLogin,
                      actorAvatarUrl: linkedReview.author?.avatarUrl || comment.author?.avatarUrl || undefined,
                      latestCommentActor: reviewActorLogin,
                      previewText: previewBody || commentPreview || mapped.previewText,
                      category: mapped.category,
                      isPersonalPrActivity: true,
                      isReviewRequest: false,
                      isDirectMention: false,
                      isCiStateChange: false
                    });
                    emittedReviewIds.add(linkedReviewId);
                  }
                }
              } else if (commentPreview) {
                const reviewNotificationId = `gql:review:${linkedReviewId}`;
                const existingReview = events.find((event) => event.id === reviewNotificationId);
                const isGenericCommentReviewText = existingReview?.previewText === "Commented in a review";
                if (existingReview?.category === "review_commented" && isGenericCommentReviewText) {
                  existingReview.previewText = commentPreview;
                  if (comment.url) {
                    existingReview.targetUrl = comment.url;
                  }
                }
              }

              // Never emit additional comment notifications for comments
              // that are part of a review.
              continue;
            }

            const occurredAt = comment.createdAt || comment.updatedAt || pr.updatedAt;
            const updatedAt = comment.updatedAt || comment.createdAt || pr.updatedAt;
            const preview = comment.bodyText?.replace(/\s+/g, " ").trim().slice(0, 140);

            events.push({
              id: `gql:review_thread_comment:${comment.id}`,
              reason: "comment",
              updatedAt,
              occurredAt,
              repositoryFullName: pr.repository.nameWithOwner,
              subjectType: "PullRequest",
              subjectTitle: pr.title,
              targetUrl: comment.url || pr.url,
              actorLogin,
              actorAvatarUrl: comment.author?.avatarUrl || undefined,
              latestCommentActor: actorLogin,
              previewText: preview,
              category: "comment",
              isPersonalPrActivity: true,
              isReviewRequest: false,
              isDirectMention: false,
              isCiStateChange: false
            });
          }
        }
      }
    }

    const byId = new Map<string, GitHubNotification>();
    for (const event of events) {
      const existing = byId.get(event.id);
      if (!existing || new Date(event.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
        byId.set(event.id, event);
      }
    }

    return [...byId.values()].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  private async fetchMyPrActivityCore(token: string): Promise<GraphqlMyPrActivityCoreData> {
    const queryLast = `
      query KikiMyPrActivityCore($prFirst: Int!, $commentLast: Int!, $reviewLast: Int!) {
        viewer {
          login
          pullRequests(first: $prFirst, states: [OPEN, MERGED], orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes {
              id
              number
              title
              url
              updatedAt
              repository { nameWithOwner }
              comments(last: $commentLast) {
                nodes {
                  id
                  bodyText
                  createdAt
                  updatedAt
                  url
                  author { login avatarUrl }
                }
              }
              reviews(last: $reviewLast) {
                nodes {
                  id
                  state
                  submittedAt
                  updatedAt
                  url
                  bodyText
                  author { login avatarUrl }
                }
              }
            }
          }
        }
      }
    `;

    const queryFirst = `
      query KikiMyPrActivityCoreFallback($prFirst: Int!, $commentFirst: Int!, $reviewFirst: Int!) {
        viewer {
          login
          pullRequests(first: $prFirst, states: [OPEN, MERGED], orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes {
              id
              number
              title
              url
              updatedAt
              repository { nameWithOwner }
              comments(first: $commentFirst) {
                nodes {
                  id
                  bodyText
                  createdAt
                  updatedAt
                  url
                  author { login avatarUrl }
                }
              }
              reviews(first: $reviewFirst) {
                nodes {
                  id
                  state
                  submittedAt
                  updatedAt
                  url
                  bodyText
                  author { login avatarUrl }
                }
              }
            }
          }
        }
      }
    `;

    try {
      return await this.fetchGraphql<GraphqlMyPrActivityCoreData>(token, queryLast, {
        prFirst: 30,
        commentLast: 40,
        reviewLast: 40
      });
    } catch {
      return this.fetchGraphql<GraphqlMyPrActivityCoreData>(token, queryFirst, {
        prFirst: 30,
        commentFirst: 40,
        reviewFirst: 40
      });
    }
  }

  private async fetchMyPrThreadComments(token: string): Promise<GraphqlMyPrThreadCommentsData | null> {
    const queryLast = `
      query KikiMyPrThreadComments($prFirst: Int!, $threadLast: Int!, $threadCommentLast: Int!) {
        viewer {
          pullRequests(first: $prFirst, states: [OPEN, MERGED], orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes {
              id
              title
              url
              updatedAt
              repository { nameWithOwner }
              reviewThreads(last: $threadLast) {
                nodes {
                  comments(last: $threadCommentLast) {
                    nodes {
                      id
                      bodyText
                      createdAt
                      updatedAt
                      url
                      author { login avatarUrl }
                      pullRequestReview {
                        id
                        state
                        submittedAt
                        updatedAt
                        url
                        bodyText
                        author { login avatarUrl }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const queryFirst = `
      query KikiMyPrThreadCommentsFallback($prFirst: Int!, $threadFirst: Int!, $threadCommentFirst: Int!) {
        viewer {
          pullRequests(first: $prFirst, states: [OPEN, MERGED], orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes {
              id
              title
              url
              updatedAt
              repository { nameWithOwner }
              reviewThreads(first: $threadFirst) {
                nodes {
                  comments(first: $threadCommentFirst) {
                    nodes {
                      id
                      bodyText
                      createdAt
                      updatedAt
                      url
                      author { login avatarUrl }
                      pullRequestReview {
                        id
                        state
                        submittedAt
                        updatedAt
                        url
                        bodyText
                        author { login avatarUrl }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      return await this.fetchGraphql<GraphqlMyPrThreadCommentsData>(token, queryLast, {
        prFirst: 30,
        threadLast: 40,
        threadCommentLast: 40
      });
    } catch {
      try {
        return await this.fetchGraphql<GraphqlMyPrThreadCommentsData>(token, queryFirst, {
          prFirst: 30,
          threadFirst: 40,
          threadCommentFirst: 40
        });
      } catch {
        return null;
      }
    }
  }

  async fetchMyOpenPrs(tokenRef: string): Promise<PullRequestSnapshot[]> {
    const token = await this.requireToken(tokenRef);
    const login = await this.fetchViewerLogin(token);
    const query = `is:open is:pr author:${login} archived:false`;
    const items = await this.searchPullRequests(token, query);
    return this.hydrateSnapshots(token, items, { requestOrigin: undefined, requestedBy: undefined });
  }

  async fetchReviewRequests(tokenRef: string, teamHandles: string[]): Promise<PullRequestSnapshot[]> {
    const token = await this.requireToken(tokenRef);
    const login = await this.fetchViewerLogin(token);

    const resultById = new Map<number, { item: SearchItem; requestedBy?: string; requestOrigin?: "direct" | "team" }>();

    const direct = await this.searchPullRequests(token, `is:open is:pr review-requested:${login} archived:false`);
    for (const item of direct) {
      resultById.set(item.id, { item, requestOrigin: "direct", requestedBy: login });
    }

    for (const team of teamHandles) {
      const teamResults = await this.searchPullRequests(token, `is:open is:pr team-review-requested:${team} archived:false`);
      for (const item of teamResults) {
        if (!resultById.has(item.id)) {
          resultById.set(item.id, { item, requestOrigin: "team", requestedBy: team });
        }
      }
    }

    const hydrated = await Promise.all(
      [...resultById.values()].map(async (entry) => {
        const [snapshot] = await this.hydrateSnapshots(token, [entry.item], {
          viewerLogin: login,
          requestOrigin: entry.requestOrigin,
          requestedBy: entry.requestedBy
        });
        return snapshot;
      })
    );

    return hydrated.filter((x): x is PullRequestSnapshot => Boolean(x));
  }

  async testConnection(tokenRef: string): Promise<string> {
    const token = await this.requireToken(tokenRef);
    return this.fetchViewerLogin(token);
  }

  formatSlackMessage(notification: GitHubNotification): string {
    const category = notification.category || this.categoryFromReason(notification.reason);
    const actor = notification.actorLogin ? `@${notification.actorLogin}` : "Someone";
    const url = notification.targetUrl || notification.subjectUrl || "";
    const title = this.truncate(notification.subjectTitle, 120);
    const detail = notification.previewText ? this.truncate(notification.previewText, 180) : undefined;
    const header = `${this.categoryEmoji(category)} *${this.slackCategoryLabel(category)}*`;

    const body = (() => {
      if (category === "review_request") {
        return `${actor} requested your review on *${title}*`;
      }
      if (category === "comment") {
        return detail ? `${actor}: ${detail}` : `${actor} commented on *${title}*`;
      }
      if (category === "review_approved") {
        return `${actor} approved *${title}*`;
      }
      if (category === "review_changes_requested") {
        return `${actor} requested changes on *${title}*`;
      }
      if (category === "review_commented") {
        return detail ? `${actor} reviewed *${title}*: ${detail}` : `${actor} reviewed *${title}*`;
      }
      return detail ? `${detail}` : title;
    })();

    return [header, body, `Repo: ${notification.repositoryFullName}`, url ? `<${url}|Open on GitHub>` : ""]
      .filter(Boolean)
      .join("\n");
  }

  private async requireToken(tokenRef: string): Promise<string> {
    const token = await this.secrets.get(tokenRef);
    if (!token) throw new Error(`Missing GitHub token for ref '${tokenRef}'`);
    return token;
  }

  private headers(token: string): HeadersInit {
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "User-Agent": "kiki"
    };
  }

  private normalizeApiPath(pathOrUrl: string): string {
    if (pathOrUrl.startsWith(GITHUB_API)) {
      return pathOrUrl.slice(GITHUB_API.length);
    }
    return pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  }

  private async fetchJson<T>(token: string, pathOrUrl: string): Promise<T> {
    const path = this.normalizeApiPath(pathOrUrl);

    if (runningInTauri()) {
      return invoke<T>("github_api_get", { token, path });
    }

    const response = await fetch(`${GITHUB_API}${path}`, {
      headers: this.headers(token),
      cache: "no-store"
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${body}`);
    }

    return response.json() as Promise<T>;
  }

  private async fetchGraphql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
    if (runningInTauri()) {
      const payload = await invoke<GraphqlResponse<T>>("github_api_graphql", { token, query, variables });
      if (payload.errors?.length) {
        throw new Error(`GitHub GraphQL query error: ${payload.errors.map((x) => x.message).join(" | ")}`);
      }
      if (!payload.data) {
        throw new Error("GitHub GraphQL returned no data");
      }
      return payload.data;
    }

    const response = await fetch(`${GITHUB_API}/graphql`, {
      method: "POST",
      headers: {
        ...this.headers(token),
        "Content-Type": "application/json"
      },
      cache: "no-store",
      body: JSON.stringify({ query, variables })
    });

    const payload = await response.json() as GraphqlResponse<T>;
    if (!response.ok) {
      const errors = (payload.errors || []).map((x) => x.message).join(" | ");
      throw new Error(`GitHub GraphQL error (${response.status}): ${errors || "unknown_error"}`);
    }

    if (payload.errors?.length) {
      throw new Error(`GitHub GraphQL query error: ${payload.errors.map((x) => x.message).join(" | ")}`);
    }
    if (!payload.data) {
      throw new Error("GitHub GraphQL returned no data");
    }

    return payload.data;
  }

  private async fetchViewerLogin(token: string): Promise<string> {
    const payload = await this.fetchJson<{ login: string }>(token, "/user");
    return payload.login;
  }

  private async searchPullRequests(token: string, q: string): Promise<SearchItem[]> {
    const encoded = encodeURIComponent(q);
    const payload = await this.fetchJson<{ items: SearchItem[] }>(token, `/search/issues?q=${encoded}&sort=updated&order=desc&per_page=20`);
    return payload.items.filter((item) => item.pull_request?.url);
  }

  private async hydrateSnapshots(
    token: string,
    items: SearchItem[],
    overrides: { viewerLogin?: string; requestOrigin?: "direct" | "team"; requestedBy?: string }
  ): Promise<PullRequestSnapshot[]> {
    return Promise.all(
      items.map(async (item) => {
        if (!item.pull_request?.url) return null;

        const pr = await this.fetchPullRequest(token, item.pull_request.url);
        const [reviews, ci] = await Promise.all([
          this.fetchReviews(token, item.pull_request.url),
          this.fetchCiData(token, pr.base.repo.full_name, pr.head.sha)
        ]);

        const reviewerMap = new Map<string, { state: "approved" | "changes_requested" | "commented"; avatarUrl?: string }>();
        reviews
          .sort((a, b) => (new Date(a.submitted_at || 0).getTime() - new Date(b.submitted_at || 0).getTime()))
          .forEach((review) => {
            if (!review.user?.login) return;
            if (review.state === "APPROVED") reviewerMap.set(review.user.login, { state: "approved", avatarUrl: review.user.avatar_url });
            else if (review.state === "CHANGES_REQUESTED") reviewerMap.set(review.user.login, { state: "changes_requested", avatarUrl: review.user.avatar_url });
            else reviewerMap.set(review.user.login, { state: "commented", avatarUrl: review.user.avatar_url });
          });

        const estimate = parseEstimate(pr.body || "");

        const state = pr.draft ? "draft" : "ready";
        const snapshot: PullRequestSnapshot = {
          id: String(pr.id),
          repo: pr.base.repo.full_name,
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          author: pr.user.login,
          authorAvatarUrl: pr.user.avatar_url,
          state,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          additions: pr.additions,
          deletions: pr.deletions,
          changedFiles: pr.changed_files,
          ciRollup: ciRollupFromStatuses(ci.states),
          ciUrl: ci.url,
          reviewers: [...reviewerMap.entries()].map(([login, review]) => ({ login, state: review.state, avatarUrl: review.avatarUrl })),
          estimateRaw: estimate.raw,
          estimateNormalized: estimate.normalized
        };

        // Prefer authoritative request origin from PR payload to correctly classify
        // codeowner/team-driven requests that may appear in review-requested search.
        const requestedReviewers = pr.requested_reviewers || [];
        const requestedTeams = pr.requested_teams || [];
        const viewer = overrides.viewerLogin?.toLowerCase();
        const isDirectForViewer = viewer
          ? requestedReviewers.some((reviewer) => reviewer.login?.toLowerCase() === viewer)
          : false;
        const hasTeamRequest = requestedTeams.length > 0;

        if (isDirectForViewer) {
          snapshot.requestOrigin = "direct";
          snapshot.requestedBy = overrides.viewerLogin;
        } else if (hasTeamRequest) {
          snapshot.requestOrigin = "team";
          snapshot.requestedBy = requestedTeams[0]?.slug || requestedTeams[0]?.name || overrides.requestedBy;
        } else {
          if (overrides.requestOrigin) snapshot.requestOrigin = overrides.requestOrigin;
          if (overrides.requestedBy) snapshot.requestedBy = overrides.requestedBy;
        }

        return snapshot;
      })
    ).then((rows) => rows.filter((row): row is PullRequestSnapshot => Boolean(row)));
  }

  private async fetchPullRequest(token: string, url: string): Promise<PullRequestApi> {
    return this.fetchJson<PullRequestApi>(token, url);
  }

  private async fetchReviews(token: string, pullRequestApiUrl: string): Promise<ReviewApi[]> {
    try {
      return await this.fetchJson<ReviewApi[]>(token, `${pullRequestApiUrl}/reviews?per_page=100`);
    } catch {
      return [];
    }
  }

  private async fetchCiData(
    token: string,
    repo: string,
    sha: string
  ): Promise<{ states: Array<"failing" | "pending" | "passing">; url?: string }> {
    const states: Array<"failing" | "pending" | "passing"> = [];
    let url: string | undefined;

    const [combinedStatus, checkRuns] = await Promise.allSettled([
      this.fetchJson<{ state: "failure" | "error" | "pending" | "success" | string; statuses?: Array<{ target_url?: string }> }>(
        token,
        `/repos/${repo}/commits/${sha}/status`
      ),
      this.fetchJson<{ check_runs: Array<{ status: string; conclusion: string | null; html_url?: string }> }>(
        token,
        `/repos/${repo}/commits/${sha}/check-runs`
      )
    ]);

    if (combinedStatus.status === "fulfilled") {
      const payload = combinedStatus.value;
      if (payload.state === "failure" || payload.state === "error") states.push("failing");
      else if (payload.state === "pending") states.push("pending");
      else if (payload.state === "success") states.push("passing");
      url = payload.statuses?.find((status) => status.target_url)?.target_url;
    }

    if (checkRuns.status === "fulfilled") {
      const payload = checkRuns.value;
      if (!url) {
        url = payload.check_runs.find((check) => check.html_url)?.html_url;
      }
      for (const check of payload.check_runs) {
        if (check.status !== "completed") {
          states.push("pending");
          continue;
        }

        if (check.conclusion === "success" || check.conclusion === "neutral" || check.conclusion === "skipped") {
          states.push("passing");
        } else {
          states.push("failing");
        }
      }
    }

    return { states, url };
  }

  private mapApiSubjectUrlToHtml(subjectUrl?: string): string | undefined {
    if (!subjectUrl) return undefined;

    const pullMatch = subjectUrl.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)$/);
    if (pullMatch) {
      return `https://github.com/${pullMatch[1]}/pull/${pullMatch[2]}`;
    }

    const issueMatch = subjectUrl.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)$/);
    if (issueMatch) {
      return `https://github.com/${issueMatch[1]}/issues/${issueMatch[2]}`;
    }

    return undefined;
  }

  private categoryFromReason(reason: string): NotificationCategory {
    if (reason === "review_requested") return "review_request";
    if (reason === "mention" || reason === "team_mention") return "comment";
    if (reason === "comment") return "comment";
    if (reason === "assign") return "assignment";
    if (reason === "ci_activity") return "ci";
    return "update";
  }

  private reviewStateCategory(state: string): { category: NotificationCategory; previewText: string } | null {
    if (state === "APPROVED") {
      return { category: "review_approved", previewText: "Approved" };
    }
    if (state === "CHANGES_REQUESTED") {
      return { category: "review_changes_requested", previewText: "Requested changes" };
    }
    if (state === "COMMENTED") {
      return { category: "review_commented", previewText: "Commented in a review" };
    }
    return null;
  }

  private slackCategoryLabel(category: NotificationCategory): string {
    if (category === "review_request") return "Review Request";
    if (category === "comment" || category === "mention") return "Comment";
    if (category === "review_approved") return "Review Approved";
    if (category === "review_changes_requested") return "Review Changes Requested";
    if (category === "review_commented") return "Review Commented";
    if (category === "assignment") return "Assignment";
    if (category === "ci") return "CI";
    return "Update";
  }

  private categoryEmoji(category: NotificationCategory): string {
    if (category === "review_request") return "👀";
    if (category === "comment" || category === "mention") return "💬";
    if (category === "review_approved") return "✅";
    if (category === "review_changes_requested") return "⛔";
    if (category === "review_commented") return "📝";
    if (category === "assignment") return "🧷";
    if (category === "ci") return "🧪";
    return "🔔";
  }

  private truncate(value: string, max: number): string {
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1).trimEnd()}…`;
  }

  private isExcludedActor(login?: string): boolean {
    if (!login) return false;
    return EXCLUDED_ACTORS.has(login.trim().toLowerCase());
  }
}
