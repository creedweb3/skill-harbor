import { useMemo, useState } from "react";
import {
  consoleLinesToText,
  formatActivityTime,
  type UserActivity,
} from "../../lib/activityLog";

type Props = {
  activity: UserActivity;
  onBack: () => void;
};

export function ActivityDetailView({ activity, onBack }: Props) {
  const [copied, setCopied] = useState(false);

  const statusLabel =
    activity.status === "running"
      ? "Running"
      : activity.status === "ok"
        ? "Success"
        : "Error";

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(consoleLinesToText(activity.logs));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const duration = useMemo(() => {
    if (!activity.finishedAt) return null;
    const ms = activity.finishedAt - activity.ts;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }, [activity.finishedAt, activity.ts]);

  return (
    <div className="harbor-activity-detail-page">
      <header className="harbor-activity-detail-head">
        <button type="button" className="harbor-activity-back" onClick={onBack}>
          ← Back to activity
        </button>
        <div className="harbor-activity-detail-meta">
          <span className={`harbor-activity-badge status-${activity.status}`}>
            {statusLabel}
          </span>
          <span className="harbor-activity-time">{formatActivityTime(activity.ts)}</span>
          {duration ? (
            <span className="harbor-activity-duration">{duration}</span>
          ) : null}
        </div>
        <h2 className="harbor-activity-detail-title">{activity.action}</h2>
        <p className="harbor-activity-detail-summary">{activity.summary}</p>
        <div className="harbor-activity-actions">
          <button
            type="button"
            className="harbor-btn harbor-btn--ghost"
            onClick={() => void copyLogs()}
            disabled={activity.logs.length === 0}
          >
            {copied ? "Copied" : "Copy log"}
          </button>
        </div>
      </header>

      <div className="harbor-activity-log-panel harbor-scroll">
        {activity.logs.length === 0 ? (
          <p className="harbor-activity-empty">
            {activity.status === "running"
              ? "Waiting for log output…"
              : "No log lines recorded for this action."}
          </p>
        ) : (
          <ul className="harbor-console-lines">
            {activity.logs.map((line) => (
              <li key={line.id} className={`harbor-console-line kind-${line.kind}`}>
                <span className="harbor-console-line-time">
                  {formatActivityTime(line.ts)}
                </span>
                <span className="harbor-console-line-msg">{line.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
