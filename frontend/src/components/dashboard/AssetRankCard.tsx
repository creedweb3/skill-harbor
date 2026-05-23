import type { Asset } from "../../api";
import { formatStars } from "../../lib/format";

type Props = {
  asset: Asset;
  selected: boolean;
  onSelect: () => void;
  rank?: number;
};

export function AssetRankCard({ asset, selected, onSelect }: Props) {
  const title = asset.curated_title || asset.install_name;
  const hasContent = Boolean(asset.content || asset.content_preview);

  return (
    <article
      className={`harbor-card harbor-card--clickable ${selected ? "selected" : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      role="button"
      tabIndex={0}
    >
      <p className="asset-card-body asset-card-title">{title}</p>
      <div className="asset-card-body asset-card-meta">
        <span className="harbor-badge">{asset.asset_type_label}</span>
        <span className="dash-rank dash-rank--stars">★ {formatStars(asset.stars)}</span>
        {!hasContent ? <span style={{ color: "var(--harbor-warn)" }}>Sync for content</span> : null}
      </div>
      <code className="asset-card-repo">{asset.source_repo}</code>
    </article>
  );
}
