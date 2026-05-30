import type { KeyboardEvent } from "react";
import { formatSourceRepo } from "../../lib/assetType";
import type { DiscoveryPulseStats } from "../../lib/discoveryPulse";
import { formatStars } from "../../lib/format";

type Props = {
  stats: DiscoveryPulseStats;
  onOpenLeader?: () => void;
};

function assetTypeHint(types: DiscoveryPulseStats["assetTypes"]): string {
  const parts: string[] = [];
  if (types.skill > 0) parts.push(`${types.skill.toLocaleString()} skills`);
  if (types.rule > 0) parts.push(`${types.rule.toLocaleString()} rules`);
  if (types.command > 0) parts.push(`${types.command.toLocaleString()} commands`);
  if (types.agent > 0) parts.push(`${types.agent.toLocaleString()} agents`);
  return parts.length > 0 ? parts.join(" · ") : "Skills, rules & commands";
}

export function DiscoveryPulse({ stats, onOpenLeader }: Props) {
  const { repoCount, assetCount, domainCount, assetTypes, monthLeader } = stats;
  const leaderParts = monthLeader ? formatSourceRepo(monthLeader.source_repo) : null;

  return (
    <section className="discovery-pulse" aria-label="Registry highlights">
      <article className="discovery-pulse__card">
        <strong className="discovery-pulse__value">{repoCount.toLocaleString()}</strong>
        <span className="discovery-pulse__label">GitHub repos indexed</span>
        <p className="discovery-pulse__hint">
          {domainCount > 0
            ? `Spanning ${domainCount.toLocaleString()} domains · synced locally`
            : "Synced from GitHub to your local registry"}
        </p>
      </article>

      <article className="discovery-pulse__card">
        <strong className="discovery-pulse__value">{assetCount.toLocaleString()}</strong>
        <span className="discovery-pulse__label">Assets available</span>
        <p className="discovery-pulse__hint">{assetTypeHint(assetTypes)}</p>
      </article>

      {monthLeader && leaderParts ? (
        <article
          className="discovery-pulse__card discovery-pulse__card--leader"
          {...(onOpenLeader
            ? {
                role: "button" as const,
                tabIndex: 0,
                onClick: onOpenLeader,
                onKeyDown: (e: KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenLeader();
                  }
                },
              }
            : {})}
        >
          <span className="discovery-pulse__eyebrow">Leader of the month</span>
          <strong className="discovery-pulse__leader-repo">
            <span className="discovery-pulse__owner">{leaderParts.owner}</span>
            <span className="discovery-pulse__repo-name">/{leaderParts.name}</span>
          </strong>
          <p className="discovery-pulse__hint">
            ★ {formatStars(monthLeader.stars)} · {monthLeader.assetCount.toLocaleString()} skills &
            rules
          </p>
        </article>
      ) : (
        <article className="discovery-pulse__card">
          <strong className="discovery-pulse__value">—</strong>
          <span className="discovery-pulse__label">Leader of the month</span>
          <p className="discovery-pulse__hint">Sync registry to populate rankings</p>
        </article>
      )}
    </section>
  );
}
