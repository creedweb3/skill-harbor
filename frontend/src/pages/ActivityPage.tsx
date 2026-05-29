import { useMemo, useState } from "react";
import { ActivityDetailView } from "../components/activity/ActivityDetailView";
import type { Studio } from "../hooks/useStudio";
import {
  canArchiveActivity,
  formatActivityTime,
  isActiveInbox,
  isUnreadActivity,
  latestLogLine,
  type ActivityStatus,
  type UserActivity,
} from "../lib/activityLog";

type Props = { studio: Studio };

type InboxView = "inbox" | "archived";
type FilterStatus = "all" | ActivityStatus;

function filterByStatus(items: UserActivity[], filter: FilterStatus): UserActivity[] {
  if (filter === "all") return items;
  return items.filter((a) => a.status === filter);
}

export function ActivityPage({ studio }: Props) {
  const {
    userActivities,
    markActivitiesRead,
    archiveReadActivities,
    deleteArchivedActivities,
    busy,
  } = studio;
  const [inboxView, setInboxView] = useState<InboxView>("inbox");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const inboxItems = useMemo(
    () => userActivities.filter((a) => (inboxView === "inbox" ? isActiveInbox(a) : a.archived)),
    [userActivities, inboxView]
  );

  const selected = useMemo(
    () => userActivities.find((a) => a.id === selectedId) ?? null,
    [userActivities, selectedId]
  );

  const visible = useMemo(
    () => filterByStatus(inboxItems, filter).slice().reverse(),
    [inboxItems, filter]
  );

  const counts = useMemo(() => {
    const c = { all: inboxItems.length, running: 0, ok: 0, err: 0 };
    for (const a of inboxItems) c[a.status] += 1;
    return c;
  }, [inboxItems]);

  const unreadCount = useMemo(
    () => userActivities.filter(isUnreadActivity).length,
    [userActivities]
  );

  const archivableCount = useMemo(
    () => userActivities.filter(canArchiveActivity).length,
    [userActivities]
  );

  const archivedCount = useMemo(
    () => userActivities.filter((a) => a.archived).length,
    [userActivities]
  );

  const openActivity = (id: string) => {
    markActivitiesRead([id]);
    setSelectedId(id);
  };

  const handleDeleteArchived = () => {
    if (archivedCount === 0) return;
    const noun = archivedCount === 1 ? "1 archived activity" : `${archivedCount} archived activities`;
    if (!confirm(`Permanently delete ${noun}? This cannot be undone.`)) return;
    deleteArchivedActivities();
    if (inboxView === "archived") setFilter("all");
  };

  if (selected) {
    return (
      <div className="harbor-page harbor-page--activity">
        <ActivityDetailView
          activity={selected}
          onBack={() => setSelectedId(null)}
        />
      </div>
    );
  }

  return (
    <div className="harbor-page harbor-page--activity">
      <header className="harbor-activity-head">
        <div>
          <h2>Activity</h2>
          <p className="harbor-activity-desc">
            Actions you take in Skill Harbor. Mark as read to acknowledge, archive to move
            off your inbox, or delete archived items permanently.
          </p>
        </div>
        <div className="harbor-activity-actions">
          <button
            type="button"
            className="harbor-btn harbor-btn--ghost"
            onClick={() => markActivitiesRead()}
            disabled={unreadCount === 0 || busy}
            title="Acknowledge unread items without removing them"
          >
            Mark read{unreadCount > 0 ? ` (${unreadCount})` : ""}
          </button>
          <button
            type="button"
            className="harbor-btn harbor-btn--ghost"
            onClick={archiveReadActivities}
            disabled={archivableCount === 0 || busy}
            title="Move read, finished items to Archive"
          >
            Archive{archivableCount > 0 ? ` (${archivableCount})` : ""}
          </button>
          <button
            type="button"
            className="harbor-btn harbor-btn--ghost harbor-btn--danger"
            onClick={handleDeleteArchived}
            disabled={archivedCount === 0 || busy}
            title="Permanently remove all archived items"
          >
            Delete archived{archivedCount > 0 ? ` (${archivedCount})` : ""}
          </button>
        </div>
      </header>

      <div className="harbor-activity-toolbar">
        <div className="harbor-activity-inbox-switch">
          <button
            type="button"
            className={`harbor-activity-filter${inboxView === "inbox" ? " is-active" : ""}`}
            onClick={() => {
              setInboxView("inbox");
              setFilter("all");
            }}
          >
            Inbox
            <span className="harbor-activity-filter-count">
              {userActivities.filter(isActiveInbox).length}
            </span>
          </button>
          <button
            type="button"
            className={`harbor-activity-filter${inboxView === "archived" ? " is-active" : ""}`}
            onClick={() => {
              setInboxView("archived");
              setFilter("all");
            }}
          >
            Archived
            <span className="harbor-activity-filter-count">{archivedCount}</span>
          </button>
        </div>
        {(["all", "running", "ok", "err"] as const).map((status) => (
          <button
            key={status}
            type="button"
            className={`harbor-activity-filter${filter === status ? " is-active" : ""}`}
            onClick={() => setFilter(status)}
          >
            {status === "all"
              ? "All"
              : status === "running"
                ? "Running"
                : status === "ok"
                  ? "Success"
                  : "Errors"}
            <span className="harbor-activity-filter-count">{counts[status]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="harbor-activity-empty">
          {inboxView === "archived"
            ? archivedCount === 0
              ? "No archived activity. Mark items as read, then archive them from Inbox."
              : "No archived entries match this filter."
            : userActivities.filter(isActiveInbox).length === 0
              ? "No activity yet. Install skills, reload the catalog, or change settings to see actions here."
              : "No entries match this filter."}
        </p>
      ) : (
        <ul className="harbor-activity-list harbor-scroll">
          {visible.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`harbor-activity-row status-${item.status}${item.status === "running" ? " is-running" : ""}${isUnreadActivity(item) ? " is-unread" : ""}`}
                onClick={() => openActivity(item.id)}
              >
                <div className="harbor-activity-row-top">
                  <span className="harbor-activity-time">{formatActivityTime(item.ts)}</span>
                  <span className="harbor-activity-row-badges">
                    {isUnreadActivity(item) ? (
                      <span className="harbor-activity-badge is-unread">Unread</span>
                    ) : null}
                    {item.archived ? (
                      <span className="harbor-activity-badge is-archived">Archived</span>
                    ) : null}
                    <span className={`harbor-activity-badge status-${item.status}`}>
                      {item.status === "running"
                        ? "Running"
                        : item.status === "ok"
                          ? "Success"
                          : "Error"}
                    </span>
                  </span>
                </div>
                <span className="harbor-activity-action">{item.action}</span>
                <span className="harbor-activity-detail">
                  {item.status === "running"
                    ? latestLogLine(item) || item.summary
                    : item.summary}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
