import type { DiscoverMode } from "../../hooks/useStudio";

type Props = {
  mode: DiscoverMode;
  onChange: (mode: DiscoverMode) => void;
};

export function DiscoverModeSwitch({ mode, onChange }: Props) {
  return (
    <nav className="mode-switch" aria-label="Browse mode">
      <button
        type="button"
        className={`mode-tab ${mode === "discovery" ? "active" : ""}`}
        onClick={() => onChange("discovery")}
        aria-current={mode === "discovery" ? "page" : undefined}
      >
        Discovery
        <span className="mode-tab-desc">Rankings by profession</span>
      </button>
      <button
        type="button"
        className={`mode-tab ${mode === "search" ? "active" : ""}`}
        onClick={() => onChange("search")}
        aria-current={mode === "search" ? "page" : undefined}
      >
        Custom search
        <span className="mode-tab-desc">Filters & grid</span>
      </button>
    </nav>
  );
}
