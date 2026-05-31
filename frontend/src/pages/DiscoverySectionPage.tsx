import { useEffect, useMemo, useState } from "react";
import type { Studio } from "../hooks/useStudio";
import { AssetRankCard } from "../components/dashboard/AssetRankCard";
import { MiniBarChart, MiniGrowthChart } from "../components/charts/MiniCharts";
import { TrendPeriodSwitch } from "../components/discover/TrendPeriodSwitch";
import { HarborEmpty } from "../components/ui/HarborEmpty";
import { SingleSelectDropdown } from "../components/browse/SingleSelectDropdown";
import { SectionBar } from "../components/discover/SectionBar";
import { SelectionPill } from "../components/ui/SelectionPill";
import { TextAction } from "../components/ui/TextAction";
import {
  assetsForSectionView,
  buildCategoryAnalytics,
  categorySortOptions,
  defaultSortForSection,
  sortCategoryAssets,
  TREND_PERIOD_LABEL,
  type CategorySortKey,
  type DiscoverySectionView,
} from "../lib/categoryDetail";

const PAGE_SIZE = 48;

type Props = {
  studio: Studio;
  view: DiscoverySectionView;
  onBack: () => void;
  backLabel?: string;
  onOpenReposList?: () => void;
};

export function DiscoverySectionPage({
  studio,
  view,
  onBack,
  backLabel = "Discovery",
  onOpenReposList,
}: Props) {
  const {
    assets,
    installedItems,
    trendPeriod,
    setTrendPeriod,
    hasCatalog,
    selectedAssetId,
    setSelectedAssetId,
    selectedIds,
    toggleRow,
    toggleSelectAllForIds,
  } = studio;

  const isTrending = view.kind === "trending";
  const sortOptions = useMemo(() => categorySortOptions(view.kind), [view.kind]);
  const showSortDropdown = sortOptions.length > 0;

  const [sortBy, setSortBy] = useState<CategorySortKey>(() => defaultSortForSection(view.kind));
  const [page, setPage] = useState(1);

  useEffect(() => {
    setSortBy(defaultSortForSection(view.kind));
    setPage(1);
  }, [view.id, view.kind, view.domain]);

  useEffect(() => {
    setPage(1);
  }, [sortBy, trendPeriod]);

  const pool = useMemo(
    () => assetsForSectionView(view, assets, installedItems, trendPeriod),
    [view, assets, installedItems, trendPeriod]
  );

  // Trending list is already ordered by buildRepoTrends (same as Discovery home).
  const sorted = useMemo(
    () => (isTrending ? pool : sortCategoryAssets(pool, sortBy)),
    [pool, isTrending, sortBy]
  );
  const analytics = useMemo(() => buildCategoryAnalytics(pool), [pool]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const pageStart = sorted.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, sorted.length);
  const pageItems = useMemo(
    () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sorted, page]
  );
  const pageIds = useMemo(() => pageItems.map((a) => a.id), [pageItems]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  useEffect(() => {
    document.querySelector(".discovery-section-page")?.scrollTo({ top: 0, behavior: "smooth" });
  }, [page, view, trendPeriod, sortBy]);

  const rankMeta = isTrending
    ? `Mixed by repo trend · ${TREND_PERIOD_LABEL[trendPeriod]}`
    : (sortOptions.find((o) => o.value === sortBy)?.label ?? sortBy);

  const badge =
    view.kind === "trending"
      ? "Skills & rules"
      : view.kind === "for_you"
        ? "Personalized"
        : "Domain";

  return (
    <div className="harbor-page discovery-page discovery-section-page">
      <header className="discovery-detail-head">
        <button
          type="button"
          className="discovery-detail-back harbor-text-action"
          onClick={onBack}
        >
          ← {backLabel}
        </button>
        <div className="discovery-detail-head__main">
          <span className="harbor-badge harbor-badge--section">{badge}</span>
          <h1>{view.label}</h1>
          {view.description ? <p className="muted">{view.description}</p> : null}
          {view.kind === "trending" && onOpenReposList ? (
            <TextAction accent className="discovery-detail-repos-link" onClick={onOpenReposList}>
              View all repositories →
            </TextAction>
          ) : null}
        </div>
      </header>

      <section className="discovery-analytics">
        <article className="discovery-analytics-card">
          <h3>By type</h3>
          <MiniBarChart items={analytics.byAssetType} emptyLabel="No assets in this section." />
        </article>
        <article className="discovery-analytics-card">
          <h3>Top sources</h3>
          <MiniBarChart items={analytics.topRepos} emptyLabel="No repos yet." />
        </article>
        <article className="discovery-analytics-card">
          <h3>{analytics.voteLeaders.length ? "Vote leaders" : "Star distribution"}</h3>
          {analytics.voteLeaders.length ? (
            <MiniBarChart items={analytics.voteLeaders} />
          ) : (
            <MiniGrowthChart items={analytics.starsDistribution} labelSlice={0} />
          )}
        </article>
      </section>

      <SectionBar
        sticky
        start={
          <>
            {isTrending ? (
              <TrendPeriodSwitch
                period={trendPeriod}
                onChange={setTrendPeriod}
                hasLiveData={hasCatalog}
              />
            ) : null}
            {showSortDropdown ? (
              <SingleSelectDropdown
                className="section-bar__sort"
                label="Sort"
                options={sortOptions}
                value={sortBy}
                onChange={(v) => setSortBy(v as CategorySortKey)}
                aria-label="Sort category assets"
              />
            ) : null}
            <SelectionPill
              pressed={allPageSelected}
              onClick={() => toggleSelectAllForIds(pageIds)}
              disabled={pageItems.length === 0}
            >
              {allPageSelected ? "Deselect page" : "Select page"}
            </SelectionPill>
          </>
        }
        meta={
          sorted.length === 0
            ? isTrending
              ? `No repos active · ${rankMeta}`
              : "0 assets"
            : `${pageStart.toLocaleString()}–${pageEnd.toLocaleString()} of ${sorted.length.toLocaleString()} · ${rankMeta}`
        }
      />

      <div className="harbor-card-grid harbor-card-grid--row discovery-detail-grid">
        {pageItems.map((asset, i) => (
          <AssetRankCard
            key={asset.id}
            asset={asset}
            rank={(page - 1) * PAGE_SIZE + i + 1}
            checked={selectedIds.has(asset.id)}
            onToggleCheck={() => toggleRow(asset.id)}
            selected={selectedAssetId === asset.id}
            onSelect={() => setSelectedAssetId(asset.id)}
          />
        ))}
      </div>

      {sorted.length === 0 ? (
        <HarborEmpty
          title={isTrending ? "No skills to show yet" : "No assets in this domain"}
          description={
            isTrending
              ? "Sync content from the top bar to load the catalog and GitHub push dates."
              : "Run Sync content from the top bar, or check back after the next crawl."
          }
        />
      ) : null}

      {sorted.length > PAGE_SIZE ? (
        <nav className="browse-pagination" aria-label="Category pages">
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
    </div>
  );
}
