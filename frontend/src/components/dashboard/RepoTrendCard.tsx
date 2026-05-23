import type { Asset } from "../../api";
import { formatStars } from "../../lib/format";
import { assetDisplayTitle } from "../../lib/ranking";

type Props = {
  sourceRepo: string;
  stars: number;
  assetCount: number;
  representative: Asset;
  rank: number;
  selected: boolean;
  onSelect: () => void;
};

export function RepoTrendCard({
  sourceRepo,
  stars,
  assetCount,
  representative,
  rank,
  selected,
  onSelect,
}: Props) {
  const topSkill = assetDisplayTitle(representative);

  return (
    <article
      className={`harbor-card harbor-card--clickable harbor-card--repo ${selected ? "selected" : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      role="button"
      tabIndex={0}
    >
      <span className="asset-card-rank">{rank}</span>
      <p className="asset-card-title asset-card-title--repo">{sourceRepo}</p>
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
}
