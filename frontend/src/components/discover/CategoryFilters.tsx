import type { CategoryGroup } from "../../api";
import { formatLabel } from "../../lib/format";
import { Button } from "../ui/Button";

type Props = {
  groups: CategoryGroup[];
  selectedCats: Set<string>;
  onToggle: (cat: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
};

export function CategoryFilters({
  groups,
  selectedCats,
  onToggle,
  onSelectAll,
  onClear,
}: Props) {
  return (
    <details className="filter-drawer" open>
      <summary className="filter-drawer-summary">
        <span>
          Categories
          <span className="filter-count">{selectedCats.size} active</span>
        </span>
        <span className="filter-actions" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={onSelectAll}>
            All
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        </span>
      </summary>
      <div className="filter-drawer-body">
        {groups.map((g) => (
          <fieldset key={g.id} className="filter-group">
            <legend>{g.label}</legend>
            <div className="chips">
              {g.categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`chip ${selectedCats.has(cat) ? "on" : ""}`}
                  onClick={() => onToggle(cat)}
                  aria-pressed={selectedCats.has(cat)}
                >
                  {formatLabel(cat)}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </details>
  );
}
