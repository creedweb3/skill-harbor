import type { Studio } from "../../hooks/useStudio";

type Props = { studio: Studio };

export function TopNav({ studio }: Props) {
  const { busy, syncRegistry, selectedIds, runInstall, dbStats, registryHydrating } = studio;
  const lastSync = dbStats?.last_synced_at;

  const statusText = registryHydrating
    ? "Updating registry…"
    : lastSync
      ? `Synced ${new Date(lastSync).toLocaleString()}`
      : "Registry ready";

  return (
    <header className="harbor-top">
      <div className="harbor-brand">
        <h1>Skill Harbor</h1>
        <span className="harbor-tagline">By Devs, For Devs</span>
      </div>
      <div className="harbor-top__actions">
        <span
          className={`harbor-top__status ${registryHydrating ? "harbor-top__status--live" : ""}`}
        >
          {statusText}
        </span>
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
