import type { Studio } from "../../hooks/useStudio";

type Props = { studio: Studio };

export function TopNav({ studio }: Props) {
  const { busy, syncRegistry, selectedIds, runInstall, dbStats } = studio;
  const lastSync = dbStats?.last_synced_at;

  return (
    <header className="harbor-top">
      <div className="harbor-brand">
        <h1>Skill Harbor</h1>
        <span className="harbor-tagline">By Devs, For Devs</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {lastSync ? (
          <span style={{ fontSize: "0.75rem", color: "var(--harbor-muted)" }}>
            Synced {new Date(lastSync).toLocaleString()}
          </span>
        ) : (
          <span style={{ fontSize: "0.75rem", color: "var(--harbor-muted)" }}>
            Registry not synced
          </span>
        )}
        <button
          type="button"
          className="harbor-btn harbor-btn--ghost"
          onClick={() => syncRegistry()}
          disabled={busy}
        >
          {busy ? "Syncing…" : "Sync content"}
        </button>
        <button
          type="button"
          className="harbor-btn harbor-btn--primary"
          onClick={runInstall}
          disabled={busy || selectedIds.size === 0}
        >
          Install ({selectedIds.size})
        </button>
      </div>
    </header>
  );
}
