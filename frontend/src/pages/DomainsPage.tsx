import { useMemo } from "react";
import type { Studio } from "../hooks/useStudio";
import {
  assetInDomain,
  domainViewForProfession,
  type DiscoverySectionView,
} from "../lib/categoryDetail";

type Props = {
  studio: Studio;
  onOpenDomain: (view: DiscoverySectionView) => void;
};

export function DomainsPage({ studio, onOpenDomain }: Props) {
  const { discoveryProfessions, assets, dbStats } = studio;

  const domains = useMemo(() => {
    return discoveryProfessions.map((p) => {
      const count = assets.filter((a) => assetInDomain(a, p.domain)).length;
      return { profession: p, count, view: domainViewForProfession(p) };
    });
  }, [discoveryProfessions, assets]);

  const totalAssets = dbStats?.asset_count ?? assets.length;

  return (
    <div className="harbor-page domains-page">
      <header className="domains-page__head">
        <span className="harbor-badge harbor-badge--section">Registry</span>
        <h1>Domains</h1>
        <p className="muted domains-page__lead">
          Browse skills by profession and stack. {domains.length} domains ·{" "}
          {totalAssets.toLocaleString()} assets in the registry.
        </p>
      </header>

      <ul className="domains-grid" role="list">
        {domains.map(({ profession, count, view }) => (
          <li key={profession.domain}>
            <button
              type="button"
              className="domains-card"
              onClick={() => onOpenDomain(view)}
            >
              <span className="domains-card__label">{profession.label}</span>
              <span className="domains-card__count">
                {count.toLocaleString()}
                <span className="domains-card__count-label">assets</span>
              </span>
              <span className="domains-card__arrow" aria-hidden>
                →
              </span>
            </button>
          </li>
        ))}
      </ul>

      {domains.length === 0 ? (
        <p className="muted">No domains configured. Check discovery settings in Admin.</p>
      ) : null}
    </div>
  );
}
