import { useState } from "react";
import type { GitHubNotification } from "../../core/models/types";
import { openExternal } from "../../lib/openExternal";
import type { NotificationProbeSnapshot, SlackDebugEventType } from "../../lib/runtime";

interface DebugPanelProps {
  rows: GitHubNotification[];
  probeRows: NotificationProbeSnapshot[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSendSlackTest: (type: SlackDebugEventType) => Promise<string>;
  onClose: () => void;
}

function bool(v: boolean | undefined): string {
  return v ? "yes" : "no";
}

const slackDebugButtons: Array<{ type: SlackDebugEventType; label: string }> = [
  { type: "review_request", label: "Test Review Request" },
  { type: "comment", label: "Test Comment" },
  { type: "review_approved", label: "Test Review Approved" },
  { type: "review_changes_requested", label: "Test Review Changes" },
  { type: "review_commented", label: "Test Review Commented" }
];

export function DebugPanel({ rows, probeRows, loading, error, onRefresh, onSendSlackTest, onClose }: DebugPanelProps) {
  const [sendingType, setSendingType] = useState<SlackDebugEventType | null>(null);
  const [slackDebugStatus, setSlackDebugStatus] = useState<string>("");

  async function runSlackDebug(type: SlackDebugEventType): Promise<void> {
    setSendingType(type);
    setSlackDebugStatus("");
    try {
      const message = await onSendSlackTest(type);
      setSlackDebugStatus(message);
    } catch (eventError) {
      const message = eventError instanceof Error ? eventError.message : String(eventError);
      setSlackDebugStatus(`Slack test failed: ${message}`);
    } finally {
      setSendingType(null);
    }
  }

  return (
    <div className="debug-modal panel" role="dialog" aria-modal="true" aria-label="Debug notifications">
      <div className="debug-head">
        <h3>Debug</h3>
        <div className="controls">
          <button className="secondary" onClick={onRefresh}>Refresh</button>
          <button className="icon-btn settings-close-btn" onClick={onClose} aria-label="Close debug">×</button>
        </div>
      </div>

      <div className="kpi debug-summary">
        Showing {rows.length} notifications from merged sources (REST review requests + GraphQL my PR activity).
      </div>
      {rows[0] ? (
        <div className="kpi debug-summary">
          Latest merged notification: {new Date(rows[0].occurredAt || rows[0].updatedAt).toLocaleString()} ({rows[0].reason})
        </div>
      ) : null}

      {error ? <div className="kpi">Debug fetch failed: {error}</div> : null}
      {loading ? <div className="kpi">Loading debug data...</div> : null}
      <div className="debug-slack-tools panel">
        <div className="kpi">Slack Debug Delivery</div>
        <div className="controls">
          {slackDebugButtons.map((button) => (
            <button
              key={button.type}
              className="secondary"
              onClick={() => void runSlackDebug(button.type)}
              disabled={Boolean(sendingType)}
            >
              {sendingType === button.type ? "Sending..." : button.label}
            </button>
          ))}
        </div>
        {slackDebugStatus ? <div className="kpi">{slackDebugStatus}</div> : null}
      </div>

      <div className="debug-body">
        {probeRows.length > 0 ? (
          <div className="debug-probe panel">
            <h4>API Probe</h4>
            <table className="table debug-probe-table">
              <thead>
                <tr>
                  <th>Query</th>
                  <th>Count</th>
                  <th>Latest</th>
                  <th>Top Sample</th>
                </tr>
              </thead>
              <tbody>
                {probeRows.map((probe) => (
                  <tr key={probe.label}>
                    <td>{probe.label}</td>
                    <td>{probe.count}</td>
                    <td>{probe.latestUpdatedAt ? new Date(probe.latestUpdatedAt).toLocaleString() : "-"}</td>
                    <td>
                      {probe.error ? (
                        <span className="kpi">error: {probe.error}</span>
                      ) : probe.top.length > 0 ? (
                        <div className="debug-probe-sample">
                          {probe.top.slice(0, 3).map((row) => (
                            <div key={`${probe.label}:${row.id}`}>
                              <span className="kpi">{new Date(row.updatedAt).toLocaleTimeString()}</span>
                              {" "}
                              <span>{row.reason}</span>
                              {" "}
                              <span className="kpi">{row.repo}</span>
                              {" "}
                              <span className="title-link">{row.title}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && !error ? (
          <table className="table debug-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Reason</th>
                <th>Type</th>
                <th>Deliver</th>
                <th>Decision</th>
                <th>PR</th>
                <th>Flags</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="clickable-row"
                  onClick={() => void openExternal(row.targetUrl || row.subjectUrl)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      void openExternal(row.targetUrl || row.subjectUrl);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                  aria-label={`Open notification ${row.subjectTitle}`}
                >
                  <td>{new Date(row.occurredAt || row.updatedAt).toLocaleString()}</td>
                  <td>{row.reason}</td>
                  <td>{row.category || "-"}</td>
                  <td>{row.delivered ? "yes" : "no"}</td>
                  <td>{row.decisionReason || "-"}</td>
                  <td className="col-title"><span className="title-link">{row.subjectTitle}</span></td>
                  <td className="debug-flags">
                    <span>P:{bool(row.isPersonalPrActivity)}</span>
                    <span>R:{bool(row.isReviewRequest)}</span>
                    <span>M:{bool(row.isDirectMention)}</span>
                  </td>
                  <td><code>{row.id}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
