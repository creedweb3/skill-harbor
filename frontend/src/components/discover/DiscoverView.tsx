import type { Studio } from "../../hooks/useStudio";
import { ActivityLog } from "../ActivityLog";
import { Button } from "../ui/Button";
import { CatalogGrid } from "./CatalogGrid";
import { CategoryFilters } from "./CategoryFilters";
import { DiscoverToolbar } from "./DiscoverToolbar";
import { MarketplaceSpotlight } from "./MarketplaceSpotlight";

type Props = { studio: Studio };

export function DiscoverView({ studio }: Props) {
  const {
    curatedHelp,
    busy,
    filteredAssets,
    selectedIds,
    selectedCats,
    categoryGroups,
    hasCatalog,
    fetchCatalog,
    runInstall,
    refresh,
    toggleCat,
    selectAllCats,
    clearCats,
    toggleRow,
    log,
    logOpen,
    setLogOpen,
  } = studio;

  return (
    <main className="discover" id="discover">
      <header className="discover-header">
        <div className="discover-header-text">
          <h2>Discover</h2>
          <p>
            Find skills by profession or stack.{" "}
            <abbr title={curatedHelp} className="curated-tip">
              Curated
            </abbr>{" "}
            entries are editor-picked from our manifest.
          </p>
        </div>
        <div className="discover-stats" aria-live="polite">
          <span>
            <strong>{filteredAssets.length}</strong> shown
          </span>
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
        </div>
        <div className="discover-actions">
          <Button variant="primary" onClick={fetchCatalog} disabled={busy}>
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

      <MarketplaceSpotlight {...studio} />

      <DiscoverToolbar {...studio} />

      <CategoryFilters
        groups={categoryGroups}
        selectedCats={selectedCats}
        onToggle={toggleCat}
        onSelectAll={selectAllCats}
        onClear={clearCats}
      />

      <section className="catalog" aria-label="Catalog results">
        <CatalogGrid
          assets={filteredAssets}
          selectedIds={selectedIds}
          hasCatalog={hasCatalog}
          busy={busy}
          onFetch={fetchCatalog}
          onToggle={toggleRow}
        />
      </section>

      <ActivityLog log={log} logOpen={logOpen} setLogOpen={setLogOpen} />
    </main>
  );
}
