import { useEffect, useRef, useState } from "react";
import { getAdminActivityDetail, type AdminActivityRow } from "../api";

type Props = {
  activityId: number;
  onClose: () => void;
  onStop?: (activityId: number) => void | Promise<void>;
  stopping?: boolean;
};

type LogMode = "human" | "dev" | "all";

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function snapshotLine(label: string, snap?: AdminActivityRow["snapshot_before"]) {
  if (!snap) return null;
  return (
    <p className="admin-snapshot-line">
      <strong>{label}:</strong> {snap.total_assets} assets · {snap.unique_repos} repos ·{" "}
      {snap.synced_content} synced
      <span className="admin-snapshot-time"> ({formatTime(snap.captured_at)})</span>
    </p>
  );
}

export function AdminActivityDetail({ activityId, onClose, onStop, stopping }: Props) {
  const [row, setRow] = useState<AdminActivityRow | null>(null);
  const [error, setError] = useState("");
  const [logMode, setLogMode] = useState<LogMode>("human");
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await getAdminActivityDetail(activityId);
        if (alive) {
          setRow(data);
          setError("");
        }
      } catch (e) {
        if (alive) setError(String(e));
      }
    };
    void load();
    const timer = setInterval(load, 800);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [activityId]);

  const running = row?.status === "running";
  const logs = (row?.logs ?? []).filter((line) => {
    if (logMode === "all") return true;
    if (logMode === "dev") return line.kind === "dev";
    return line.kind !== "dev";
  });

  useEffect(() => {
    const len = logs.length;
    if (len > prevLen.current && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
    prevLen.current = len;
  }, [logs.length, running]);

  const copyLogs = async () => {
    const header = [
      row?.action ?? "Activity",
      row?.summary || row?.detail || "",
      row?.snapshot_before
        ? `Before: ${row.snapshot_before.total_assets} assets · ${row.snapshot_before.unique_repos} repos`
        : "",
      row?.snapshot_after
        ? `After: ${row.snapshot_after.total_assets} assets · ${row.snapshot_after.unique_repos} repos`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const body = logs
      .map((line) => `${formatTime(line.ts)}\t[${line.kind ?? "human"}] ${line.message}`)
      .join("\n");

    const text = `${header}\n\n${body}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <div className="admin-modal-backdrop" onClick={onClose} role="presentation" />
      <div className="admin-modal" role="dialog" aria-labelledby="activity-detail-title">
        <header className="admin-modal-header">
          <div>
            <p className="admin-eyebrow">Activity log</p>
            <h2 id="activity-detail-title">{row?.action ?? "Loading…"}</h2>
            {row ? (
              <p className="admin-modal-sub">
                {running ? (
                  <>
                    <span className="admin-pulse-dot" aria-hidden /> Running — {row.step || row.summary}
                  </>
                ) : (
                  row.summary || row.detail
                )}
              </p>
            ) : null}
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {running ? (
          <div className="admin-job-progress-wrap">
            <div className="admin-job-progress">
              <div
                className="admin-job-progress-fill"
                style={{ width: `${row?.progress ?? 0}%` }}
              />
            </div>
            <p className="admin-job-progress-label">
              {row?.progress ?? 0}% — {row?.step}
            </p>
          </div>
        ) : null}

        <div className="admin-modal-snapshots">
          {snapshotLine("Before", row?.snapshot_before)}
          {snapshotLine("After", row?.snapshot_after)}
          {row?.snapshot_before || row?.snapshot_after ? (
            <p className="admin-snapshot-hint">
              Snapshots and developer logs are kept for audit — compare before/after if you need to revert
              manually.
            </p>
          ) : null}
        </div>

        <div className="admin-log-toolbar">
          <span className="admin-log-toolbar-label">View</span>
          {(["human", "dev", "all"] as LogMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`admin-log-mode${logMode === mode ? " is-active" : ""}`}
              onClick={() => setLogMode(mode)}
            >
              {mode === "human" ? "Readable" : mode === "dev" ? "Developer" : "All"}
            </button>
          ))}
          {running ? <span className="admin-log-live">Live</span> : null}
          <button
            type="button"
            className="admin-log-copy"
            onClick={() => void copyLogs()}
            disabled={logs.length === 0}
          >
            {copied ? "Copied" : "Copy logs"}
          </button>
        </div>

        {error ? <p className="admin-login-error">{error}</p> : null}

        <div ref={logRef} className="admin-log-view harbor-scroll">
          {logs.length === 0 ? (
            <p className="admin-empty">
              {running ? "Waiting for log output…" : "No log lines for this view."}
            </p>
          ) : (
            <ul className="admin-log-lines">
              {logs.map((line, i) => (
                <li
                  key={`${line.ts}-${i}`}
                  className={`admin-log-line level-${line.level}${line.kind === "dev" ? " kind-dev" : ""}`}
                >
                  <span className="admin-log-time">{formatTime(line.ts)}</span>
                  <span className="admin-log-msg">{line.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="admin-modal-footer">
          {running && onStop ? (
            <button
              type="button"
              className="admin-modal-stop-btn"
              onClick={() => void onStop(activityId)}
              disabled={stopping}
            >
              {stopping ? "Stopping…" : "Stop job"}
            </button>
          ) : null}
          <button type="button" className="admin-modal-close-btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </>
  );
}
