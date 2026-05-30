import { memo, type ReactNode } from "react";
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
  clickable?: boolean;
  footer?: ReactNode;
};

export const AssetRankCard = memo(function AssetRankCard({
  asset,
  selected,
  onSelect,
  rank,
  checked = false,
  onToggleCheck,
  clickable = true,
  footer,
}: Props) {
  const title = assetDisplayTitle(asset);
  const hasContent = Boolean(asset.content || asset.content_preview);
  const { owner, name: repoName } = formatSourceRepo(asset.source_repo);
  const selectable = Boolean(onToggleCheck);

  return (
    <article
      className={[
        "harbor-card harbor-card--default",
        clickable ? "harbor-card--clickable" : "",
        selected ? "selected" : "",
        selectable ? "harbor-card--selectable" : "",
        checked ? "harbor-card--checked" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={clickable ? onSelect : undefined}
      onKeyDown={clickable ? (e) => e.key === "Enter" && onSelect() : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
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
      {asset.source_repo ? (
        <p className="asset-card-source" title={asset.source_repo}>
          <span className="asset-card-source__label">Source</span>
          <span className="asset-card-source__repo">
            <span className="asset-card-source__owner">{owner}</span>
            <span className="asset-card-source__sep">/</span>
            <span>{repoName}</span>
          </span>
        </p>
      ) : null}
      {!hasContent ? <span className="asset-card-warn">Sync for content</span> : null}
      {footer}
    </article>
  );
});
