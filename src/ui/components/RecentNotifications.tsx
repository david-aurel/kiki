import type { GitHubNotification } from "../../core/models/types";
import { openExternal } from "../../lib/openExternal";
import { formatNotificationAge } from "../../lib/time";

interface RecentNotificationsProps {
  rows: GitHubNotification[];
  emptyText?: string;
}

function categoryLabel(category: GitHubNotification["category"]): string {
  if (category === "review_request") return "Review";
  if (category === "comment") return "Comment";
  return "Update";
}

function categoryEmoji(category: GitHubNotification["category"]): string {
  if (category === "review_request") return "👀";
  if (category === "comment") return "💬";
  return "🔔";
}

export function RecentNotifications({ rows, emptyText = "No recent notifications." }: RecentNotificationsProps) {
  if (rows.length === 0) {
    return <p className="kpi">{emptyText}</p>;
  }

  return (
    <div className="notification-list">
      {rows.map((notification) => (
        <div
          key={notification.id}
          className={`notification-item ${notification.delivered ? "" : "muted"}`}
          onClick={() => void openExternal(notification.targetUrl || notification.subjectUrl)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              void openExternal(notification.targetUrl || notification.subjectUrl);
            }
          }}
          tabIndex={0}
          role="link"
          aria-label={`Open notification ${notification.subjectTitle}`}
        >
          <div className="notification-top">
            <div className="notification-chip-row">
              <span className="notification-kind">
                <span aria-hidden="true">{categoryEmoji(notification.category)}</span>
                <span>{categoryLabel(notification.category)}</span>
              </span>
              {notification.actorAvatarUrl ? (
                <span className="author-cell" data-tooltip={notification.actorLogin || "Unknown"}>
                  <img src={notification.actorAvatarUrl} alt={notification.actorLogin || "Unknown"} className="avatar" />
                </span>
              ) : null}
            </div>
            <span className="notification-age" title={new Date(notification.updatedAt).toLocaleString()}>
              {formatNotificationAge(notification.updatedAt)}
            </span>
          </div>

          {notification.category === "review_request" ? (
            <div className="notification-title">{notification.subjectTitle}</div>
          ) : null}

          {notification.category === "comment" ? (
            <>
              <div className="notification-main-text">{notification.previewText || "Comment received"}</div>
              <div className="notification-meta-text">{notification.subjectTitle}</div>
            </>
          ) : null}

          {notification.category !== "review_request" && notification.category !== "comment" ? (
            <>
              <div className="notification-main-text">{notification.subjectTitle}</div>
              <div className="notification-meta-text">{notification.previewText || notification.reason}</div>
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}
