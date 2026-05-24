import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { Studio } from "../hooks/useStudio";
import {
  buildDiscoverySections,
  discoveryLimits,
} from "../lib/dashboard";
import { sectionViewFromSection, assetInDomain } from "../lib/categoryDetail";
import { AssetRankCard } from "../components/dashboard/AssetRankCard";
import { RepoTrendCard } from "../components/dashboard/RepoTrendCard";
import { TrendPeriodSwitch } from "../components/discover/TrendPeriodSwitch";
import { DiscoverySectionPage } from "./DiscoverySectionPage";

type Props = { studio: Studio };

function SectionToolbar({
  children,
  count,
}: {
  children: ReactNode;
  count?: string;
}) {
  return (
    <div className="discovery-section-toolbar">
      <div className="discovery-section-toolbar__left">{children}</div>
      {count ? <span className="discovery-section-toolbar__count">{count}</span> : null}
    </div>
  );
}

export function DiscoveryPage({ studio }: Props) {
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
    selectedIds,
    toggleRow,
    toggleSelectAllForIds,
    dbStats,
  } = studio;

  const [sectionView, setSectionView] = useState<ReturnType<typeof sectionViewFromSection>>(null);

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

  if (sectionView) {
    return (
      <DiscoverySectionPage
        studio={studio}
        view={sectionView}
        onBack={() => setSectionView(null)}
      />
    );
  }

  const repoTrends =
    trending?.kind === "trending" ? trending.repoTrends.slice(0, lim.trending) : [];

  const openAsset = (item: (typeof forYouItems)[number]) => {
    setSelectedAssetId(item.asset?.id ?? item.id);
  };

  const openSection = (section: (typeof sections)[number]) => {
    const view = sectionViewFromSection(section);
    if (view) setSectionView(view);
  };

  return (
    <div className="harbor-page discovery-page">
      <section className="harbor-kpi-strip">
        <div className="harbor-kpi">
          <strong>{dbStats?.asset_count ?? assets.length}</strong>
          <span>Registry assets</span>
        </div>
        <div className="harbor-kpi">
          <strong>{dbStats?.synced_content_count ?? 0}</strong>
          <span>With full content</span>
        </div>
        <div className="harbor-kpi">
          <strong>{selectedIds.size}</strong>
          <span>Selected to install</span>
        </div>
      </section>

      {repoTrends.length > 0 && trending ? (
        <section className="discovery-section">
          <header className="discovery-section-head">
            <div className="discovery-section-head__main">
              <span className="harbor-badge harbor-badge--section">GitHub Trending</span>
              <h2>{trending.label}</h2>
              <p className="muted">{trending.description}</p>
            </div>
          </header>
          <SectionToolbar count={`${repoTrends.length} repos shown`}>
            <TrendPeriodSwitch period={trendPeriod} onChange={setTrendPeriod} hasLiveData={hasCatalog} />
            <button
              type="button"
              className="harbor-btn harbor-btn--ghost harbor-btn--sm"
              onClick={() => openSection(trending)}
            >
              View all rankings →
            </button>
          </SectionToolbar>
          <div className="harbor-card-grid harbor-card-grid--row">
            {repoTrends.map((trend, i) => (
              <RepoTrendCard
                key={trend.source_repo}
                sourceRepo={trend.source_repo}
                stars={trend.stars}
                assetCount={trend.assetCount}
                representative={trend.representative}
                rank={i + 1}
                selected={selectedAssetId === trend.representative.id}
                onSelect={() => setSelectedAssetId(trend.representative.id)}
              />
            ))}
          </div>
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
              <SectionToolbar count={`${forYouItems.length} picks`}>
                <button
                  type="button"
                  className="harbor-btn harbor-btn--ghost harbor-btn--sm"
                  onClick={() => toggleSelectAllForIds(forYouIds)}
                >
                  {allForYouSelected ? "Deselect section" : "Select section"}
                </button>
                <button
                  type="button"
                  className="harbor-btn harbor-btn--ghost harbor-btn--sm discovery-section-toolbar__primary"
                  onClick={() => openSection(forYou)}
                >
                  Show all recommendations →
                </button>
              </SectionToolbar>
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
        <section className="discovery-section">
          <h2 className="discovery-section-title">
            By profession · top {lim.itemsPerDomain} skills by stars
            <span className="discovery-section-meta muted">
              {layoutCols}×{layoutRows} grid · {professions.length} categories
              {discoveryUi?.rotate_domains ? " · rotates weekly" : ""}
            </span>
          </h2>
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
                      {assets.filter((a) => assetInDomain(a, section.domain)).length} in category
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
                  <footer className="profession-panel__footer">
                    <button
                      type="button"
                      className="harbor-btn harbor-btn--ghost harbor-btn--sm"
                      onClick={() => toggleSelectAllForIds(sectionIds)}
                    >
                      {allSectionSelected ? "Deselect" : "Select visible"}
                    </button>
                    <button
                      type="button"
                      className="harbor-btn harbor-btn--ghost harbor-btn--sm profession-panel__more"
                      onClick={() => openSection(section)}
                    >
                      Show all →
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
