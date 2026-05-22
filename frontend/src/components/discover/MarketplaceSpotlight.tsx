import type { LeaderboardEntry } from "../../api";
import type { LeaderboardTab, Studio } from "../../hooks/useStudio";
import { formatLabel } from "../../lib/format";

type Props = Pick<
  Studio,
  "leaderboards" | "leaderboardTab" | "setLeaderboardTab" | "focusLeaderboardEntry"
>;

const TABS: { id: LeaderboardTab; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "top_picks", label: "Top picks" },
  { id: "profession", label: "By profession" },
  { id: "domain", label: "Rankings" },
];

function EntryChip({
  entry,
  onSelect,
}: {
  entry: LeaderboardEntry;
  onSelect: (e: LeaderboardEntry) => void;
}) {
  return (
    <button
      type="button"
      className="spotlight-chip"
      onClick={() => onSelect(entry)}
      title={`${entry.source_repo} — rank #${entry.rank}`}
    >
      <span className="spotlight-rank">#{entry.rank}</span>
      <span className="spotlight-title">{entry.title}</span>
      {entry.domain ? (
        <span className="spotlight-domain">{formatLabel(entry.domain)}</span>
      ) : null}
    </button>
  );
}

export function MarketplaceSpotlight({
  leaderboards,
  leaderboardTab,
  setLeaderboardTab,
  focusLeaderboardEntry,
}: Props) {
  if (!leaderboards) return null;

  return (
    <section className="spotlight" aria-label="Marketplace highlights">
      <nav className="spotlight-tabs" aria-label="Leaderboard views">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`spotlight-tab ${leaderboardTab === tab.id ? "active" : ""}`}
            onClick={() => setLeaderboardTab(tab.id)}
            aria-current={leaderboardTab === tab.id ? "true" : undefined}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="spotlight-body">
        {leaderboardTab === "trending" && (
          <div className="spotlight-row">
            {leaderboards.trending.map((entry) => (
              <EntryChip key={entry.id} entry={entry} onSelect={focusLeaderboardEntry} />
            ))}
          </div>
        )}

        {leaderboardTab === "top_picks" && (
          <div className="spotlight-row">
            {leaderboards.top_picks.map((entry) => (
              <EntryChip key={entry.id} entry={entry} onSelect={focusLeaderboardEntry} />
            ))}
          </div>
        )}

        {leaderboardTab === "profession" &&
          leaderboards.by_profession.map((group) => (
            <div key={group.id} className="spotlight-group">
              <h3>{group.label}</h3>
              <div className="spotlight-row">
                {group.items.map((entry) => (
                  <EntryChip key={entry.id} entry={entry} onSelect={focusLeaderboardEntry} />
                ))}
              </div>
            </div>
          ))}

        {leaderboardTab === "domain" &&
          leaderboards.by_domain.map((group) => (
            <div key={group.domain} className="spotlight-group">
              <h3>{group.label}</h3>
              <div className="spotlight-row">
                {group.items.map((entry) => (
                  <EntryChip key={entry.id} entry={entry} onSelect={focusLeaderboardEntry} />
                ))}
              </div>
            </div>
          ))}
      </div>

      <p className="spotlight-foot muted">
        {leaderboards.total_curated} curated entries · click to filter catalog
      </p>
    </section>
  );
}
