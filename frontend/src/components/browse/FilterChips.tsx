type Chip = { key: string; label: string; onRemove: () => void };

type Props = {
  chips: Chip[];
  onClearAll?: () => void;
};

export function FilterChips({ chips, onClearAll }: Props) {
  if (chips.length === 0) return null;

  return (
    <div className="filter-chips" role="group" aria-label="Active filters">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="filter-chip"
          onClick={chip.onRemove}
          aria-label={`Remove filter: ${chip.label}`}
        >
          <span>{chip.label}</span>
          <span className="filter-chip__x" aria-hidden>
            ×
          </span>
        </button>
      ))}
      {onClearAll && chips.length > 1 ? (
        <button type="button" className="filter-chips__clear" onClick={onClearAll}>
          Clear all
        </button>
      ) : null}
    </div>
  );
}
