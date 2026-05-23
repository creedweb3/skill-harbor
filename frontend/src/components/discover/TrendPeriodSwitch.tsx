import type { TrendPeriod } from "../../hooks/useStudio";

const PERIODS: { id: TrendPeriod; label: string; hint: string }[] = [
  { id: "day", label: "24h", hint: "Recently updated repos" },
  { id: "week", label: "7d", hint: "Past week" },
  { id: "month", label: "30d", hint: "Past month" },
  { id: "year", label: "1y", hint: "Past year" },
  { id: "all", label: "All time", hint: "Top by GitHub stars" },
];

type Props = {
  period: TrendPeriod;
  onChange: (p: TrendPeriod) => void;
  hasLiveData: boolean;
};

export function TrendPeriodSwitch({ period, onChange, hasLiveData }: Props) {
  return (
    <div className="trend-periods" role="tablist" aria-label="Trending period">
      {PERIODS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          className={`period-pill ${period === p.id ? "active" : ""}`}
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
