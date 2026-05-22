import type { Asset } from "../../api";
import { AssetCard } from "./AssetCard";

type Props = {
  assets: Asset[];
  selectedIds: Set<string>;
  hasCatalog: boolean;
  busy: boolean;
  onFetch: () => void;
  onToggle: (id: string) => void;
};

export function CatalogGrid({
  assets,
  selectedIds,
  hasCatalog,
  busy,
  onFetch,
  onToggle,
}: Props) {
  if (assets.length === 0) {
    return (
      <div className="empty-state">
        {hasCatalog ? (
          <>
            <p className="empty-title">No matches</p>
            <p className="muted">Try different filters or clear your search.</p>
          </>
        ) : (
          <>
            <p className="empty-title">Get started</p>
            <ol className="steps">
              <li>Pick categories and fetch options below</li>
              <li>Click <strong>Fetch catalog</strong> to load skills from GitHub</li>
              <li>Select items and install to global or project scope</li>
            </ol>
            <button type="button" className="btn primary" onClick={onFetch} disabled={busy}>
              {busy ? "Working…" : "Fetch catalog"}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <ul className="catalog-grid">
      {assets.map((a) => (
        <li key={a.id}>
          <AssetCard
            asset={a}
            selected={selectedIds.has(a.id)}
            onToggle={() => onToggle(a.id)}
          />
        </li>
      ))}
    </ul>
  );
}
