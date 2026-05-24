type BarItem = { label: string; value: number };

export function MiniBarChart({
  items,
  emptyLabel = "No data yet.",
}: {
  items: BarItem[];
  emptyLabel?: string;
}) {
  if (!items.length) {
    return <p className="harbor-chart-empty">{emptyLabel}</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="harbor-bars" role="img" aria-label="Bar chart">
      {items.map((item) => (
        <div key={item.label} className="harbor-bar-row">
          <span className="harbor-bar-label" title={item.label}>
            {item.label}
          </span>
          <div className="harbor-bar-track">
            <div className="harbor-bar-fill" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
          <span className="harbor-bar-val">{item.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export function MiniGrowthChart({
  items,
  emptyLabel = "No data yet.",
  labelSlice = 5,
}: {
  items: BarItem[];
  emptyLabel?: string;
  labelSlice?: number;
}) {
  if (!items.length) {
    return <p className="harbor-chart-empty">{emptyLabel}</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="harbor-growth" role="img" aria-label="Growth chart">
      {items.map((item) => (
        <div key={item.label} className="harbor-growth-col" title={`${item.label}: ${item.value}`}>
          <div
            className="harbor-growth-bar"
            style={{ height: `${Math.max(8, (item.value / max) * 100)}%` }}
          />
          <span className="harbor-growth-label">{item.label.slice(labelSlice)}</span>
        </div>
      ))}
    </div>
  );
}
