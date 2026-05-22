import type { Studio } from "../hooks/useStudio";

type Props = Pick<Studio, "log" | "logOpen" | "setLogOpen">;

export function ActivityLog({ log, logOpen, setLogOpen }: Props) {
  return (
    <section className="activity-log" aria-label="Activity log">
      <button
        type="button"
        className="activity-log-toggle"
        onClick={() => setLogOpen((o) => !o)}
        aria-expanded={logOpen}
      >
        <span>Activity</span>
        {log.length > 0 ? <span className="activity-count">{log.length}</span> : null}
        <span className="activity-chevron" aria-hidden>
          {logOpen ? "▾" : "▸"}
        </span>
      </button>
      {logOpen ? (
        <div className="activity-log-body" role="log" aria-live="polite">
          {log.length === 0 ? (
            <span className="muted">Actions and errors appear here…</span>
          ) : (
            log.map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith("✓") ? "ok" : line.startsWith("✗") ? "err" : ""
                }
              >
                {line}
              </div>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
