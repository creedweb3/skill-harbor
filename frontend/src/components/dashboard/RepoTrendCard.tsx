import { memo } from "react";
import type { Asset } from "../../api";
import { formatStars } from "../../lib/format";
import { formatSourceRepo } from "../../lib/assetType";
import { assetDisplayTitle } from "../../lib/ranking";
import { CardSelectToggle } from "../ui/CardSelectToggle";

type Props = {
  sourceRepo: string;
  stars: number;
  assetCount: number;
  representative: Asset;
  rank: number;
  selected: boolean;
  onSelect: () => void;
  checked?: boolean;
  onToggleCheck?: () => void;
};

export const RepoTrendCard = memo(function RepoTrendCard({
  sourceRepo,
  stars,
  assetCount,
  representative,
  rank,
  selected,
  onSelect,
  checked = false,
  onToggleCheck,
}: Props) {
  const topSkill = assetDisplayTitle(representative);
  const selectable = Boolean(onToggleCheck);
  const { owner, name: repoName } = formatSourceRepo(sourceRepo);

  return (
    <article
      className={[
        "harbor-card harbor-card--clickable harbor-card--repo",
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
        <CardSelectToggle checked={checked} label={sourceRepo} onToggle={() => onToggleCheck?.()} />
      ) : null}
      <span className="asset-card-rank">{rank}</span>
      <p className="asset-card-title asset-card-title--qualified" title={sourceRepo}>
        <span className="asset-card-qualified__owner">{owner}</span>
        <span className="asset-card-qualified__sep">/</span>
        <span className="asset-card-qualified__name">{repoName}</span>
      </p>
      <div className="asset-card-meta">
        <span className="harbor-badge harbor-badge--type harbor-badge--repo">Repository</span>
        <span className="dash-rank dash-rank--stars">★ {formatStars(stars)}</span>
      </div>
      <p className="asset-card-foot">
        {assetCount} skills & rules · featured:{" "}
        {topSkill.length > 28 ? `${topSkill.slice(0, 26)}…` : topSkill}
      </p>
    </article>
  );
});
