import type { Asset } from "../../api";
import { formatLabel, formatStars } from "../../lib/format";

type Props = {
  asset: Asset;
  selected: boolean;
  onToggle: () => void;
};

export function AssetCard({ asset: a, selected, onToggle }: Props) {
  const st = a.install_status;
  const installed = st?.status && st.status !== "none";

  return (
    <article
      className={`asset-card ${selected ? "selected" : ""} ${installed ? "installed" : ""}`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${selected ? "Deselect" : "Select"} ${a.curated_title || a.install_name}`}
    >
      <header className="asset-card-head">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          aria-hidden
          tabIndex={-1}
        />
        <span className={`type type-${a.asset_type}`}>{a.asset_type_label}</span>
        {a.curated ? <span className="pill curated">Curated</span> : null}
        {installed ? (
          <span className="pill installed-pill">
            {st.status === "both" ? "Both scopes" : `Installed ${st.status}`}
          </span>
        ) : null}
        {st?.name_collision ? (
          <span className="pill warn" title="Folder name exists with different content">
            Name clash
          </span>
        ) : null}
        {st?.overlap_warning && !installed ? (
          <span className="pill warn" title={st.overlap_names?.join(", ")}>
            Similar installed
          </span>
        ) : null}
        <span className="stars" title="Repo stars (needs token for live count)">
          ★ {formatStars(a.stars)}
        </span>
      </header>
      <h3>{a.curated_title || a.install_name}</h3>
      <p className="mono slug">{a.install_name}</p>
      <p className="preview">{a.content_preview.slice(0, 160)}…</p>
      <ul className="tag-list" aria-label="Categories">
        {(a.domains ?? a.categories).slice(0, 4).map((c) => (
          <li key={c}>{formatLabel(c)}</li>
        ))}
      </ul>
      <footer className="asset-card-foot">
        <code className="mono source">
          {a.source_repo}
          <br />
          {a.source_path}
        </code>
        {st?.installed?.length > 0 ? (
          <p className="overlap mono">
            Same content as: {st.installed.map((i) => i.name).join(", ")}
          </p>
        ) : null}
      </footer>
    </article>
  );
}
