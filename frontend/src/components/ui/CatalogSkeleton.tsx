type Props = { count?: number };

export function CatalogSkeleton({ count = 12 }: Props) {
  return (
    <div className="catalog-skeleton" aria-busy="true" aria-label="Loading catalog">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="catalog-skeleton__card" />
      ))}
    </div>
  );
}
