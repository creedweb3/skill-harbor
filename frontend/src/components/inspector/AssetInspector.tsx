import { useEffect, useState } from "react";
import { getAssetDetail, type Asset } from "../../api";
import type { Studio } from "../../hooks/useStudio";
import { formatStars } from "../../lib/format";

type Props = { studio: Studio };

export function AssetInspector({ studio }: Props) {
  const {
    selectedAssetId,
    setSelectedAssetId,
    selectedIds,
    toggleRow,
    runInstall,
    busy,
    assets,
  } = studio;
  const [detail, setDetail] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"preview" | "meta">("preview");

  useEffect(() => {
    if (!selectedAssetId) {
      setDetail(null);
      return;
    }
    const cached = assets.find((a) => a.id === selectedAssetId);
    if (cached?.content) {
      setDetail(cached);
      return;
    }
    setLoading(true);
    getAssetDetail(selectedAssetId)
      .then(setDetail)
      .catch(() => setDetail(cached ?? null))
      .finally(() => setLoading(false));
  }, [selectedAssetId, assets]);

  if (!selectedAssetId) {
    return (
      <div className="harbor-empty">
        <p>Select an asset to preview its SKILL.md, rule, or command content.</p>
      </div>
    );
  }

  const asset = detail;
  const title = asset?.curated_title || asset?.install_name || selectedAssetId;
  const content = asset?.content || asset?.content_preview || "";
  const selected = asset ? selectedIds.has(asset.id) : false;

  return (
    <>
      <header className="harbor-inspector-head">
        <button
          type="button"
          className="harbor-btn harbor-btn--ghost"
          style={{ marginBottom: 8 }}
          onClick={() => setSelectedAssetId(null)}
        >
          Close
        </button>
        <h2 style={{ margin: "0 0 0.35rem", fontSize: "1rem" }}>{title}</h2>
        <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--harbor-muted)" }}>
          {asset?.source_repo}
          {asset ? ` · ★ ${formatStars(asset.stars)}` : null}
        </p>
      </header>
      <div className="harbor-inspector-actions">
        <button
          type="button"
          className="harbor-btn"
          onClick={() => asset && toggleRow(asset.id)}
          disabled={!asset}
        >
          {selected ? "Deselect" : "Select"}
        </button>
        <button
          type="button"
          className="harbor-btn harbor-btn--primary"
          onClick={runInstall}
          disabled={busy || !selected}
        >
          Install
        </button>
        {asset?.raw_url ? (
          <a
            href={asset.raw_url}
            target="_blank"
            rel="noreferrer"
            className="harbor-btn harbor-btn--ghost"
            style={{ textDecoration: "none" }}
          >
            GitHub
          </a>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 4, padding: "0 1.25rem" }}>
        <button
          type="button"
          className={`period-pill ${tab === "preview" ? "active" : ""}`}
          onClick={() => setTab("preview")}
        >
          Preview
        </button>
        <button
          type="button"
          className={`period-pill ${tab === "meta" ? "active" : ""}`}
          onClick={() => setTab("meta")}
        >
          Metadata
        </button>
      </div>
      {loading ? (
        <p className="harbor-empty">Loading content…</p>
      ) : tab === "preview" ? (
        <pre className="harbor-content-preview">{content || "No content yet — run Sync registry."}</pre>
      ) : (
        <pre className="harbor-content-preview">
          {JSON.stringify(
            {
              id: asset?.id,
              type: asset?.asset_type,
              domains: asset?.domains,
              install: asset?.install_name,
              status: asset?.install_status?.status,
            },
            null,
            2
          )}
        </pre>
      )}
    </>
  );
}
