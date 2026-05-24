import { useMemo } from "react";
import type { Studio } from "../../hooks/useStudio";
import {
  buildDiscoverySections,
  dashboardItemSelectable,
  type DashboardItem,
  type DiscoverySection,
} from "../../lib/dashboard";
import { Button } from "../ui/Button";
import { DashboardListRow } from "./DashboardListRow";
import { TrendPeriodSwitch } from "./TrendPeriodSwitch";

type Props = Pick<
  Studio,
  | "discoveryProfessions"
  | "leaderboards"
  | "assets"
  | "installedItems"
  | "hasCatalog"
  | "busy"
  | "selectedIds"
  | "fetchCatalog"
  | "toggleRow"
  | "curatedHelp"
  | "trendPeriod"
  | "setTrendPeriod"
>;

function ItemList({
  section,
  selectedIds,
  onToggle,
  layout = "list",
}: {
  section: DiscoverySection;
  selectedIds: Set<string>;
  onToggle: (item: DashboardItem) => void;
  layout?: "list" | "scroll";
}) {
  return (
    <ol className={`dash-list dash-list--${layout}`}>
      {section.items.map((item) => {
        const assetId = dashboardItemSelectable(item);
        return (
          <DashboardListRow
            key={item.id}
            item={item}
            selected={assetId ? selectedIds.has(assetId) : false}
            onToggle={() => onToggle(item)}
            disabled={!assetId}
            rankMode={section.kind === "trending" && !!item.asset ? "stars" : "rank"}
          />
        );
      })}
    </ol>
  );
}

export function DiscoveryDashboard({
  discoveryProfessions,
  leaderboards,
  assets,
  installedItems,
  hasCatalog,
  busy,
  selectedIds,
  fetchCatalog,
  toggleRow,
  curatedHelp,
  trendPeriod,
  setTrendPeriod,
}: Props) {
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

  const handleToggle = (item: DashboardItem) => {
    const assetId = dashboardItemSelectable(item);
    if (assetId) toggleRow(assetId);
  };

  if (!trending && professions.length === 0) {
    return (
      <div className="dash-empty">
        <p className="empty-title">Discovery unavailable</p>
        <p className="muted">Connect to the API to load rankings.</p>
      </div>
    );
  }

  return (
    <div className="discovery-dashboard" aria-label="Discovery">
      {!hasCatalog ? (
        <div className="dash-hint card-surface">
          <p>
            Rankings from our{" "}
            <abbr title={curatedHelp} className="curated-tip">
              curated manifest
            </abbr>
            . Fetch the catalog for live GitHub stars, update dates, and install.
          </p>
          <Button variant="primary" size="sm" onClick={() => fetchCatalog()} disabled={busy}>
            {busy ? "Loading…" : "Reload catalog"}
          </Button>
        </div>
      ) : null}

      {trending ? (
        <section className="dash-trending-hero card-surface">
          <header className="dash-hero-head">
            <div>
              <span className="dash-eyebrow">GitHub Trending</span>
              <h3>{trending.label}</h3>
              <p className="muted">{trending.description}</p>
            </div>
            <TrendPeriodSwitch
              period={trendPeriod}
              onChange={setTrendPeriod}
              hasLiveData={hasCatalog}
            />
          </header>
          <ItemList section={trending} selectedIds={selectedIds} onToggle={handleToggle} />
        </section>
      ) : null}

      {forYou && forYou.items.length > 0 ? (
        <section className="dash-for-you card-surface">
          <header className="dash-panel-head">
            <div>
              <span className="dash-eyebrow">Personalized</span>
              <h3>{forYou.label}</h3>
              <p className="muted">{forYou.description}</p>
            </div>
            <span className="count-badge">{forYou.items.length}</span>
          </header>
          <ItemList
            section={forYou}
            selectedIds={selectedIds}
            onToggle={handleToggle}
            layout="scroll"
          />
        </section>
      ) : null}

      {professions.length > 0 ? (
        <section className="dash-professions" aria-labelledby="professions-heading">
          <h2 id="professions-heading" className="dash-professions-title">
            By profession
          </h2>
          <div className="dash-masonry">
            {professions.map((section) => (
              <article key={section.id} className="dash-panel card-surface">
                <header className="dash-panel-head dash-panel-head--compact">
                  <h3>{section.label}</h3>
                  <span className="count-badge">{section.items.length}</span>
                </header>
                <ItemList section={section} selectedIds={selectedIds} onToggle={handleToggle} />
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
