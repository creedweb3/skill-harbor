import type { Studio } from "../../hooks/useStudio";
import { Button } from "../ui/Button";

const TYPE_OPTIONS = ["all", "skill", "rule", "command", "agent"] as const;

type Props = Pick<
  Studio,
  | "search"
  | "setSearch"
  | "typeFilter"
  | "setTypeFilter"
  | "hideInstalled"
  | "setHideInstalled"
  | "installUser"
  | "setInstallUser"
  | "installProject"
  | "setInstallProject"
  | "force"
  | "setForce"
  | "topPerCategory"
  | "setTopPerCategory"
  | "includeDiscovery"
  | "setIncludeDiscovery"
  | "allVisibleSelected"
  | "toggleSelectAllVisible"
  | "deselectAll"
  | "activeFilterCount"
>;

export function DiscoverToolbar(props: Props) {
  const {
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    hideInstalled,
    setHideInstalled,
    installUser,
    setInstallUser,
    installProject,
    setInstallProject,
    force,
    setForce,
    topPerCategory,
    setTopPerCategory,
    includeDiscovery,
    setIncludeDiscovery,
    allVisibleSelected,
    toggleSelectAllVisible,
    deselectAll,
    activeFilterCount,
  } = props;

  return (
    <div className="discover-toolbar">
      <section className="toolbar-block" aria-label="Search and view">
        <div className="toolbar-block-head">
          <span className="toolbar-label">Browse</span>
          {activeFilterCount > 0 ? (
            <span className="toolbar-meta">{activeFilterCount} filter(s)</span>
          ) : null}
        </div>
        <div className="toolbar-row">
          <input
            className="search"
            type="search"
            placeholder="Search name, repo, description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search catalog"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Asset type"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t === "all" ? "All types" : t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
          <label className="toggle">
            <input
              type="checkbox"
              checked={hideInstalled}
              onChange={(e) => setHideInstalled(e.target.checked)}
            />
            Hide installed
          </label>
        </div>
        <div className="toolbar-row toolbar-row--end">
          <Button variant="ghost" size="sm" onClick={toggleSelectAllVisible}>
            {allVisibleSelected ? "Deselect visible" : "Select all visible"}
          </Button>
          <Button variant="ghost" size="sm" onClick={deselectAll}>
            Deselect all
          </Button>
        </div>
      </section>

      <section className="toolbar-block" aria-label="Fetch options">
        <span className="toolbar-label">Fetch</span>
        <div className="toolbar-row">
          <label className="toggle">
            Per category
            <input
              type="number"
              min={1}
              max={10}
              value={topPerCategory}
              onChange={(e) => setTopPerCategory(Number(e.target.value))}
              aria-label="Items per category"
            />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={includeDiscovery}
              onChange={(e) => setIncludeDiscovery(e.target.checked)}
            />
            GitHub search
          </label>
        </div>
      </section>

      <section className="toolbar-block" aria-label="Install targets">
        <span className="toolbar-label">Install to</span>
        <div className="toolbar-row">
          <label className="toggle">
            <input
              type="checkbox"
              checked={installUser}
              onChange={(e) => setInstallUser(e.target.checked)}
            />
            Global
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={installProject}
              onChange={(e) => setInstallProject(e.target.checked)}
            />
            Project
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
            />
            Overwrite existing
          </label>
        </div>
      </section>
    </div>
  );
}
