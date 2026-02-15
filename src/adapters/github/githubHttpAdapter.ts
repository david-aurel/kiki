import type { PullRequestSnapshot } from "../../core/models/types";
import { ciRollupFromStatuses } from "../../core/rules/classifiers";
import { parseEstimate } from "../../core/rules/estimateParser";
import type { GitHubPort } from "../../ports/github";
import type { GitHubNotification } from "../../core/models/types";
import type { SecretsPort } from "../../ports/secrets";

const GITHUB_API = "https://api.github.com";

interface SearchItem {
  id: number;
  number: number;
  pull_request?: { url: string };
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
}

interface ReviewApi {
  user: { login: string; avatar_url?: string };
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | string;
  submitted_at?: string;
}

export class GitHubHttpAdapter implements GitHubPort {
  constructor(private readonly secrets: SecretsPort) {}

  async fetchNotifications(tokenRef: string): Promise<GitHubNotification[]> {
    const token = await this.requireToken(tokenRef);
    const payload = await this.fetchJson<Array<{
      id: string;
      reason: string;
      updated_at: string;
      repository: { full_name: string };
      subject: { type: string; title: string; url?: string; latest_comment_url?: string };
    }>>(token, "/notifications?all=false&participating=false&per_page=50");

    return payload.map((item) => ({
      id: item.id,
      reason: item.reason,
      updatedAt: item.updated_at,
      repositoryFullName: item.repository.full_name,
      subjectType: item.subject.type,
      subjectTitle: item.subject.title,
      subjectUrl: item.subject.url,
      latestCommentUrl: item.subject.latest_comment_url,
      latestCommentActor: undefined,
      targetUrl: this.mapApiSubjectUrlToHtml(item.subject.url),
      isPersonalPrActivity: item.subject.type === "PullRequest",
      isReviewRequest: item.reason === "review_requested",
      isDirectMention: item.reason === "mention",
      isCiStateChange: item.reason === "ci_activity"
    }));
  }

  async resolveLatestCommentActor(tokenRef: string, notification: GitHubNotification): Promise<string | null> {
    if (!notification.latestCommentUrl) return null;

    const token = await this.requireToken(tokenRef);
    const response = await fetch(notification.latestCommentUrl, {
      headers: this.headers(token)
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { user?: { login?: string } };
    return payload.user?.login || null;
  }

  async enrichNotification(tokenRef: string, notification: GitHubNotification): Promise<GitHubNotification> {
    let next: GitHubNotification = {
      ...notification,
      category: notification.isReviewRequest ? "review_request" : notification.latestCommentUrl ? "comment" : "other"
    };

    if (notification.latestCommentUrl) {
      const token = await this.requireToken(tokenRef);
      const response = await fetch(notification.latestCommentUrl, { headers: this.headers(token) });
      if (response.ok) {
        const payload = (await response.json()) as {
          html_url?: string;
          body?: string;
          user?: { login?: string; avatar_url?: string };
        };

        next = {
          ...next,
          targetUrl: payload.html_url || next.targetUrl,
          actorLogin: payload.user?.login || next.actorLogin,
          actorAvatarUrl: payload.user?.avatar_url || next.actorAvatarUrl,
          previewText: payload.body?.replace(/\s+/g, " ").trim().slice(0, 140)
        };
      }
    }

    if (!next.targetUrl) {
      const resolved = await this.resolveNotificationTargetUrl(tokenRef, next);
      if (resolved) next = { ...next, targetUrl: resolved };
    }

    if (!next.actorLogin && next.subjectUrl) {
      const token = await this.requireToken(tokenRef);
      const response = await fetch(next.subjectUrl, { headers: this.headers(token) });
      if (response.ok) {
        const payload = (await response.json()) as {
          user?: { login?: string; avatar_url?: string };
        };
        next = {
          ...next,
          actorLogin: payload.user?.login || next.actorLogin,
          actorAvatarUrl: payload.user?.avatar_url || next.actorAvatarUrl
        };
      }
    }

    return next;
  }

  async resolveNotificationTargetUrl(tokenRef: string, notification: GitHubNotification): Promise<string | null> {
    if (notification.latestCommentUrl) {
      const token = await this.requireToken(tokenRef);
      const response = await fetch(notification.latestCommentUrl, { headers: this.headers(token) });
      if (response.ok) {
        const payload = (await response.json()) as { html_url?: string };
        if (payload.html_url) return payload.html_url;
      }
    }

    if (notification.targetUrl) {
      return notification.targetUrl;
    }

    if (notification.subjectUrl) {
      const token = await this.requireToken(tokenRef);
      const response = await fetch(notification.subjectUrl, { headers: this.headers(token) });
      if (response.ok) {
        const payload = (await response.json()) as { html_url?: string };
        if (payload.html_url) return payload.html_url;
      }
    }

    return null;
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
    const url = notification.targetUrl || "";
    return [
      `*${notification.repositoryFullName}*`,
      `${notification.subjectType}: ${notification.subjectTitle}`,
      `Reason: ${notification.reason}`,
      url ? `<${url}|Open on GitHub>` : ""
    ].filter(Boolean).join("\n");
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
      "User-Agent": "kiki"
    };
  }

  private async fetchJson<T>(token: string, path: string): Promise<T> {
    const response = await fetch(`${GITHUB_API}${path}`, { headers: this.headers(token) });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${body}`);
    }

    return response.json() as Promise<T>;
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
    overrides: { requestOrigin?: "direct" | "team"; requestedBy?: string }
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

        if (overrides.requestOrigin) snapshot.requestOrigin = overrides.requestOrigin;
        if (overrides.requestedBy) snapshot.requestedBy = overrides.requestedBy;

        return snapshot;
      })
    ).then((rows) => rows.filter((row): row is PullRequestSnapshot => Boolean(row)));
  }

  private async fetchPullRequest(token: string, url: string): Promise<PullRequestApi> {
    const response = await fetch(url, { headers: this.headers(token) });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub pull request error (${response.status}): ${body}`);
    }

    return response.json() as Promise<PullRequestApi>;
  }

  private async fetchReviews(token: string, pullRequestApiUrl: string): Promise<ReviewApi[]> {
    const response = await fetch(`${pullRequestApiUrl}/reviews?per_page=100`, { headers: this.headers(token) });
    if (!response.ok) return [];
    return response.json() as Promise<ReviewApi[]>;
  }

  private async fetchCiData(
    token: string,
    repo: string,
    sha: string
  ): Promise<{ states: Array<"failing" | "pending" | "passing">; url?: string }> {
    const combinedStatus = await fetch(`${GITHUB_API}/repos/${repo}/commits/${sha}/status`, { headers: this.headers(token) });
    const checkRuns = await fetch(`${GITHUB_API}/repos/${repo}/commits/${sha}/check-runs`, {
      headers: {
        ...this.headers(token),
        Accept: "application/vnd.github+json"
      }
    });

    const states: Array<"failing" | "pending" | "passing"> = [];
    let url: string | undefined;

    if (combinedStatus.ok) {
      const payload = (await combinedStatus.json()) as { state: "failure" | "error" | "pending" | "success" | string; statuses?: Array<{ target_url?: string }> };
      if (payload.state === "failure" || payload.state === "error") states.push("failing");
      else if (payload.state === "pending") states.push("pending");
      else if (payload.state === "success") states.push("passing");
      url = payload.statuses?.find((status) => status.target_url)?.target_url;
    }

    if (checkRuns.ok) {
      const payload = (await checkRuns.json()) as { check_runs: Array<{ status: string; conclusion: string | null; html_url?: string }> };
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
}
