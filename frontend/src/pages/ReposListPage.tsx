import { useEffect, useMemo, useState } from "react";
import type { Studio } from "../hooks/useStudio";
import { RepoTrendCard } from "../components/dashboard/RepoTrendCard";
import { TrendPeriodSwitch } from "../components/discover/TrendPeriodSwitch";
import { HarborEmpty } from "../components/ui/HarborEmpty";
import { SectionBar } from "../components/discover/SectionBar";
import { SelectionPill } from "../components/ui/SelectionPill";
import {
  assetIdsForRepo,
  assetIdsForRepos,
  buildRepoTrends,
  isRepoFullySelected,
} from "../lib/ranking";

const PAGE_SIZE = 36;

type Props = {
  studio: Studio;
  onBack: () => void;
};

export function ReposListPage({ studio, onBack }: Props) {
  const {
    assets,
    trendPeriod,
    setTrendPeriod,
    hasCatalog,
    selectedRepo,
    openRepo,
    selectedIds,
    toggleSelectAllForIds,
  } = studio;

  const [page, setPage] = useState(1);

  const repoTrends = useMemo(
    () => buildRepoTrends(assets, trendPeriod, assets.length),
    [assets, trendPeriod]
  );

  const totalPages = Math.max(1, Math.ceil(repoTrends.length / PAGE_SIZE));
  const pageStart = repoTrends.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, repoTrends.length);
  const pageItems = useMemo(
    () => repoTrends.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [repoTrends, page]
  );

  const pageRepoAssetIds = useMemo(
    () => assetIdsForRepos(assets, pageItems.map((t) => t.source_repo)),
    [assets, pageItems]
  );
  const allPageReposSelected =
    pageRepoAssetIds.length > 0 && pageRepoAssetIds.every((id) => selectedIds.has(id));

  useEffect(() => {
    setPage(1);
  }, [trendPeriod]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  useEffect(() => {
    document.querySelector(".repos-list-page")?.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]);

  return (
    <div className="harbor-page discovery-page discovery-section-page repos-list-page">
      <header className="discovery-detail-head">
        <button
          type="button"
          className="discovery-detail-back harbor-text-action"
          onClick={onBack}
        >
          ← Discovery
        </button>
        <div className="discovery-detail-head__main">
          <span className="harbor-badge harbor-badge--section">Repositories</span>
          <h1>All ranked repositories</h1>
          <p className="muted">
            Browse every indexed GitHub repo and open one to see its skills, rules, and commands.
          </p>
        </div>
      </header>

      <SectionBar
        start={
          <>
            <TrendPeriodSwitch
              period={trendPeriod}
              onChange={setTrendPeriod}
              hasLiveData={hasCatalog}
            />
            <SelectionPill
              pressed={allPageReposSelected}
              onClick={() => toggleSelectAllForIds(pageRepoAssetIds)}
              disabled={pageRepoAssetIds.length === 0}
            >
              {allPageReposSelected ? "Deselect page" : "Select page"}
            </SelectionPill>
          </>
        }
        meta={
          repoTrends.length === 0
            ? "0 repos"
            : repoTrends.length > PAGE_SIZE
              ? `${pageStart.toLocaleString()}–${pageEnd.toLocaleString()} of ${repoTrends.length.toLocaleString()}`
              : `${repoTrends.length.toLocaleString()} repos`
        }
      />

      <div className="harbor-card-grid harbor-card-grid--row discovery-detail-repos">
        {pageItems.map((trend, i) => (
          <RepoTrendCard
            key={trend.source_repo}
            sourceRepo={trend.source_repo}
            stars={trend.stars}
            assetCount={trend.assetCount}
            representative={trend.representative}
            rank={(page - 1) * PAGE_SIZE + i + 1}
            checked={isRepoFullySelected(selectedIds, assets, trend.source_repo)}
            onToggleCheck={() =>
              toggleSelectAllForIds(assetIdsForRepo(assets, trend.source_repo))
            }
            selected={selectedRepo === trend.source_repo}
            onSelect={() => openRepo(trend.source_repo)}
          />
        ))}
      </div>

      {repoTrends.length === 0 ? (
        <HarborEmpty
          title="No repositories indexed"
          description="Run Sync registry from the top bar to crawl GitHub sources."
        />
      ) : null}

      {repoTrends.length > PAGE_SIZE ? (
        <nav className="browse-pagination" aria-label="Repository pages">
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
