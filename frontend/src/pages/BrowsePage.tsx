import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Studio } from "../hooks/useStudio";
import { VirtualBrowseGrid } from "../components/browse/VirtualBrowseGrid";
import { FilterChips } from "../components/browse/FilterChips";
import { MultiSelectDropdown } from "../components/browse/MultiSelectDropdown";
import { ActionToolbar, ActionToolbarDivider } from "../components/layout/ActionToolbar";
import { HarborEmpty } from "../components/ui/HarborEmpty";
import { SelectionPill } from "../components/ui/SelectionPill";
import { listRepoOwners, repoOwner } from "../lib/ranking";

const TYPE_OPTIONS = [
  { value: "skill", label: "Skills" },
  { value: "rule", label: "Rules" },
  { value: "command", label: "Commands" },
  { value: "agent", label: "Agents" },
];

type SortKey = "stars" | "votes" | "name";

type Props = {
  studio: Studio;
  searchRef?: RefObject<HTMLInputElement | null>;
};

export function BrowsePage({ studio, searchRef }: Props) {
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
    busy,
    syncRegistry,
  } = studio;
  const [authorFilters, setAuthorFilters] = useState<Set<string>>(() => new Set());
  const [typeFilters, setTypeFilters] = useState<Set<string>>(() => new Set());
  const [domainFilters, setDomainFilters] = useState<Set<string>>(() => new Set());
  const [stackFilters, setStackFilters] = useState<Set<string>>(() => new Set());
  const [sortBy, setSortBy] = useState<SortKey>("stars");
  const pageRef = useRef<HTMLDivElement>(null);

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

  const useVirtualGrid = shown.length > 0;
  const shownIds = useMemo(() => shown.map((a) => a.id), [shown]);
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

  const handleToggleCheck = useCallback((id: string) => toggleRow(id), [toggleRow]);
  const handleSelect = useCallback((id: string) => setSelectedAssetId(id), [setSelectedAssetId]);

  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [search, authorFilters, typeFilters, domainFilters, stackFilters, sortBy]);

  const filterChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    for (const v of authorFilters) {
      const label = authorOptions.find((o) => o.value === v)?.label ?? v;
      chips.push({
        key: `author-${v}`,
        label: `Author: ${label}`,
        onRemove: () =>
          setAuthorFilters((prev) => {
            const n = new Set(prev);
            n.delete(v);
            return n;
          }),
      });
    }
    for (const v of typeFilters) {
      const label = TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
      chips.push({
        key: `type-${v}`,
        label: label,
        onRemove: () =>
          setTypeFilters((prev) => {
            const n = new Set(prev);
            n.delete(v);
            return n;
          }),
      });
    }
    for (const v of domainFilters) {
      const label = domainOptions.find((o) => o.value === v)?.label ?? v;
      chips.push({
        key: `domain-${v}`,
        label: label,
        onRemove: () =>
          setDomainFilters((prev) => {
            const n = new Set(prev);
            n.delete(v);
            return n;
          }),
      });
    }
    for (const v of stackFilters) {
      const label = stackOptions.find((o) => o.value === v)?.label ?? v;
      chips.push({
        key: `stack-${v}`,
        label: `Stack: ${label}`,
        onRemove: () =>
          setStackFilters((prev) => {
            const n = new Set(prev);
            n.delete(v);
            return n;
          }),
      });
    }
    return chips;
  }, [authorFilters, typeFilters, domainFilters, stackFilters, authorOptions, domainOptions, stackOptions]);

  return (
    <div ref={pageRef} className="harbor-page browse-page">
      <header className="browse-toolbar">
        <div className="browse-toolbar__panel harbor-action-bar harbor-action-bar--stacked">
        <div className="browse-toolbar__row browse-toolbar__row--search">
          <div className="browse-search-wrap">
            <input
              ref={searchRef}
              type="search"
              className="browse-toolbar__search"
              placeholder="Search by skill name, author, or repo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-keyshortcuts="/"
            />
            <kbd className="browse-search-kbd" aria-hidden>
              /
            </kbd>
          </div>
          <select
            className="harbor-action-bar__select browse-toolbar__sort"
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
        </div>
        <FilterChips chips={filterChips} onClearAll={filterChips.length > 1 ? clearFilters : undefined} />
        <ActionToolbar
          className="browse-toolbar__actions"
          count={
            shown.length === 0
              ? `0 matches · ${registryTotal.toLocaleString()} in registry`
              : shown.length === registryTotal
                ? `${shown.length.toLocaleString()} assets`
                : `${shown.length.toLocaleString()} matches · ${registryTotal.toLocaleString()} in registry`
          }
        >
          <SelectionPill
            pressed={allShownSelected}
            onClick={() => toggleSelectAllForIds(shownIds)}
            disabled={shown.length === 0}
          >
            {allShownSelected ? "Deselect shown" : "Select shown"}
          </SelectionPill>
          <SelectionPill pressed={false} onClick={deselectAll} disabled={selectedIds.size === 0}>
            Deselect all
          </SelectionPill>
          {someSelected ? (
            <>
              <ActionToolbarDivider />
              <span className="browse-toolbar__selected">{selectedIds.size} in queue</span>
            </>
          ) : null}
        </ActionToolbar>
        </div>
      </header>
      {useVirtualGrid ? (
        <VirtualBrowseGrid
          items={shown}
          scrollRef={pageRef}
          selectedAssetId={selectedAssetId}
          selectedIds={selectedIds}
          onToggleCheck={handleToggleCheck}
          onSelect={handleSelect}
        />
      ) : null}
      {shown.length === 0 ? (
        <HarborEmpty
          title={activeFilterCount > 0 || search.trim() ? "No matches" : "Registry is empty"}
          description={
            activeFilterCount > 0 || search.trim()
              ? "Try removing a filter or broadening your search."
              : "Sync from GitHub to populate the catalog with skills, rules, and agents."
          }
        >
          <button
            type="button"
            className="harbor-btn harbor-btn--primary harbor-btn--sm"
            onClick={() => syncRegistry()}
            disabled={busy}
          >
            {busy ? "Syncing…" : "Sync registry"}
          </button>
          {(activeFilterCount > 0 || search.trim()) && (
            <button type="button" className="harbor-btn harbor-btn--ghost harbor-btn--sm" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </HarborEmpty>
      ) : null}
    </div>
  );
}
