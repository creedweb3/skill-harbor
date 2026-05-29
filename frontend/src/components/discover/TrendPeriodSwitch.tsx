import type { TrendPeriod } from "../../hooks/useStudio";

const PERIODS: { id: TrendPeriod; label: string; hint: string }[] = [
  { id: "day", label: "24h", hint: "Recent pushes · activity-weighted" },
  { id: "week", label: "7d", hint: "Past week · activity + votes + stars" },
  { id: "month", label: "30d", hint: "Past month · balanced trend score" },
  { id: "year", label: "1y", hint: "Past year · activity + popularity" },
  { id: "all", label: "All time", hint: "Full registry · popularity + recency" },
];

type Props = {
  period: TrendPeriod;
  onChange: (p: TrendPeriod) => void;
  hasLiveData: boolean;
};

export function TrendPeriodSwitch({ period, onChange, hasLiveData }: Props) {
  return (
    <div className="harbor-periods" role="tablist" aria-label="Trending period">
      {PERIODS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          className={`harbor-periods__pill ${period === p.id ? "is-active" : ""}`}
          aria-selected={period === p.id}
          title={p.hint}
          onClick={() => onChange(p.id)}
        >
          {p.label}
        </button>
      ))}
      {!hasLiveData ? (
        <span className="period-note muted">Fetch catalog for live dates & stars</span>
      ) : null}
    </div>
  );
}
