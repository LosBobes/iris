import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, LogOut, RefreshCw } from "lucide-react";
import type { PlatformMetrics, PlatformRangeDays } from "@/types/platform";
import { buildRows, buildSeries } from "./series";
import { formatBytes, formatCount, formatDate, formatDateTime, formatDuration } from "./format";

// recharts stays in its own lazily loaded chunk (see vite.config.ts).
const ChartPanel = lazy(() => import("./PlatformCharts"));

const RANGES: PlatformRangeDays[] = [7, 30, 90, 365];
const REFRESH_OPTIONS = [0, 30, 60, 300] as const;
const RANGE_KEY = "iris.platform.range";
const REFRESH_KEY = "iris.platform.refresh";

function readNumber<T extends number>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    // An unset key reads as null, which Number() would turn into 0 ("off").
    if (raw === null) return fallback;
    const value = Number(raw);
    return (allowed as readonly number[]).includes(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function storeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // A per-device preference; losing it is harmless.
  }
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }): React.JSX.Element {
  return (
    <div className="min-w-0 rounded border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)] px-4 py-3">
      <div className="truncate text-[11px] text-[color:var(--pf-text-2)]">{label}</div>
      <div className="mt-1 truncate text-[26px] font-medium leading-tight tabular-nums text-[color:var(--pf-text)]">
        {value}
      </div>
      {hint ? <div className="mt-0.5 truncate text-[11px] text-[color:var(--pf-muted)]">{hint}</div> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="min-w-0 rounded border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)]">
      <header className="border-b border-[color:var(--pf-border)] px-4 py-2.5">
        <h2 className="text-[13px] font-medium text-[color:var(--pf-text)]">{title}</h2>
      </header>
      {children}
    </section>
  );
}

export function PlatformDashboard({
  username,
  onLogout,
}: {
  username: string;
  onLogout: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [range, setRange] = useState<PlatformRangeDays>(() => readNumber(RANGE_KEY, RANGES, 30));
  const [refreshSeconds, setRefreshSeconds] = useState<number>(() =>
    readNumber(REFRESH_KEY, REFRESH_OPTIONS, 60),
  );
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setMetrics(await window.api.getPlatformMetrics(range));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : t("platform.loadError"));
    } finally {
      setLoading(false);
    }
  }, [range, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!refreshSeconds) return;
    const id = window.setInterval(() => {
      // Don't poll a tab nobody is looking at.
      if (document.visibilityState === "visible") void load();
    }, refreshSeconds * 1000);
    return () => window.clearInterval(id);
  }, [load, refreshSeconds]);

  const bucketDays = range >= 90 ? 7 : 1;
  const { series, keyFor } = useMemo(
    () => buildSeries(metrics?.tenants ?? [], t("platform.charts.other")),
    [metrics?.tenants, t],
  );
  const workOrderRows = useMemo(
    () => (metrics ? buildRows(metrics.daily, "workOrders", series, keyFor, bucketDays) : []),
    [metrics, series, keyFor, bucketDays],
  );
  const loginRows = useMemo(
    () => (metrics ? buildRows(metrics.daily, "logins", series, keyFor, bucketDays) : []),
    [metrics, series, keyFor, bucketDays],
  );
  const bucketLabel = bucketDays === 7 ? t("platform.charts.perWeek") : t("platform.charts.perDay");
  const totals = metrics?.totals;
  const rangeHint = t("platform.rangeHint", { days: range });

  return (
    <div className="min-h-dvh bg-[color:var(--pf-bg)] text-[color:var(--pf-text)]">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 border-b border-[color:var(--pf-border)] bg-[color:var(--pf-bg)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
          <div className="mr-auto flex min-w-0 items-baseline gap-2">
            <span className="text-[15px] font-medium">Iris</span>
            <span className="truncate text-[12px] text-[color:var(--pf-muted)]">{t("platform.title")}</span>
          </div>

          <div role="radiogroup" aria-label={t("platform.range")} className="flex rounded border border-[color:var(--pf-border)] p-0.5">
            {RANGES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={range === value}
                onClick={() => {
                  setRange(value);
                  storeNumber(RANGE_KEY, value);
                }}
                className={`iris-focusable rounded-sm px-2.5 py-1 text-[12px] tabular-nums ${
                  range === value
                    ? "bg-white/10 text-[color:var(--pf-text)]"
                    : "text-[color:var(--pf-text-2)] hover:text-[color:var(--pf-text)]"
                }`}
              >
                {t("platform.rangeOption", { days: value })}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1.5 text-[12px] text-[color:var(--pf-text-2)]">
            {t("platform.autoRefresh")}
            <select
              value={refreshSeconds}
              onChange={(event) => {
                const value = Number(event.target.value);
                setRefreshSeconds(value);
                storeNumber(REFRESH_KEY, value);
              }}
              className="iris-focusable rounded border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)] px-1.5 py-1 text-[12px] text-[color:var(--pf-text)]"
            >
              {REFRESH_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value === 0
                    ? t("platform.refreshOff")
                    : value < 60
                      ? t("platform.refreshSeconds", { seconds: value })
                      : t("platform.refreshMinutes", { minutes: value / 60 })}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label={t("platform.refreshNow")}
            title={t("platform.refreshNow")}
            className="iris-focusable rounded border border-[color:var(--pf-border)] p-1.5 text-[color:var(--pf-text-2)] hover:text-[color:var(--pf-text)] disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          <div className="flex items-center gap-3 text-[12px] text-[color:var(--pf-muted)]">
            {metrics ? (
              <span className="hidden sm:inline">
                {t("platform.updatedAt", { time: formatDateTime(metrics.generatedAt) })}
              </span>
            ) : null}
            <span className="text-[color:var(--pf-text-2)]">{username}</span>
            <button
              type="button"
              onClick={onLogout}
              className="iris-focusable inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-white/5 hover:text-[color:var(--pf-text)]"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t("platform.logout")}
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-4 sm:px-6">
        {error ? (
          <div role="alert" className="rounded border border-[#e66767]/40 bg-[#e66767]/10 px-4 py-2.5 text-[12px] text-[color:var(--pf-text)]">
            {error}
          </div>
        ) : null}

        {!metrics ? (
          <p className="py-24 text-center text-[13px] text-[color:var(--pf-muted)]">
            {error ? null : t("common.loading")}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatTile label={t("platform.tiles.tenants")} value={formatCount(totals!.tenants)} />
              <StatTile
                label={t("platform.tiles.users")}
                value={formatCount(totals!.users)}
                hint={t("platform.tiles.activeUsers", { value: formatCount(totals!.activeUsersInRange) })}
              />
              <StatTile label={t("platform.tiles.customers")} value={formatCount(totals!.customers)} />
              <StatTile
                label={t("platform.tiles.workOrders")}
                value={formatCount(totals!.workOrders)}
                hint={t("platform.tiles.open", { value: formatCount(totals!.openWorkOrders) })}
              />
              <StatTile
                label={t("platform.tiles.newWorkOrders")}
                value={formatCount(totals!.workOrdersInRange)}
                hint={rangeHint}
              />
              <StatTile label={t("platform.tiles.logins")} value={formatCount(totals!.loginsInRange)} hint={rangeHint} />
              <StatTile label={t("platform.tiles.sessions")} value={formatCount(totals!.activeSessions)} hint={t("platform.tiles.now")} />
              <StatTile label={t("platform.tiles.catalog")} value={formatCount(totals!.catalogItems)} />
              <StatTile label={t("platform.tiles.database")} value={formatBytes(totals!.databaseBytes)} />
              <StatTile label={t("platform.tiles.uptime")} value={formatDuration(metrics.system.uptimeSeconds)} hint={metrics.system.release || undefined} />
            </div>

            <Suspense
              fallback={<div className="h-72 rounded border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)]" />}
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <ChartPanel
                  title={t("platform.charts.workOrders")}
                  bucketLabel={bucketLabel}
                  kind="bar"
                  rows={workOrderRows}
                  series={series}
                />
                <ChartPanel
                  title={t("platform.charts.logins")}
                  bucketLabel={bucketLabel}
                  kind="line"
                  rows={loginRows}
                  series={series}
                />
              </div>
            </Suspense>

            <Panel title={t("platform.table.title")}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-[12px]">
                  <thead className="text-left text-[11px] text-[color:var(--pf-muted)]">
                    <tr>
                      <th className="px-4 py-2 font-normal">{t("platform.table.organization")}</th>
                      <th className="px-3 py-2 text-right font-normal">{t("platform.table.users")}</th>
                      <th className="px-3 py-2 text-right font-normal">{t("platform.table.customers")}</th>
                      <th className="px-3 py-2 text-right font-normal">{t("platform.table.catalog")}</th>
                      <th className="px-3 py-2 text-right font-normal">{t("platform.table.workOrders")}</th>
                      <th className="px-3 py-2 text-right font-normal">{t("platform.table.inRange")}</th>
                      <th className="px-3 py-2 text-right font-normal">{t("platform.table.open")}</th>
                      <th className="px-3 py-2 text-right font-normal">{t("platform.table.logins")}</th>
                      <th className="px-3 py-2 text-right font-normal">{t("platform.table.activeUsers")}</th>
                      <th className="px-3 py-2 text-right font-normal">{t("platform.table.sessions")}</th>
                      <th className="px-3 py-2 font-normal">{t("platform.table.lastWorkOrder")}</th>
                      <th className="px-3 py-2 font-normal">{t("platform.table.lastLogin")}</th>
                      <th className="px-3 py-2 font-normal">{t("platform.table.logo")}</th>
                      <th className="px-4 py-2 font-normal">{t("platform.table.created")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.tenants.map((tenant) => {
                      const color = series.find((def) => def.key === keyFor(tenant.slug))?.color;
                      return (
                        <tr key={tenant.id} className="border-t border-[color:var(--pf-border)] hover:bg-white/[0.02]">
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                              <div className="min-w-0">
                                <div className="truncate text-[color:var(--pf-text)]">{tenant.name}</div>
                                <div className="truncate text-[11px] text-[color:var(--pf-muted)]">{tenant.slug}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatCount(tenant.users)}
                            <span className="text-[color:var(--pf-muted)]"> / {formatCount(tenant.admins)}</span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCount(tenant.customers)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCount(tenant.catalogItems)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCount(tenant.workOrders)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCount(tenant.workOrdersInRange)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCount(tenant.openWorkOrders)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCount(tenant.loginsInRange)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCount(tenant.activeUsersInRange)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatCount(tenant.activeSessions)}</td>
                          <td className="px-3 py-2 text-[color:var(--pf-text-2)]">{formatDateTime(tenant.lastWorkOrderAt) ?? "—"}</td>
                          <td className="px-3 py-2 text-[color:var(--pf-text-2)]">{formatDateTime(tenant.lastLoginAt) ?? "—"}</td>
                          <td className="px-3 py-2">
                            {tenant.hasLoginLogo ? (
                              <Check className="h-3.5 w-3.5 text-[color:var(--pf-text-2)]" aria-label={t("platform.table.hasLogo")} />
                            ) : (
                              <span className="text-[color:var(--pf-muted)]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-[color:var(--pf-text-2)]">{formatDate(tenant.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-[color:var(--pf-border)] px-4 py-2 text-[11px] text-[color:var(--pf-muted)]">
                {t("platform.table.footnote")}
              </p>
            </Panel>

            <Panel title={t("platform.system.title")}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3 text-[12px] sm:grid-cols-3 lg:grid-cols-6">
                {[
                  [t("platform.system.release"), metrics.system.release || "—"],
                  [t("platform.system.go"), metrics.system.goVersion],
                  [t("platform.system.started"), formatDateTime(metrics.system.startedAt) ?? "—"],
                  [t("platform.system.goroutines"), formatCount(metrics.system.goroutines)],
                  [t("platform.system.heap"), formatBytes(metrics.system.heapBytes)],
                  [t("platform.system.range"), `${formatDate(metrics.rangeStart)} – ${formatDate(metrics.generatedAt)}`],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[11px] text-[color:var(--pf-muted)]">{label}</dt>
                    <dd className="truncate tabular-nums text-[color:var(--pf-text)]">{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </>
        )}
      </main>
    </div>
  );
}
