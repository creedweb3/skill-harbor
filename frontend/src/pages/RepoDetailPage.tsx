import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Studio } from "../hooks/useStudio";
import { AssetRankCard } from "../components/dashboard/AssetRankCard";
import { MiniBarChart } from "../components/charts/MiniCharts";
import { HarborEmpty } from "../components/ui/HarborEmpty";
import { SingleSelectDropdown } from "../components/browse/SingleSelectDropdown";
import { SectionBar } from "../components/discover/SectionBar";
import { SelectionPill } from "../components/ui/SelectionPill";
import {
  buildCategoryAnalytics,
  CATEGORY_SORT_OPTIONS,
  sortCategoryAssets,
  type CategorySortKey,
} from "../lib/categoryDetail";
import { formatStars } from "../lib/format";
import { repoBrowseUrlFromAssets } from "../lib/githubUrls";
import { assetsForRepo, repoAccentHue, repoOwner, repoTrendFor } from "../lib/ranking";

const PAGE_SIZE = 48;

type Props = {
  studio: Studio;
};

export function RepoDetailPage({ studio }: Props) {
  const {
    selectedRepo,
    closeRepo,
    assets,
    trendPeriod,
    selectedAssetId,
    setSelectedAssetId,
    selectedIds,
    toggleRow,
    toggleSelectAllForIds,
  } = studio;

  const [sortBy, setSortBy] = useState<CategorySortKey>("rank");
  const [page, setPage] = useState(1);

  const sourceRepo = selectedRepo ?? "";
  const pool = useMemo(
    () => (sourceRepo ? assetsForRepo(assets, sourceRepo) : []),
    [assets, sourceRepo]
  );
  const trend = useMemo(
    () => (sourceRepo ? repoTrendFor(assets, sourceRepo, trendPeriod) : null),
    [assets, sourceRepo, trendPeriod]
  );

  const sorted = useMemo(() => sortCategoryAssets(pool, sortBy), [pool, sortBy]);
  const analytics = useMemo(() => buildCategoryAnalytics(pool), [pool]);
  const domainChart = useMemo(() => {
    const byDomain = new Map<string, number>();
    for (const asset of pool) {
      for (const d of asset.domains ?? asset.categories) {
        byDomain.set(d, (byDomain.get(d) ?? 0) + 1);
      }
    }
    return [...byDomain.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }));
  }, [pool]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageStart = sorted.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, sorted.length);
  const pageItems = useMemo(
    () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sorted, page]
  );
  const pageIds = useMemo(() => pageItems.map((a) => a.id), [pageItems]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const githubRepoUrl = useMemo(() => repoBrowseUrlFromAssets(pool), [pool]);
  const stars = trend?.stars ?? pool[0]?.stars ?? 0;
  const accentHue = repoAccentHue(sourceRepo);

  useEffect(() => {
    setSortBy("rank");
    setPage(1);
  }, [sourceRepo]);

  useEffect(() => {
    setPage(1);
  }, [sortBy]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  useEffect(() => {
    document.querySelector(".repo-detail-page")?.scrollTo({ top: 0, behavior: "smooth" });
  }, [page, sourceRepo]);

  if (!selectedRepo) return null;

  const openAsset = (id: string) => setSelectedAssetId(id);

  return (
    <div
      className="harbor-page discovery-page discovery-section-page repo-detail-page"
      style={{ "--repo-accent-hue": accentHue } as CSSProperties}
    >
      <header className="discovery-detail-head repo-detail-head">
        <button
          type="button"
          className="discovery-detail-back harbor-text-action"
          onClick={closeRepo}
        >
          ← Back
        </button>
        <div className="discovery-detail-head__main">
          <span className="harbor-badge harbor-badge--section">Repository</span>
          <h1 className="repo-detail-title">{sourceRepo}</h1>
          <p className="muted repo-detail-meta">
            <span className="dash-rank dash-rank--stars">★ {formatStars(stars)}</span>
            <span className="meta-sep">·</span>
            <span>{pool.length} skills & rules</span>
            <span className="meta-sep">·</span>
            <span>{repoOwner(sourceRepo)}</span>
          </p>
          {githubRepoUrl ? (
            <a
              href={githubRepoUrl}
              target="_blank"
              rel="noreferrer"
              className="harbor-btn harbor-btn--ghost harbor-btn--sm repo-detail-github"
            >
              Open on GitHub ↗
            </a>
          ) : null}
        </div>
      </header>

      <section className="discovery-analytics">
        <article className="discovery-analytics-card">
          <h3>By type</h3>
          <MiniBarChart items={analytics.byAssetType} emptyLabel="No assets in this repo." />
        </article>
        <article className="discovery-analytics-card">
          <h3>Domains</h3>
          <MiniBarChart items={domainChart} emptyLabel="No domain tags yet." />
        </article>
        <article className="discovery-analytics-card">
          <h3>Vote leaders</h3>
          {analytics.voteLeaders.length ? (
            <MiniBarChart items={analytics.voteLeaders} />
          ) : (
            <MiniBarChart items={analytics.starsDistribution} emptyLabel="No votes yet." />
          )}
        </article>
      </section>

      <SectionBar
        sticky
        start={
          <>
            <SingleSelectDropdown
              className="section-bar__sort"
              label="Sort"
              options={CATEGORY_SORT_OPTIONS}
              value={sortBy}
              onChange={(v) => setSortBy(v as CategorySortKey)}
              aria-label="Sort repo assets"
            />
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
            ? "0 assets"
            : `${pageStart.toLocaleString()}–${pageEnd.toLocaleString()} of ${sorted.length.toLocaleString()}`
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
            onSelect={() => openAsset(asset.id)}
          />
        ))}
      </div>

      {sorted.length === 0 ? (
        <HarborEmpty
          title="No skills in this repository"
          description="This repo may not be indexed yet. Try Sync registry from the top bar."
        />
      ) : null}

      {sorted.length > PAGE_SIZE ? (
        <nav className="browse-pagination" aria-label="Repo asset pages">
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
