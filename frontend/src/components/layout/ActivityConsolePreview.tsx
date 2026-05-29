import type { ConsoleLine } from "../../lib/activityLog";
import { formatActivityTimeShort } from "../../lib/activityLog";

type Props = {
  lines: ConsoleLine[];
};

const PREVIEW_LINES = 3;

/** Sidebar console stream — separate from user activity history. */
export function ActivityConsolePreview({ lines }: Props) {
  const recent = lines.slice(-PREVIEW_LINES);

  return (
    <div className="harbor-nav-console" aria-label="Console output">
      <div className="harbor-nav-console__head">
        <span className="harbor-nav-console__title">Console</span>
      </div>
      <div className="harbor-nav-console__body" role="log" aria-live="polite">
        {recent.length === 0 ? (
          <span className="harbor-nav-console__empty">Log output appears here…</span>
        ) : (
          recent.map((line) => (
            <span key={line.id} className={`harbor-nav-console__line kind-${line.kind}`}>
              <span className="harbor-nav-console__time">
                {formatActivityTimeShort(line.ts)}
              </span>
              <span className="harbor-nav-console__msg">{line.message}</span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
