import type { PullRequestSnapshot } from "../../core/models/types";
import { classifySlaAgeHours } from "../../core/rules/classifiers";
import { ageHours, formatAge } from "../../lib/time";
import { openExternal } from "../../lib/openExternal";

interface PrTableProps {
  rows: PullRequestSnapshot[];
  currentUser?: string;
  showAuthor?: boolean;
  deemphasizeTeamRequests?: boolean;
}

function stateIcon(state: PullRequestSnapshot["state"]): { className: string; label: string } {
  if (state === "draft") return { className: "state-dot draft", label: "Draft" };
  if (state === "ready") return { className: "state-dot ready", label: "Ready" };
  return { className: "state-dot open", label: "Open" };
}

function ciDot(ci: PullRequestSnapshot["ciRollup"]): { className: string; label: string } {
  if (ci === "failing") return { className: "ci-dot failing", label: "Failing" };
  if (ci === "pending") return { className: "ci-dot pending", label: "Pending" };
  if (ci === "passing") return { className: "ci-dot passing", label: "Passing" };
  return { className: "ci-dot none", label: "No checks" };
}

function groupedReviews(pr: PullRequestSnapshot): Array<{ key: string; emoji: string; label: string; reviewers: PullRequestSnapshot["reviewers"]; pillClass: string }> {
  const groups: Array<{ key: "approved" | "changes_requested" | "commented"; emoji: string; label: string; pillClass: string }> = [
    { key: "approved", emoji: "✅", label: "Approved", pillClass: "review-pill approved" },
    { key: "commented", emoji: "💬", label: "Commented", pillClass: "review-pill commented" },
    { key: "changes_requested", emoji: "🛑", label: "Changes requested", pillClass: "review-pill blocked" }
  ];

  return groups
    .map((group) => ({
      ...group,
      reviewers: pr.reviewers.filter((reviewer) => reviewer.state === group.key)
    }))
    .filter((group) => group.reviewers.length > 0);
}

function estimateEmoji(value: PullRequestSnapshot["estimateNormalized"]): string {
  if (value === "immediate") return "⚡️";
  if (value === "half_day") return "🐬";
  if (value === "one_two_days") return "🐝";
  return "";
}

export function PrTable({ rows, currentUser, showAuthor = true, deemphasizeTeamRequests = false }: PrTableProps) {
  if (rows.length === 0) {
    return <p className="kpi">No items found.</p>;
  }

  const normalizedCurrent = (currentUser || "").toLowerCase();

  return (
    <table className="table">
      <thead>
        <tr>
          <th className="col-title">Title</th>
          {showAuthor ? <th>Author</th> : null}
          <th>State</th>
          <th>CI</th>
          <th>Age</th>
          <th>Diff</th>
          <th>Reviews</th>
          <th>Estimate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((pr) => {
          const age = ageHours(pr.createdAt);
          const sla = classifySlaAgeHours(age);
          const displayAuthor = normalizedCurrent && pr.author.toLowerCase() === normalizedCurrent ? "Me" : pr.author;
          const state = stateIcon(pr.state);
          const ci = ciDot(pr.ciRollup);
          const reviewGroups = groupedReviews(pr);
          const estimate = estimateEmoji(pr.estimateNormalized);

          return (
            <tr
              key={pr.id}
              className={`clickable-row ${deemphasizeTeamRequests && pr.requestOrigin === "team" ? "team-request-row" : ""}`}
              onClick={() => void openExternal(pr.url)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void openExternal(pr.url);
                }
              }}
              tabIndex={0}
              role="link"
              aria-label={`Open pull request ${pr.title}`}
            >
              <td className="col-title">
                <span className="title-link">{pr.title}</span>
              </td>
              {showAuthor ? (
                <td>
                  <div className="author-cell" data-tooltip={displayAuthor}>
                    {pr.authorAvatarUrl ? (
                      <img src={pr.authorAvatarUrl} alt={displayAuthor} className="avatar" />
                    ) : (
                      <div className="avatar placeholder">{displayAuthor.slice(0, 1).toUpperCase()}</div>
                    )}
                  </div>
                </td>
              ) : null}
              <td>
                <span className={state.className} title={state.label} aria-label={state.label} />
              </td>
              <td>
                <span className={ci.className} title={ci.label} aria-label={ci.label} />
              </td>
              <td><span className={`badge ${sla}`}>{formatAge(pr.createdAt)}</span></td>
              <td className="diff-nowrap">
                <span className="diff-plus">+{pr.additions}</span>
                <span className="diff-minus">-{pr.deletions}</span>
                <span className="kpi"> ({pr.changedFiles})</span>
              </td>
              <td>
                <div className="review-pills">
                  {reviewGroups.map((group) => (
                    <div key={`${pr.id}:${group.key}`} className={group.pillClass} title={`${group.label}: ${group.reviewers.map((r) => r.login).join(", ")}`}>
                      <span className="review-emoji" aria-hidden="true">{group.emoji}</span>
                      <div className="review-avatars">
                        {group.reviewers.slice(0, 3).map((reviewer) => (
                          reviewer.avatarUrl ? (
                            <img key={reviewer.login} src={reviewer.avatarUrl} alt={reviewer.login} className="mini-avatar" />
                          ) : (
                            <span key={reviewer.login} className="mini-avatar placeholder">{reviewer.login.slice(0, 1).toUpperCase()}</span>
                          )
                        ))}
                        {group.reviewers.length > 3 ? <span className="mini-count">+{group.reviewers.length - 3}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </td>
              <td className="estimate-cell">{estimate}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
