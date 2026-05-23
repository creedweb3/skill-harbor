import type { Studio } from "../../hooks/useStudio";
import { ActivityLog } from "../ActivityLog";
import { Button } from "../ui/Button";
import { CustomSearchView } from "./CustomSearchView";
import { DiscoverModeSwitch } from "./DiscoverModeSwitch";
import { DiscoveryDashboard } from "./DiscoveryDashboard";
import { InstallTargetsBar } from "./InstallTargetsBar";

type Props = { studio: Studio };

export function DiscoverView({ studio }: Props) {
  const {
    curatedHelp,
    busy,
    filteredAssets,
    selectedIds,
    selectedCats,
    discoverMode,
    setDiscoverMode,
    fetchCatalog,
    runInstall,
    refresh,
    log,
    logOpen,
    setLogOpen,
    backendReady,
  } = studio;

  return (
    <main className="discover" id="discover">
      {!backendReady ? (
        <div className="connection-banner" role="alert">
          <span>API not connected — start the backend with </span>
          <code className="mono">npm run dev</code>
          <span> in the skill-harbor folder, then </span>
          <button type="button" className="link-btn" onClick={() => refresh()} disabled={busy}>
            retry
          </button>
        </div>
      ) : null}

      <header className="discover-header">
        <div className="discover-header-text">
          <h2>Marketplace</h2>
          <p>
            {discoverMode === "discovery" ? (
              <>
                Trending by period, personalized picks, and top skills by profession. Use{" "}
                <strong>24h / 7d / 30d / 1y</strong> to change the GitHub ranking window.
              </>
            ) : (
              <>Search, filter, and browse the full catalog as cards.</>
            )}
          </p>
        </div>
        <div className="discover-stats" aria-live="polite">
          <span>
            <strong>{discoverMode === "discovery" ? selectedIds.size : filteredAssets.length}</strong>
            {discoverMode === "discovery" ? " selected" : " shown"}
          </span>
          {discoverMode === "search" ? (
            <>
              <span className="stat-sep" aria-hidden>
                ·
              </span>
              <span>
                <strong>{selectedIds.size}</strong> selected
              </span>
              <span className="stat-sep" aria-hidden>
                ·
              </span>
              <span>
                <strong>{selectedCats.size}</strong> categories
              </span>
            </>
          ) : null}
        </div>
        <div className="discover-actions">
          <Button variant="primary" onClick={() => fetchCatalog()} disabled={busy}>
            {busy ? "Working…" : "Fetch catalog"}
          </Button>
          <Button
            variant="accent"
            onClick={runInstall}
            disabled={busy || selectedIds.size === 0}
          >
            Install ({selectedIds.size})
          </Button>
          <Button variant="ghost" onClick={() => refresh()} disabled={busy}>
            Refresh
          </Button>
        </div>
      </header>

      <DiscoverModeSwitch mode={discoverMode} onChange={setDiscoverMode} />

      {discoverMode === "discovery" ? <InstallTargetsBar {...studio} /> : null}

      {discoverMode === "discovery" ? (
        <DiscoveryDashboard {...studio} curatedHelp={curatedHelp} />
      ) : (
        <CustomSearchView studio={studio} />
      )}

      <ActivityLog log={log} logOpen={logOpen} setLogOpen={setLogOpen} />
    </main>
  );
}
