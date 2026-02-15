import type { PullRequestSnapshot } from "../models/types";

export function sortReviewRequestsOldestFirst(prs: PullRequestSnapshot[]): PullRequestSnapshot[] {
  return [...prs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function summarizeReviewers(pr: PullRequestSnapshot): string {
  if (pr.reviewers.length === 0) return "No reviews";

  const parts = pr.reviewers.map((review) => `${review.login} (${review.state})`);
  return parts.join(", ");
}
