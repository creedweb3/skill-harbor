import { useEffect, useMemo, useState } from "react";
import type { Studio } from "../hooks/useStudio";
import { AssetRankCard } from "../components/dashboard/AssetRankCard";
import { MultiSelectDropdown } from "../components/browse/MultiSelectDropdown";
import { listRepoOwners, repoOwner } from "../lib/ranking";

const TYPE_OPTIONS = [
  { value: "skill", label: "Skills" },
  { value: "rule", label: "Rules" },
  { value: "command", label: "Commands" },
  { value: "agent", label: "Agents" },
];

type SortKey = "stars" | "votes" | "name";

const PAGE_SIZE = 60;

type Props = { studio: Studio };

export function BrowsePage({ studio }: Props) {
  const {
    browseAssets,
    catalogTotal,
    dbStats,
    search,
    setSearch,
    selectedAssetId,
    setSelectedAssetId,
    assets,
    selectedIds,
    toggleRow,
    toggleSelectAllForIds,
    deselectAll,
    domainLabels,
    techStackLabels,
    repoOwners,
  } = studio;
  const [authorFilters, setAuthorFilters] = useState<Set<string>>(() => new Set());
  const [typeFilters, setTypeFilters] = useState<Set<string>>(() => new Set());
  const [domainFilters, setDomainFilters] = useState<Set<string>>(() => new Set());
  const [stackFilters, setStackFilters] = useState<Set<string>>(() => new Set());
  const [sortBy, setSortBy] = useState<SortKey>("stars");
  const [page, setPage] = useState(1);

  const domainOptions = useMemo(() => {
    const slugs = new Set<string>();
    for (const a of assets) {
      if (a.primary_domain) slugs.add(a.primary_domain);
      for (const d of a.domains ?? a.categories) slugs.add(d);
    }
    return [...slugs]
      .sort()
      .map((value) => ({ value, label: domainLabels[value] ?? value }));
  }, [assets, domainLabels]);

  const stackOptions = useMemo(() => {
    const tags = new Set<string>();
    for (const a of assets) {
      for (const t of a.tech_tags ?? []) tags.add(t);
    }
    return [...tags]
      .sort()
      .map((value) => ({ value, label: techStackLabels[value] ?? value }));
  }, [assets, techStackLabels]);

  const authorOptions = useMemo(() => {
    if (repoOwners.length > 0) {
      return repoOwners.map((o) => ({
        value: o.owner,
        label:
          o.repo_count > 1
            ? `${o.owner} (${o.repo_count} repos, ${o.asset_count})`
            : `${o.owner} (${o.asset_count})`,
      }));
    }
    return listRepoOwners(assets).map((a) => ({ value: a, label: a }));
  }, [repoOwners, assets]);

  const registryTotal = dbStats?.asset_count ?? catalogTotal;

  const shown = useMemo(() => {
    let list = browseAssets;
    if (authorFilters.size) {
      list = list.filter((a) => authorFilters.has(repoOwner(a.source_repo)));
    }
    if (typeFilters.size) {
      list = list.filter((a) => typeFilters.has(a.asset_type));
    }
    if (domainFilters.size) {
      list = list.filter((a) => {
        const primary = a.primary_domain ?? (a.domains ?? a.categories)[0];
        return (
          domainFilters.has(primary) ||
          (a.domains ?? a.categories).some((d) => domainFilters.has(d)) ||
          (a.secondary_domains ?? []).some((d) => domainFilters.has(d))
        );
      });
    }
    if (stackFilters.size) {
      list = list.filter((a) => (a.tech_tags ?? []).some((t) => stackFilters.has(t)));
    }
    const sorted = [...list];
    if (sortBy === "stars") {
      sorted.sort((a, b) => b.stars - a.stars || a.install_name.localeCompare(b.install_name));
    } else if (sortBy === "votes") {
      sorted.sort(
        (a, b) =>
          (b.vote_score ?? 0) - (a.vote_score ?? 0) ||
          b.stars - a.stars ||
          a.install_name.localeCompare(b.install_name)
      );
    } else {
      sorted.sort((a, b) => a.install_name.localeCompare(b.install_name));
    }
    return sorted;
  }, [browseAssets, authorFilters, typeFilters, domainFilters, stackFilters, sortBy]);

  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [search, authorFilters, typeFilters, domainFilters, stackFilters, sortBy]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  useEffect(() => {
    document.querySelector(".browse-page")?.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]);

  const pageStart = shown.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, shown.length);
  const pageItems = useMemo(
    () => shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [shown, page]
  );

  const shownIds = useMemo(() => pageItems.map((a) => a.id), [pageItems]);
  const allShownSelected =
    shownIds.length > 0 && shownIds.every((id) => selectedIds.has(id));
  const someSelected = shownIds.some((id) => selectedIds.has(id));

  const activeFilterCount =
    (authorFilters.size ? 1 : 0) +
    (typeFilters.size ? 1 : 0) +
    (domainFilters.size ? 1 : 0) +
    (stackFilters.size ? 1 : 0);

  const clearFilters = () => {
    setAuthorFilters(new Set());
    setTypeFilters(new Set());
    setDomainFilters(new Set());
    setStackFilters(new Set());
  };

  return (
    <div className="harbor-page browse-page">
      <header className="browse-toolbar">
        <div className="browse-toolbar__row browse-toolbar__row--search">
          <input
            type="search"
            className="browse-toolbar__search"
            placeholder="Search by skill name, author, or repo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="browse-toolbar__sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            aria-label="Sort assets"
          >
            <option value="stars">Sort: Stars</option>
            <option value="votes">Sort: Votes</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>
        <div className="browse-toolbar__row browse-toolbar__row--filters">
          <MultiSelectDropdown
            label="GitHub authors"
            options={authorOptions}
            selected={authorFilters}
            onChange={setAuthorFilters}
          />
          <MultiSelectDropdown
            label="Types"
            options={TYPE_OPTIONS}
            selected={typeFilters}
            onChange={setTypeFilters}
          />
          <MultiSelectDropdown
            label="Domains"
            options={domainOptions}
            selected={domainFilters}
            onChange={setDomainFilters}
          />
          <MultiSelectDropdown
            label="Stack"
            options={stackOptions}
            selected={stackFilters}
            onChange={setStackFilters}
          />
          {activeFilterCount > 0 ? (
            <button type="button" className="browse-toolbar__clear" onClick={clearFilters}>
              Reset filters
            </button>
          ) : null}
        </div>
        <div className="browse-toolbar__row browse-toolbar__row--actions">
          <div className="browse-toolbar__selection">
            <button
              type="button"
              className="harbor-btn harbor-btn--ghost harbor-btn--sm"
              onClick={() => toggleSelectAllForIds(shownIds)}
              disabled={pageItems.length === 0}
            >
              {allShownSelected ? "Deselect page" : "Select page"}
            </button>
            <button
              type="button"
              className="harbor-btn harbor-btn--ghost harbor-btn--sm"
              onClick={deselectAll}
              disabled={selectedIds.size === 0}
            >
              Deselect all
            </button>
            {someSelected ? (
              <span className="browse-toolbar__selected">{selectedIds.size} in queue</span>
            ) : null}
          </div>
          <span className="browse-toolbar__count">
            {shown.length === 0
              ? `0 matches · ${registryTotal.toLocaleString()} in registry`
              : shown.length === registryTotal
                ? `${pageStart.toLocaleString()}–${pageEnd.toLocaleString()} of ${shown.length.toLocaleString()}`
                : `${pageStart.toLocaleString()}–${pageEnd.toLocaleString()} of ${shown.length.toLocaleString()} matches · ${registryTotal.toLocaleString()} in registry`}
          </span>
        </div>
      </header>
      <div className="harbor-card-grid harbor-card-grid--scroll">
        {pageItems.map((asset) => (
          <AssetRankCard
            key={asset.id}
            asset={asset}
            selected={selectedAssetId === asset.id}
            checked={selectedIds.has(asset.id)}
            onToggleCheck={() => toggleRow(asset.id)}
            onSelect={() => setSelectedAssetId(asset.id)}
          />
        ))}
      </div>
      {shown.length > PAGE_SIZE ? (
        <nav className="browse-pagination" aria-label="Browse pages">
          <button
            type="button"
            className="harbor-btn harbor-btn--ghost harbor-btn--sm"
            onClick={() => setPage(1)}
            disabled={page <= 1}
          >
            First
          </button>
          <button
            type="button"
            className="harbor-btn harbor-btn--ghost harbor-btn--sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <span className="browse-pagination__status">
            Page {page.toLocaleString()} of {totalPages.toLocaleString()}
          </span>
          <button
            type="button"
            className="harbor-btn harbor-btn--ghost harbor-btn--sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
          <button
            type="button"
            className="harbor-btn harbor-btn--ghost harbor-btn--sm"
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages}
          >
            Last
          </button>
        </nav>
      ) : null}
      {shown.length === 0 ? (
        <p className="harbor-empty">No assets match. Try Sync registry or adjust filters.</p>
      ) : null}
    </div>
  );
}
