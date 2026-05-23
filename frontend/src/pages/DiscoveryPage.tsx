import { useMemo } from "react";
import type { Studio } from "../hooks/useStudio";
import { buildDiscoverySections, type DashboardItem } from "../lib/dashboard";
import { AssetRankCard } from "../components/dashboard/AssetRankCard";
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

  const openAsset = (item: DashboardItem) => {
    setSelectedAssetId(item.asset?.id ?? item.id);
  };

  return (
    <div className="harbor-page">
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

      {trending ? (
        <section style={{ marginBottom: "1.5rem" }}>
          <header
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <span className="harbor-badge">GitHub Trending</span>
              <h2 style={{ margin: "0.5rem 0 0", fontSize: "1.25rem" }}>{trending.label}</h2>
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--harbor-muted)" }}>
                {trending.description}
              </p>
            </div>
            <TrendPeriodSwitch period={trendPeriod} onChange={setTrendPeriod} hasLiveData={hasCatalog} />
          </header>
          <div className="harbor-masonry">
            {trending.items.map((item, i) =>
              item.asset ? (
                <AssetRankCard
                  key={item.id}
                  asset={item.asset}
                  rank={i + 1}
                  selected={selectedAssetId === item.asset.id}
                  onSelect={() => openAsset(item)}
                />
              ) : null
            )}
          </div>
        </section>
      ) : null}

      {forYou && forYou.items.length > 0 ? (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>For You</h2>
          <div className="harbor-scroll-row">
            {forYou.items.map((item) =>
              item.asset ? (
                <AssetRankCard
                  key={item.id}
                  asset={item.asset}
                  selected={selectedAssetId === item.asset.id}
                  onSelect={() => openAsset(item)}
                />
              ) : null
            )}
          </div>
        </section>
      ) : null}

      {professions.length > 0 ? (
        <section>
          <h2 style={{ fontSize: "1.1rem", marginBottom: 12 }}>By profession · top 5 by stars</h2>
          <div className="harbor-masonry">
            {professions.map((section) => (
              <div key={section.id} className="harbor-card" style={{ padding: "0.75rem 0" }}>
                <h3 style={{ margin: "0 0 0.75rem", padding: "0 1rem", fontSize: "0.9rem" }}>
                  {section.label}
                </h3>
                {section.items.slice(0, 5).map((item) =>
                  item.asset ? (
                    <div key={item.id} style={{ marginBottom: 6 }}>
                      <AssetRankCard
                        asset={item.asset}
                        rank={item.rank}
                        selected={selectedAssetId === item.asset.id}
                        onSelect={() => openAsset(item)}
                      />
                    </div>
                  ) : null
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
