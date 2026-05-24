import { useCallback, useEffect, useRef, useState } from "react";
import { AdminActivityDetail } from "../admin/AdminActivityDetail";
import {
  formatApiError,
  getAdminActivity,
  getAdminActivityRunning,
  getAdminDashboard,
  getDiscoverySettings,
  getRegistrySettings,
  patchDiscoverySettings,
  patchRegistrySettings,
  type DiscoveryUiConfig,
  postAdminRefreshStars,
  postAdminRegistryDedupe,
  postAdminRegistryExpand,
  postAdminRegistryPrune,
  postAdminRegistryEvolve,
  postAdminRegistryDiscover,
  postAdminRegistryCrawlBatch,
  postAdminRegistryReclassify,
  postAdminRegistryRefresh,
  postAdminRegistrySync,
  postCustomRepoImport,
  postAdminActivityCancel,
  type AdminActivityRow,
  type AdminDashboard,
  type AdminJobStart,
} from "../api";
import { Button } from "../components/ui/Button";
import { Field, TextInput } from "../components/ui/Field";

type Props = {
  githubTokenSet: boolean;
  onLogout: () => void;
  onGithubTokenSaved: () => void;
  patchGithubToken: (body: {
    admin_github_token?: string | null;
  }) => Promise<{ github_token_set: boolean; stars_last_refreshed_at?: string | null }>;
};

type ActivityRow = {
  id: number | string;
  action: string;
  detail: string;
  status: string;
  created_at: string;
  progress?: number;
  step?: string;
  summary?: string;
  logs?: AdminActivityRow["logs"];
};

type BarItem = { label: string; value: number };

type Banner = { kind: "ok" | "err" | "info"; text: string } | null;

function latestHumanLogLine(logs?: AdminActivityRow["logs"]): string | null {
  if (!logs?.length) return null;
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const line = logs[i];
    if (line.kind !== "dev" && line.message.trim()) return line.message.trim();
  }
  return null;
}

function formatErr(e: unknown): string {
  const raw = String(e);
  if (raw.startsWith("Error: ")) return raw.slice(7);
  return raw;
}

function BarChart({ items, valueKey = "value" }: { items: BarItem[]; valueKey?: string }) {
  if (!items.length) {
    return <p className="admin-empty">No data yet.</p>;
  }
  const max = Math.max(...items.map((i) => Number(i[valueKey as keyof BarItem] ?? i.value)), 1);
  return (
    <div className="admin-bars">
      {items.map((item) => {
        const val = Number(item[valueKey as keyof BarItem] ?? item.value);
        return (
          <div key={item.label} className="admin-bar-row">
            <span className="admin-bar-label" title={item.label}>
              {item.label}
            </span>
            <div className="admin-bar-track">
              <div className="admin-bar-fill" style={{ width: `${(val / max) * 100}%` }} />
            </div>
            <span className="admin-bar-val">{val.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}

function GrowthChart({ items }: { items: BarItem[] }) {
  if (!items.length) {
    return <p className="admin-empty">Run a registry refresh to see growth.</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="admin-growth">
      {items.map((item) => (
        <div className="admin-growth-col" key={item.label} title={`${item.label}: ${item.value}`}>
          <div
            className="admin-growth-bar"
            style={{ height: `${Math.max(8, (item.value / max) * 100)}%` }}
          />
          <span className="admin-growth-label">{item.label.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="admin-kpis admin-kpis--loading" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="admin-kpi admin-kpi--skeleton" />
      ))}
    </div>
  );
}

export function AdminPage({ githubTokenSet, onLogout, onGithubTokenSaved, patchGithubToken }: Props) {
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ghToken, setGhToken] = useState("");
  const [banner, setBanner] = useState<Banner>(null);
  const [dash, setDash] = useState<AdminDashboard | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [runningJob, setRunningJob] = useState<AdminActivityRow | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [customRepo, setCustomRepo] = useState("");
  const [lastOp, setLastOp] = useState("");
  const [minRepoStars, setMinRepoStars] = useState("5000");
  const [discoveryJson, setDiscoveryJson] = useState("");
  const [stopping, setStopping] = useState(false);

  const stopRunningJob = async (activityId?: number) => {
    const id = activityId ?? runningJob?.id;
    if (id == null) return;
    if (
      !window.confirm(
        "Stop this job? Any in-progress work will be left incomplete, but the registry stays as-is and you can start a new operation."
      )
    ) {
      return;
    }
    setStopping(true);
    try {
      const res = await postAdminActivityCancel(id);
      setBanner({
        kind: res.ok ? "ok" : "err",
        text: res.message || (res.ok ? "Job stopped." : "Could not stop job."),
      });
      setRunningJob(null);
      setBusy(false);
      setLastOp("");
      await reload();
    } catch (e) {
      setBanner({ kind: "err", text: formatErr(e) });
    } finally {
      setStopping(false);
    }
  };

  const reload = useCallback(async () => {
    setLoading(true);
    const errors: string[] = [];

    try {
      const health = await fetch("/api/health", { credentials: "include" });
      if (!health.ok) {
        errors.push(formatApiError(await health.text(), health.status, health.statusText));
      }
    } catch {
      errors.push("Cannot reach the API. Run npm run dev and reload this page.");
    }

    try {
      const d = await getAdminDashboard();
      setDash(d);
    } catch (e) {
      errors.push(formatErr(e));
    }

    try {
      const a = await getAdminActivity();
      setActivity(a.items);
      const run = await getAdminActivityRunning();
      setRunningJob(run.job);
    } catch (e) {
      errors.push(`Activity: ${formatErr(e)}`);
    }

    try {
      const disc = await getDiscoverySettings();
      setDiscoveryJson(JSON.stringify(disc.discovery_ui, null, 2));
    } catch (e) {
      errors.push(`Discovery UI: ${formatErr(e)}`);
    }

    try {
      const reg = await getRegistrySettings();
      const min = reg.settings.find((s) => s.key === "min_repo_stars");
      if (min) setMinRepoStars(String(min.value));
    } catch {
      /* optional */
    }

    setBanner(errors.length ? { kind: "err", text: errors.join(" · ") } : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!runningJob && !busy) return;
    pollRef.current = setInterval(async () => {
      try {
        const run = await getAdminActivityRunning();
        setRunningJob(run.job);
        if (run.running) {
          const a = await getAdminActivity();
          setActivity(a.items);
        } else if (busy) {
          setBusy(false);
          setLastOp("");
          await reload();
        }
      } catch {
        /* ignore poll errors */
      }
    }, 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [runningJob?.id, runningJob?.status, busy, reload]);

  useEffect(() => {
    getRegistrySettings()
      .then((r) => {
        const row = r.settings.find((s) => s.key === "min_repo_stars");
        if (row) setMinRepoStars(String(row.value));
      })
      .catch(() => {});
  }, []);

  const saveGithubToken = async () => {
    if (!ghToken.trim()) return;
    setBusy(true);
    try {
      await patchGithubToken({ admin_github_token: ghToken.trim() });
      setGhToken("");
      setBanner({ kind: "ok", text: "GitHub token saved." });
      await onGithubTokenSaved();
    } catch (e) {
      setBanner({ kind: "err", text: formatErr(e) });
    } finally {
      setBusy(false);
    }
  };

  const startRegistryJob = async (label: string, startFn: () => Promise<AdminJobStart>) => {
    setBusy(true);
    setLastOp(label);
    setBanner({ kind: "info", text: `Starting ${label.toLowerCase()}…` });
    try {
      const res = await startFn();
      setBanner({ kind: "info", text: res.message });
      const run = await getAdminActivityRunning();
      setRunningJob(run.job);
      if (res.activity_id) setDetailId(res.activity_id);
      const a = await getAdminActivity();
      setActivity(a.items);
    } catch (e) {
      setBanner({ kind: "err", text: formatErr(e) });
      setBusy(false);
      setLastOp("");
    }
  };

  const startEvolve = (force = false) =>
    startRegistryJob(force ? "Force evolve" : "Evolve registry", () =>
      postAdminRegistryEvolve(force)
    );

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setLastOp(label);
    setBanner({ kind: "info", text: `${label}…` });
    try {
      await fn();
      setBanner({ kind: "ok", text: `${label} finished.` });
      await reload();
    } catch (e) {
      setBanner({ kind: "err", text: formatErr(e) });
    } finally {
      setBusy(false);
      setLastOp("");
    }
  };

  const k = dash?.kpis;
  const activityRows: ActivityRow[] = [
    ...activity,
    ...(dash?.sync_history ?? []).map((s) => ({
      id: `sync-${s.id}`,
      action: `sync.${s.status}`,
      detail: `${s.assets_updated} updated · ${s.error_count} errors`,
      status: s.status,
      created_at: s.finished_at || s.started_at,
    })),
  ].slice(0, 40);

  return (
    <div className="admin-page admin-standalone-inner">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">Skill Harbor</p>
          <h1>Registry admin</h1>
          <p className="admin-sub">
            Manage catalog, discovery, and live policy — not visible in the public app.
          </p>
        </div>
        <div className="admin-header-actions">
          <Button variant="ghost" onClick={() => reload()} disabled={busy || loading}>
            Refresh
          </Button>
          <Button variant="ghost" onClick={onLogout}>
            Sign out
          </Button>
        </div>
      </header>

      <div className="admin-chips">
        <span className={`admin-chip ${githubTokenSet ? "admin-chip--ok" : ""}`}>
          GitHub API {githubTokenSet ? "connected" : "not set"}
        </span>
        {k ? (
          <span className="admin-chip">
            {k.total_assets.toLocaleString()} assets · {k.unique_repos} repos
          </span>
        ) : null}
        {dash?.db_path ? (
          <span className="admin-chip admin-chip--mono" title={dash.db_path}>
            DB {dash.db_path.split(/[/\\]/).pop()}
          </span>
        ) : null}
        {runningJob ? (
          <span className="admin-chip admin-chip--busy">
            {runningJob.step || runningJob.action} ({runningJob.progress ?? 0}%)
          </span>
        ) : null}
        {busy && lastOp && !runningJob ? (
          <span className="admin-chip admin-chip--busy">{lastOp}…</span>
        ) : null}
      </div>

      {runningJob ? (
        <section className="admin-live-job" aria-live="polite">
          <div className="admin-live-job-head">
            <span className="admin-pulse-dot" aria-hidden />
            <strong>{runningJob.action}</strong>
            <span className="admin-live-job-step">{runningJob.step || "Working…"}</span>
            <button type="button" className="admin-live-job-open" onClick={() => setDetailId(runningJob.id)}>
              View log
            </button>
            <button
              type="button"
              className="admin-live-job-stop"
              onClick={() => void stopRunningJob(runningJob.id)}
              disabled={stopping}
            >
              {stopping ? "Stopping…" : "Stop"}
            </button>
          </div>
          <div className="admin-job-progress">
            <div
              className="admin-job-progress-fill"
              style={{ width: `${runningJob.progress ?? 0}%` }}
            />
          </div>
          <p className="admin-live-job-hint">
            {latestHumanLogLine(runningJob.logs) ||
              "Discover fills the queue; Crawl processes it. Run Evolve again to keep growing."}
          </p>
        </section>
      ) : null}

      {banner ? (
        <div className={`admin-banner admin-banner--${banner.kind}`} role="status">
          {banner.text}
          <button type="button" className="admin-banner-dismiss" onClick={() => setBanner(null)}>
            ×
          </button>
        </div>
      ) : null}

      {loading && !k ? <KpiSkeleton /> : null}

      {k ? (
        <section className="admin-kpis" aria-label="Key metrics">
          <article className="admin-kpi">
            <span className="admin-kpi-label">Assets</span>
            <strong className="admin-kpi-value">{k.total_assets.toLocaleString()}</strong>
          </article>
          <article className="admin-kpi">
            <span className="admin-kpi-label">Synced</span>
            <strong className="admin-kpi-value">{k.sync_coverage_pct}%</strong>
            <span className="admin-kpi-hint">{k.synced_content.toLocaleString()} with content</span>
          </article>
          <article className="admin-kpi">
            <span className="admin-kpi-label">Repos</span>
            <strong className="admin-kpi-value">{k.unique_repos}</strong>
            {(k.queue_pending ?? 0) > 0 ? (
              <span className="admin-kpi-hint">{k.queue_pending} queued to crawl</span>
            ) : null}
          </article>
          <article className="admin-kpi">
            <span className="admin-kpi-label">Min stars</span>
            <strong className="admin-kpi-value">{k.min_repo_stars.toLocaleString()}★</strong>
            <span className="admin-kpi-hint">{k.below_min_stars} below threshold</span>
          </article>
          <article className="admin-kpi">
            <span className="admin-kpi-label">Votes</span>
            <strong className="admin-kpi-value">
              {(k.total_upvotes - k.total_downvotes).toLocaleString()}
            </strong>
            <span className="admin-kpi-hint">{k.unique_voters} voters</span>
          </article>
          <article className="admin-kpi">
            <span className="admin-kpi-label">Database</span>
            <strong className="admin-kpi-value">{k.db_size_mb} MB</strong>
          </article>
        </section>
      ) : null}

      <div className="admin-layout">
        <div className="admin-layout-main">
          <section className="admin-panel admin-panel--ops">
            <div className="admin-panel-head">
              <h2>Registry operations</h2>
              <p className="admin-panel-desc">
                Discover searches GitHub like the repo search bar (skills, ai rules, claude skills,
                … — sorted by stars) plus path queries for SKILL.md / .cursor/*. Unrelated repos
                are rejected. Evolve = discover + crawl up to 30 repos. Run Evolve repeatedly to
                grow the catalog over time.
              </p>
            </div>
            <div className="admin-ops-grid">
              <Button
                variant="primary"
                onClick={() => startEvolve(false)}
                disabled={busy || !!runningJob}
              >
                Evolve
              </Button>
              <Button
                variant="ghost"
                onClick={() => startEvolve(true)}
                disabled={busy || !!runningJob}
                title="Ignore crawl cooldown and re-scan seeds"
              >
                Force
              </Button>
              <Button
                variant="ghost"
                onClick={() => startRegistryJob("Discover", () => postAdminRegistryDiscover())}
                disabled={busy || !!runningJob || !githubTokenSet}
                title={githubTokenSet ? "Search GitHub and fill discovery queue" : "Save a GitHub token first"}
              >
                Discover
              </Button>
              <Button
                variant="ghost"
                onClick={() => startRegistryJob("Crawl batch", () => postAdminRegistryCrawlBatch())}
                disabled={busy || !!runningJob}
                title="Crawl next batch from discovery queue"
              >
                Crawl
              </Button>
              <Button
                variant="ghost"
                onClick={() => startRegistryJob("Full refresh", postAdminRegistryRefresh)}
                disabled={busy || !!runningJob}
              >
                Refresh
              </Button>
              <Button
                variant="ghost"
                onClick={() => startRegistryJob("Expand crawl", postAdminRegistryExpand)}
                disabled={busy || !!runningJob}
              >
                Expand
              </Button>
              <Button
                variant="ghost"
                onClick={() => startRegistryJob("Refresh stars", postAdminRefreshStars)}
                disabled={busy || !!runningJob || !githubTokenSet}
                title={githubTokenSet ? undefined : "Save a GitHub token first"}
              >
                Stars
              </Button>
              <Button
                variant="ghost"
                onClick={() => startRegistryJob("Reclassify", postAdminRegistryReclassify)}
                disabled={busy || !!runningJob}
              >
                Classify
              </Button>
              <Button
                variant="ghost"
                onClick={() => startRegistryJob("Dedupe", postAdminRegistryDedupe)}
                disabled={busy || !!runningJob}
              >
                Dedupe
              </Button>
              <Button
                variant="ghost"
                onClick={() => startRegistryJob("Prune", postAdminRegistryPrune)}
                disabled={busy || !!runningJob}
              >
                Prune
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  startRegistryJob("Sync content", () => postAdminRegistrySync(false))
                }
                disabled={busy || !!runningJob}
              >
                Sync
              </Button>
            </div>
            <div className="admin-form-row">
              <Field label="Import custom repo (exempt from star minimum)">
                <TextInput
                  className="admin-input"
                  type="url"
                  value={customRepo}
                  onChange={(e) => setCustomRepo(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                />
              </Field>
              <Button
                className="admin-form-btn"
                variant="primary"
                onClick={() => {
                  const url = customRepo.trim();
                  if (!url) return;
                  void run("Custom import", () => postCustomRepoImport(url)).then(() =>
                    setCustomRepo("")
                  );
                }}
                disabled={busy || !customRepo.trim() || !!runningJob}
              >
                Apply
              </Button>
            </div>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-head">
              <h2>Live policy</h2>
              <p className="admin-panel-desc">Stored in database — applies without redeploy.</p>
            </div>
            <div className="admin-form-row">
              <Field label="Minimum repo stars">
                <TextInput
                  className="admin-input"
                  type="number"
                  value={minRepoStars}
                  onChange={(e) => setMinRepoStars(e.target.value)}
                  min={100}
                />
              </Field>
              <Button
                className="admin-form-btn"
                variant="primary"
                disabled={busy || !!runningJob}
                onClick={() =>
                  run("Save settings", () =>
                    patchRegistrySettings({ min_repo_stars: Number(minRepoStars) })
                  )
                }
              >
                Apply
              </Button>
            </div>
          </section>

          <section className="admin-panel admin-panel--discovery">
            <div className="admin-panel-head">
              <h2>Discovery panel</h2>
              <p className="admin-panel-desc">
                Layout and limits for the public Discovery page (stored in DB — no redeploy). Template:{" "}
                <code>config/discovery-ui.default.json</code>. After taxonomy changes, run{" "}
                <strong>Reclassify</strong> above.
              </p>
            </div>
            <div className="admin-discovery-editor">
              <label className="admin-discovery-editor__label" htmlFor="discovery-ui-json">
                Configuration
                <span className="admin-discovery-editor__format">JSON</span>
              </label>
              <textarea
                id="discovery-ui-json"
                className="admin-discovery-editor__textarea"
                rows={16}
                value={discoveryJson}
                onChange={(e) => setDiscoveryJson(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="admin-discovery-actions">
              <Button
                variant="primary"
                disabled={busy || !!runningJob || !discoveryJson.trim()}
                onClick={() =>
                  run("Save discovery UI", async () => {
                    const parsed = JSON.parse(discoveryJson) as DiscoveryUiConfig;
                    await patchDiscoverySettings(parsed);
                  })
                }
              >
                Apply discovery UI
              </Button>
            </div>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-head">
              <h2>GitHub token</h2>
              <p className="admin-panel-desc">Required for search discovery and live star counts.</p>
            </div>
            <div className="admin-form-row">
              <Field label="Personal access token">
                <TextInput
                  className="admin-input"
                  type="password"
                  value={ghToken}
                  onChange={(e) => setGhToken(e.target.value)}
                  placeholder="ghp_…"
                  autoComplete="off"
                />
              </Field>
              <Button
                className="admin-form-btn"
                variant="primary"
                onClick={saveGithubToken}
                disabled={busy || !ghToken.trim()}
              >
                Apply
              </Button>
            </div>
          </section>
        </div>

        <aside className="admin-layout-side">
          <section className="admin-panel admin-panel--activity">
            <div className="admin-panel-head">
              <h2>Activity</h2>
              <p className="admin-panel-desc">Admin actions and sync runs.</p>
            </div>
            {activityRows.length === 0 ? (
              <p className="admin-empty">
                No activity yet. Run an operation or sign in again to log events.
              </p>
            ) : (
              <ul className="admin-activity harbor-scroll">
                {activityRows.map((item) => {
                  const isRunning = item.status === "running";
                  const numericId = typeof item.id === "number" ? item.id : null;
                  return (
                  <li
                    key={`${item.action}-${item.id}-${item.created_at}`}
                    className={`admin-activity-row status-${item.status}${isRunning ? " is-running" : ""}${numericId ? " is-clickable" : ""}`}
                    onClick={() => numericId && setDetailId(numericId)}
                    onKeyDown={(e) => {
                      if (numericId && (e.key === "Enter" || e.key === " ")) setDetailId(numericId);
                    }}
                    role={numericId ? "button" : undefined}
                    tabIndex={numericId ? 0 : undefined}
                  >
                    <div className="admin-activity-row-top">
                      <span className="admin-activity-time">
                        {item.created_at
                          ? new Date(item.created_at).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </span>
                      {isRunning ? (
                        <span className="admin-activity-badge">Running {item.progress ?? 0}%</span>
                      ) : null}
                    </div>
                    <span className="admin-activity-action">{item.action}</span>
                    <span className="admin-activity-detail">
                      {isRunning
                        ? latestHumanLogLine(item.logs) || item.summary || item.step || item.detail || "—"
                        : item.summary || item.detail || "—"}
                    </span>
                  </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {dash && !loading ? (
        <div className="admin-charts">
          <section className="admin-panel">
            <h2>Asset types</h2>
            <BarChart items={dash.charts.by_asset_type} />
          </section>
          <section className="admin-panel">
            <h2>Source types</h2>
            <BarChart items={dash.charts.by_source_type} />
          </section>
          <section className="admin-panel admin-panel--wide">
            <h2>Growth (14 days)</h2>
            <GrowthChart items={dash.charts.registry_growth} />
          </section>
          <section className="admin-panel">
            <h2>Top repos</h2>
            <BarChart
              items={dash.charts.top_repos.map((r) => ({
                label: r.label.split("/").pop() ?? r.label,
                value: r.assets,
              }))}
            />
          </section>
          <section className="admin-panel">
            <h2>Top domains</h2>
            <BarChart items={dash.charts.top_domains} />
          </section>
        </div>
      ) : null}

      {detailId ? (
        <AdminActivityDetail
          activityId={detailId}
          onClose={() => setDetailId(null)}
          onStop={stopRunningJob}
          stopping={stopping}
        />
      ) : null}
    </div>
  );
}
