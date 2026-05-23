import type { Asset } from "../../api";
import { formatStars } from "../../lib/format";
import { assetTypeBadgeClass, formatSourceRepo } from "../../lib/assetType";
import { assetDisplayTitle } from "../../lib/ranking";
import { CardSelectToggle } from "../ui/CardSelectToggle";

type Props = {
  asset: Asset;
  selected: boolean;
  onSelect: () => void;
  rank?: number;
  checked?: boolean;
  onToggleCheck?: () => void;
};

export function AssetRankCard({
  asset,
  selected,
  onSelect,
  rank,
  checked = false,
  onToggleCheck,
}: Props) {
  const title = assetDisplayTitle(asset);
  const hasContent = Boolean(asset.content || asset.content_preview);
  const { owner, name: repoName } = formatSourceRepo(asset.source_repo);
  const selectable = Boolean(onToggleCheck);

  return (
    <article
      className={[
        "harbor-card harbor-card--clickable harbor-card--default",
        selected ? "selected" : "",
        selectable ? "harbor-card--selectable" : "",
        checked ? "harbor-card--checked" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      role="button"
      tabIndex={0}
    >
      {selectable ? (
        <CardSelectToggle checked={checked} label={title} onToggle={() => onToggleCheck?.()} />
      ) : null}
      {rank != null ? <span className="asset-card-rank">{rank}</span> : null}
      <p className="asset-card-title">{title}</p>
      <div className="asset-card-meta">
        <span className={assetTypeBadgeClass(asset.asset_type)}>{asset.asset_type_label}</span>
        <span className="dash-rank dash-rank--stars">★ {formatStars(asset.stars)}</span>
        {(asset.vote_score ?? 0) > 0 ? (
          <span className="asset-card-votes">▲ {asset.vote_score}</span>
        ) : null}
      </div>
      <p className="asset-card-source" title={asset.source_repo}>
        <span className="asset-card-source__label">Source</span>
        <span className="asset-card-source__repo">
          <span className="asset-card-source__owner">{owner}</span>
          <span className="asset-card-source__sep">/</span>
          <span>{repoName}</span>
        </span>
      </p>
      {!hasContent ? <span className="asset-card-warn">Sync for content</span> : null}
    </article>
  );
}
