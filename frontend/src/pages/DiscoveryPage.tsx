import { useMemo } from "react";
import type { Studio } from "../hooks/useStudio";
import {
  buildDiscoverySections,
  DOMAIN_LIMIT,
  TRENDING_LIMIT,
  type DashboardItem,
} from "../lib/dashboard";
import { AssetRankCard } from "../components/dashboard/AssetRankCard";
import { RepoTrendCard } from "../components/dashboard/RepoTrendCard";
import { TrendPeriodSwitch } from "../components/discover/TrendPeriodSwitch";

type Props = { studio: Studio };

export function DiscoveryPage({ studio }: Props) {
  const {
    discoveryProfessions,
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

  const sections = useMemo(
    () =>
      buildDiscoverySections(
        discoveryProfessions,
        leaderboards,
        assets,
        installedItems,
        trendPeriod
      ),
    [discoveryProfessions, leaderboards, assets, installedItems, trendPeriod]
  );

  const trending = sections.find((s) => s.kind === "trending");
  const forYou = sections.find((s) => s.kind === "for_you");
  const professions = sections.filter((s) => s.kind === "profession");

  const repoTrends =
    trending?.kind === "trending" ? trending.repoTrends.slice(0, TRENDING_LIMIT) : [];

  const forYouItems = (forYou?.items ?? []).filter(
    (item): item is DashboardItem & { asset: NonNullable<DashboardItem["asset"]> } => !!item.asset
  );

  const forYouIds = useMemo(() => forYouItems.map((item) => item.asset.id), [forYouItems]);
  const allForYouSelected =
    forYouIds.length > 0 && forYouIds.every((id) => selectedIds.has(id));

  const openAsset = (item: DashboardItem) => {
    setSelectedAssetId(item.asset?.id ?? item.id);
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

      {repoTrends.length > 0 ? (
        <section className="discovery-section">
          <header className="discovery-section-head">
            <div>
              <span className="harbor-badge harbor-badge--section">GitHub Trending</span>
              <h2>{trending?.label}</h2>
              <p className="muted">{trending?.description}</p>
            </div>
            <TrendPeriodSwitch period={trendPeriod} onChange={setTrendPeriod} hasLiveData={hasCatalog} />
          </header>
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
          <header className="discovery-section-head discovery-section-head--compact">
            <div>
              <span className="harbor-badge harbor-badge--section">Personalized</span>
              <h2>{forYou.label}</h2>
              <p className="muted">{forYou.description}</p>
            </div>
            {forYouItems.length > 0 ? (
              <div className="discovery-section-actions">
                <button
                  type="button"
                  className="harbor-btn harbor-btn--ghost harbor-btn--sm"
                  onClick={() => toggleSelectAllForIds(forYouIds)}
                >
                  {allForYouSelected ? "Deselect section" : "Select section"}
                </button>
              </div>
            ) : null}
          </header>
          {forYouItems.length > 0 ? (
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
            By profession · top {DOMAIN_LIMIT} skills by stars
          </h2>
          <div className="profession-panels harbor-bento">
            {professions.map((section) => {
              const items = section.items
                .filter(
                  (item): item is DashboardItem & { asset: NonNullable<DashboardItem["asset"]> } =>
                    !!item.asset
                )
                .slice(0, DOMAIN_LIMIT);
              if (items.length === 0) return null;
              return (
                <article key={section.id} className="profession-panel">
                  <h3 className="profession-panel__title">{section.label}</h3>
                  <div className="profession-panel__cards">
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
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
