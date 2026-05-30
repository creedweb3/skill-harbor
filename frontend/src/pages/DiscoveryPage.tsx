import { useMemo, type CSSProperties } from "react";
import type { Studio } from "../hooks/useStudio";
import {
  buildDiscoverySections,
  discoveryLimits,
} from "../lib/dashboard";
import {
  sectionViewFromSection,
  assetInDomain,
  reposListView,
  type DiscoverySectionView,
} from "../lib/categoryDetail";
import { AssetRankCard } from "../components/dashboard/AssetRankCard";
import { RepoTrendCard } from "../components/dashboard/RepoTrendCard";
import { HarborEmpty } from "../components/ui/HarborEmpty";
import { DiscoveryPulse } from "../components/discover/DiscoveryPulse";
import { PanelFooter } from "../components/discover/PanelFooter";
import { SectionBar } from "../components/discover/SectionBar";
import { TrendPeriodSwitch } from "../components/discover/TrendPeriodSwitch";
import { SelectionPill } from "../components/ui/SelectionPill";
import { TextAction } from "../components/ui/TextAction";
import { clearDomainHash } from "../lib/domainHash";
import { buildDiscoveryPulse } from "../lib/discoveryPulse";
import {
  assetIdsForRepo,
  assetIdsForRepos,
  isRepoFullySelected,
} from "../lib/ranking";
import { DiscoverySectionPage } from "./DiscoverySectionPage";
import { ReposListPage } from "./ReposListPage";

type Props = {
  studio: Studio;
  sectionView: DiscoverySectionView | null;
  setSectionView: (view: DiscoverySectionView | null) => void;
  onOpenDomain: (view: DiscoverySectionView) => void;
  onGoToDomains: () => void;
};

export function DiscoveryPage({
  studio,
  sectionView,
  setSectionView,
  onOpenDomain,
  onGoToDomains,
}: Props) {
  const {
    discoveryPanelProfessions,
    discoveryUi,
    leaderboards,
    assets,
    installedItems,
    hasCatalog,
    trendPeriod,
    setTrendPeriod,
    selectedAssetId,
    setSelectedAssetId,
    selectedRepo,
    openRepo,
    selectedIds,
    toggleRow,
    toggleSelectAllForIds,
  } = studio;

  const lim = discoveryLimits(discoveryUi);
  const layoutCols = discoveryUi?.layout?.columns ?? 3;
  const layoutRows = discoveryUi?.layout?.rows ?? 2;

  const sections = useMemo(
    () =>
      buildDiscoverySections(
        discoveryPanelProfessions,
        leaderboards,
        assets,
        installedItems,
        trendPeriod,
        discoveryUi
      ),
    [
      discoveryPanelProfessions,
      leaderboards,
      assets,
      installedItems,
      trendPeriod,
      discoveryUi,
    ]
  );

  const trending = sections.find((s) => s.kind === "trending");
  const forYou = sections.find((s) => s.kind === "for_you");
  const professions = sections.filter((s) => s.kind === "profession");

  const forYouItems = (forYou?.items ?? []).filter(
    (item): item is typeof item & { asset: NonNullable<typeof item.asset> } => !!item.asset
  );

  const forYouIds = useMemo(() => forYouItems.map((item) => item.asset.id), [forYouItems]);
  const allForYouSelected =
    forYouIds.length > 0 && forYouIds.every((id) => selectedIds.has(id));

  const repoTrends = useMemo(
    () => (trending?.kind === "trending" ? trending.repoTrends.slice(0, lim.trending) : []),
    [trending, lim.trending]
  );
  const visibleRepoAssetIds = useMemo(
    () => assetIdsForRepos(assets, repoTrends.map((t) => t.source_repo)),
    [assets, repoTrends]
  );
  const allTrendingReposSelected =
    visibleRepoAssetIds.length > 0 &&
    visibleRepoAssetIds.every((id) => selectedIds.has(id));

  const pulseStats = useMemo(() => buildDiscoveryPulse(assets), [assets]);

  if (sectionView) {
    if (sectionView.kind === "repos") {
      return (
        <ReposListPage
          studio={studio}
          onBack={() => {
            setSectionView(null);
            clearDomainHash();
          }}
        />
      );
    }
    return (
      <DiscoverySectionPage
        studio={studio}
        view={sectionView}
        onBack={() => {
          setSectionView(null);
          clearDomainHash();
        }}
        onOpenReposList={() => setSectionView(reposListView())}
      />
    );
  }

  const openAsset = (item: (typeof forYouItems)[number]) => {
    setSelectedAssetId(item.asset?.id ?? item.id);
  };

  const openSection = (section: (typeof sections)[number]) => {
    const view = sectionViewFromSection(section);
    if (!view) return;
    if (view.kind === "profession" && view.domain) {
      onOpenDomain(view);
      return;
    }
    clearDomainHash();
    setSectionView(view);
  };

  return (
    <div className="harbor-page discovery-page">
      {assets.length > 0 ? (
        <DiscoveryPulse
          stats={pulseStats}
          onOpenLeader={
            pulseStats.monthLeader
              ? () => openRepo(pulseStats.monthLeader!.source_repo)
              : undefined
          }
        />
      ) : null}

      {trending && assets.length > 0 ? (
        <section className="discovery-section">
          <header className="discovery-section-head">
            <div className="discovery-section-head__main">
              <span className="harbor-badge harbor-badge--section">GitHub Trending</span>
              <h2>{trending.label}</h2>
              <p className="muted">{trending.description}</p>
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
                {repoTrends.length > 0 ? (
                  <SelectionPill
                    pressed={allTrendingReposSelected}
                    onClick={() => toggleSelectAllForIds(visibleRepoAssetIds)}
                    disabled={visibleRepoAssetIds.length === 0}
                  >
                    {allTrendingReposSelected ? "Deselect visible" : "Select visible"}
                  </SelectionPill>
                ) : null}
              </>
            }
            end={
              <>
                <TextAction accent onClick={() => setSectionView(reposListView())}>
                  View all repos →
                </TextAction>
                <TextAction accent onClick={() => openSection(trending)}>
                  View all skills →
                </TextAction>
              </>
            }
            meta={repoTrends.length > 0 ? `${repoTrends.length} repos` : "No matches"}
          />
          {repoTrends.length > 0 ? (
            <div className="harbor-card-grid harbor-card-grid--row">
              {repoTrends.map((trend, i) => (
                <RepoTrendCard
                  key={trend.source_repo}
                  sourceRepo={trend.source_repo}
                  stars={trend.stars}
                  assetCount={trend.assetCount}
                  representative={trend.representative}
                  rank={i + 1}
                  checked={isRepoFullySelected(selectedIds, assets, trend.source_repo)}
                  onToggleCheck={() =>
                    toggleSelectAllForIds(assetIdsForRepo(assets, trend.source_repo))
                  }
                  selected={selectedRepo === trend.source_repo}
                  onSelect={() => openRepo(trend.source_repo)}
                />
              ))}
            </div>
          ) : (
            <HarborEmpty
              title="No repos in this window"
              description="Try a longer period, or run Sync registry so push dates can populate from GitHub."
            />
          )}
        </section>
      ) : null}

      {forYou ? (
        <section className="discovery-section">
          <header className="discovery-section-head">
            <div className="discovery-section-head__main">
              <span className="harbor-badge harbor-badge--section">Personalized</span>
              <h2>{forYou.label}</h2>
              <p className="muted">{forYou.description}</p>
            </div>
          </header>
          {forYouItems.length > 0 ? (
            <>
              <SectionBar
                start={
                  <SelectionPill
                    pressed={allForYouSelected}
                    onClick={() => toggleSelectAllForIds(forYouIds)}
                  >
                    {allForYouSelected ? "Deselect section" : "Select section"}
                  </SelectionPill>
                }
                end={
                  <TextAction accent onClick={() => openSection(forYou)}>
                    Show all recommendations →
                  </TextAction>
                }
                meta={`${forYouItems.length} picks`}
              />
              <div className="harbor-card-grid harbor-card-grid--row">
                {forYouItems.map((item, i) => (
                  <AssetRankCard
                    key={item.id}
                    asset={item.asset}
                    rank={i + 1}
                    checked={selectedIds.has(item.asset.id)}
                    onToggleCheck={() => toggleRow(item.asset.id)}
                    selected={selectedAssetId === item.asset.id}
                    onSelect={() => openAsset(item)}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="discovery-empty-hint muted">
              Install a few skills from Browse — recommendations will appear here based on what you use.
            </p>
          )}
        </section>
      ) : null}

      {professions.length > 0 ? (
        <section className="discovery-section discovery-section--domains">
          <header className="discovery-domains-head">
            <div className="discovery-domains-head__main">
              <span className="harbor-badge harbor-badge--section">By domain</span>
              <h2>Top skills by stars</h2>
              <p className="muted discovery-domains-head__lead">
                {lim.itemsPerDomain} featured per domain · {professions.length} categories in the
                registry
              </p>
            </div>
            <TextAction accent className="discovery-domains-head__cta" onClick={onGoToDomains}>
              All domains →
            </TextAction>
          </header>
          <div
            className="profession-panels profession-panels--grid"
            style={
              {
                "--profession-cols": layoutCols,
                "--profession-card-cols": layoutCols,
                "--profession-card-rows": layoutRows,
              } as CSSProperties
            }
          >
            {professions.map((section) => {
              const items = section.items
                .filter(
                  (item): item is typeof item & { asset: NonNullable<typeof item.asset> } =>
                    !!item.asset
                )
                .slice(0, lim.itemsPerDomain);
              if (items.length === 0) return null;
              const sectionIds = items.map((item) => item.asset.id);
              const allSectionSelected =
                sectionIds.length > 0 && sectionIds.every((id) => selectedIds.has(id));
              return (
                <article key={section.id} className="profession-panel">
                  <header className="profession-panel__head">
                    <h3 className="profession-panel__title">{section.label}</h3>
                    <span className="profession-panel__count muted">
                      {assets.filter((a) => assetInDomain(a, section.domain)).length} in domain
                    </span>
                  </header>
                  <div className="profession-panel__cards profession-panel__cards--matrix">
                    {items.map((item, i) => (
                      <AssetRankCard
                        key={item.id}
                        asset={item.asset}
                        rank={i + 1}
                        checked={selectedIds.has(item.asset.id)}
                        onToggleCheck={() => toggleRow(item.asset.id)}
                        selected={selectedAssetId === item.asset.id}
                        onSelect={() => openAsset(item)}
                      />
                    ))}
                  </div>
                  <PanelFooter
                    start={
                      <SelectionPill
                        pressed={allSectionSelected}
                        onClick={() => toggleSelectAllForIds(sectionIds)}
                      >
                        {allSectionSelected ? "Deselect visible" : "Select visible"}
                      </SelectionPill>
                    }
                    end={
                      <TextAction accent onClick={() => openSection(section)}>
                        Show all →
                      </TextAction>
                    }
                  />
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
