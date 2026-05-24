import type { Studio } from "../hooks/useStudio";
import type { DiscoverySectionView } from "../lib/categoryDetail";
import { clearDomainHash } from "../lib/domainHash";
import { DiscoverySectionPage } from "./DiscoverySectionPage";
import { DomainsPage } from "./DomainsPage";

type Props = {
  studio: Studio;
  domainView: DiscoverySectionView | null;
  setDomainView: (view: DiscoverySectionView | null) => void;
  onOpenDomain: (view: DiscoverySectionView) => void;
};

export function DomainsRouterPage({
  studio,
  domainView,
  setDomainView,
  onOpenDomain,
}: Props) {
  if (domainView?.kind === "profession") {
    return (
      <DiscoverySectionPage
        studio={studio}
        view={domainView}
        backLabel="Domains"
        onBack={() => {
          setDomainView(null);
          clearDomainHash();
        }}
      />
    );
  }

  return <DomainsPage studio={studio} onOpenDomain={onOpenDomain} />;
}
