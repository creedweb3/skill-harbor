import type { Asset, PlatformInfo } from "../../api";
import { formatLabel, formatStars } from "../../lib/format";

type Props = {
  asset: Asset;
  selected: boolean;
  onToggle: () => void;
  platforms?: PlatformInfo[];
  activePlatform?: string;
};

export function AssetCard({
  asset: a,
  selected,
  onToggle,
  platforms = [],
  activePlatform,
}: Props) {
  const st = a.install_status;
  const installed = st?.status && st.status !== "none";
  const labelFor = (id: string) => platforms.find((p) => p.id === id)?.label ?? id;

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
        {a.safety?.verdict === "block" ? (
          <span className="pill warn" title={a.safety.reason}>
            Blocked
          </span>
        ) : a.safety?.warnings?.length ? (
          <span className="pill" title={a.safety.warnings.join(", ")}>
            Review
          </span>
        ) : a.safety?.safe ? (
          <span className="pill safe" title="Passed Harbor safety scan">
            Verified
          </span>
        ) : null}
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
      {(a.platforms?.length ?? 0) > 0 ? (
        <ul className="tag-list platform-tags" aria-label="Compatible platforms">
          {a.platforms!.slice(0, 5).map((pid) => (
            <li
              key={pid}
              className={pid === activePlatform ? "platform-tag platform-tag--active" : "platform-tag"}
            >
              {labelFor(pid)}
            </li>
          ))}
          {a.platforms!.length > 5 ? <li>+{a.platforms!.length - 5}</li> : null}
        </ul>
      ) : null}
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
