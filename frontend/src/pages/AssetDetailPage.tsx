import { useEffect, useState } from "react";
import { getAssetDetail, type Asset } from "../api";
import type { Studio } from "../hooks/useStudio";
import { formatStars } from "../lib/format";

type Props = { studio: Studio };

export function AssetDetailPage({ studio }: Props) {
  const {
    selectedAssetId,
    setSelectedAssetId,
    selectedIds,
    toggleRow,
    runInstall,
    busy,
    assets,
  } = studio;
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedAssetId) return;
    const cached = assets.find((a) => a.id === selectedAssetId);
    if (cached?.content) {
      setAsset(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    getAssetDetail(selectedAssetId)
      .then(setAsset)
      .catch(() => setAsset(cached ?? null))
      .finally(() => setLoading(false));
  }, [selectedAssetId, assets]);

  if (!selectedAssetId) return null;

  const title = asset?.curated_title || asset?.install_name || "Asset";
  const content = asset?.content || asset?.content_preview || "";
  const selected = asset ? selectedIds.has(asset.id) : false;
  const typeLabel = asset?.asset_type_label ?? "Skill";

  return (
    <div className="asset-detail-page">
      <header className="asset-detail-header">
        <button
          type="button"
          className="harbor-btn harbor-btn--ghost asset-detail-back"
          onClick={() => setSelectedAssetId(null)}
        >
          ← Back
        </button>
        <div className="asset-detail-title-block">
          <span className="harbor-badge">{typeLabel}</span>
          <h1>{title}</h1>
          <p className="asset-detail-meta">
            <code className="mono">{asset?.source_repo}</code>
            {asset ? (
              <>
                <span className="meta-sep">·</span>
                <span>★ {formatStars(asset.stars)}</span>
              </>
            ) : null}
            {asset?.install_status?.status && asset.install_status.status !== "none" ? (
              <>
                <span className="meta-sep">·</span>
                <span className="installed-tag">Installed ({asset.install_status.status})</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="asset-detail-actions">
          <button
            type="button"
            className="harbor-btn"
            disabled={!asset}
            onClick={() => asset && toggleRow(asset.id)}
          >
            {selected ? "Selected" : "Select"}
          </button>
          <button
            type="button"
            className="harbor-btn harbor-btn--primary"
            disabled={busy || !selected}
            onClick={runInstall}
          >
            Install
          </button>
          {asset?.raw_url ? (
            <a
              href={asset.raw_url}
              target="_blank"
              rel="noreferrer"
              className="harbor-btn harbor-btn--ghost"
            >
              Open on GitHub
            </a>
          ) : null}
        </div>
      </header>

      <div className="asset-detail-body card-surface">
        {loading ? (
          <p className="harbor-empty">Loading file content…</p>
        ) : content ? (
          <pre className="asset-detail-content">{content}</pre>
        ) : (
          <p className="harbor-empty">
            No content in registry yet. Use <strong>Sync registry</strong> to pull this file from GitHub.
          </p>
        )}
      </div>
    </div>
  );
}
