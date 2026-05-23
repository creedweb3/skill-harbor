import type { Studio } from "../../hooks/useStudio";
import { CatalogGrid } from "./CatalogGrid";
import { CategoryFilters } from "./CategoryFilters";
import { DiscoverToolbar } from "./DiscoverToolbar";

type Props = { studio: Studio };

export function CustomSearchView({ studio }: Props) {
  const {
    categoryGroups,
    selectedCats,
    filteredAssets,
    selectedIds,
    hasCatalog,
    busy,
    fetchCatalog,
    toggleCat,
    selectAllCats,
    clearCats,
    toggleRow,
  } = studio;

  return (
    <div className="custom-search">
      <DiscoverToolbar {...studio} />

      <CategoryFilters
        groups={categoryGroups}
        selectedCats={selectedCats}
        onToggle={toggleCat}
        onSelectAll={selectAllCats}
        onClear={clearCats}
      />

      <section className="catalog" aria-label="Search results">
        <CatalogGrid
          assets={filteredAssets}
          selectedIds={selectedIds}
          hasCatalog={hasCatalog}
          busy={busy}
          onFetch={fetchCatalog}
          onToggle={toggleRow}
        />
      </section>
    </div>
  );
}
