import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Asset } from "../../api";
import { AssetRankCard } from "../dashboard/AssetRankCard";

const CARD_MIN_WIDTH = 240;
const CARD_HEIGHT = 152;
const GRID_GAP = 12;
const VIRTUALIZE_THRESHOLD = 80;

type Props = {
  items: Asset[];
  scrollRef: RefObject<HTMLElement | null>;
  selectedAssetId: string | null;
  selectedIds: Set<string>;
  onToggleCheck: (id: string) => void;
  onSelect: (id: string) => void;
};

function useColumnCount(containerRef: RefObject<HTMLElement | null>) {
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let frame = 0;
    const update = () => {
      const width = el.clientWidth;
      setColumns(Math.max(1, Math.floor((width + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP))));
    };

    update();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [containerRef]);

  return columns;
}

export function VirtualBrowseGrid({
  items,
  scrollRef,
  selectedAssetId,
  selectedIds,
  onToggleCheck,
  onSelect,
}: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = useColumnCount(gridRef);
  const rowCount = Math.ceil(items.length / columns);
  const rowHeight = CARD_HEIGHT + GRID_GAP;
  const useVirtual = items.length >= VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: useVirtual ? rowCount : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 2,
  });

  if (!useVirtual) {
    return (
      <div
        ref={gridRef}
        className="harbor-card-grid harbor-card-grid--scroll harbor-card-grid--virtual"
      >
        {items.map((asset) => (
          <AssetRankCard
            key={asset.id}
            asset={asset}
            selected={selectedAssetId === asset.id}
            checked={selectedIds.has(asset.id)}
            onToggleCheck={() => onToggleCheck(asset.id)}
            onSelect={() => onSelect(asset.id)}
          />
        ))}
      </div>
    );
  }

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div
      ref={gridRef}
      className="harbor-card-grid harbor-card-grid--scroll harbor-card-grid--virtual"
      style={{ height: virtualizer.getTotalSize(), position: "relative" }}
    >
      {virtualRows.map((virtualRow) => {
        const startIdx = virtualRow.index * columns;
        const row = items.slice(startIdx, startIdx + columns);
        return (
          <div
            key={virtualRow.key}
            className="harbor-card-grid__virtual-row"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: rowHeight,
              transform: `translateY(${virtualRow.start}px)`,
              display: "grid",
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap: "0.75rem",
            }}
          >
            {row.map((asset) => (
              <AssetRankCard
                key={asset.id}
                asset={asset}
                selected={selectedAssetId === asset.id}
                checked={selectedIds.has(asset.id)}
                onToggleCheck={() => onToggleCheck(asset.id)}
                onSelect={() => onSelect(asset.id)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
