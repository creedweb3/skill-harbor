import type { DashboardItem } from "../../lib/dashboard";
import { formatStars } from "../../lib/format";

type Props = {
  item: DashboardItem;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
  rankMode?: "rank" | "stars";
};

export function DashboardListRow({
  item,
  selected,
  onToggle,
  disabled,
  rankMode = "rank",
}: Props) {
  const st = item.asset?.install_status;
  const installed = st?.status && st.status !== "none";
  const type = item.asset?.asset_type ?? "skill";
  const typeLabel = item.asset?.asset_type_label ?? "Skill";
  const stars = item.asset?.stars ?? item.stars;

  return (
    <li
      className={`dash-row ${selected ? "selected" : ""} ${installed ? "installed" : ""} ${disabled ? "disabled" : ""}`}
    >
      <label className="dash-row-inner">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          disabled={disabled}
          aria-label={`Select ${item.title}`}
        />
        {rankMode === "stars" && stars != null ? (
          <span className="dash-rank dash-rank--stars">★ {formatStars(stars)}</span>
        ) : (
          <span className="dash-rank">#{item.rank}</span>
        )}
        <span className="dash-title">{item.title}</span>
        <span className={`type type-${type}`}>{typeLabel}</span>
        {item.curated ? <span className="pill curated">Curated</span> : null}
        {installed ? (
          <span className="pill installed-pill">
            {st!.status === "both" ? "Both" : st!.status}
          </span>
        ) : null}
        {rankMode !== "stars" && item.asset ? (
          <span className="dash-stars">★ {formatStars(item.asset.stars)}</span>
        ) : rankMode !== "stars" && !item.asset ? (
          <span className="dash-stars muted">Fetch catalog</span>
        ) : null}
      </label>
      <code className="mono dash-source">{item.source_repo}</code>
    </li>
  );
}
