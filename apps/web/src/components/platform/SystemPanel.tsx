import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, DatabaseBackup } from "lucide-react";
import { APP_VERSION } from "@/lib/app-version";
import type { PlatformBackups, PlatformBackupStatus, PlatformSystem, PlatformTotals } from "@/types/platform";
import { formatBytes, formatCount, formatDateTime, formatDuration } from "./format";

/** Whole hours read as "24 h"; anything else falls back to "1 d 2 h". */
function formatInterval(seconds: number): string {
  return seconds % 3600 === 0 ? `${seconds / 3600} h` : formatDuration(seconds);
}

/**
 * The dashboard banner for an overdue backup. Shown only when the API takes
 * backups itself (SQLite); on PostgreSQL they are managed outside.
 */
export function BackupWarning({
  status,
  action,
}: {
  status: PlatformBackupStatus | undefined;
  action?: React.ReactNode;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  if (!status?.supported || !status.stale) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-[#e0a84f]/40 bg-[#e0a84f]/10 px-4 py-2.5 text-[12px] text-[color:var(--pf-text)]"
    >
      <AlertTriangle aria-hidden className="h-4 w-4 shrink-0 text-[#e0a84f]" />
      <span className="mr-auto">
        {status.lastBackupAt
          ? `${t("platform.backups.stale", { hours: status.staleAfterHours })} ${t("platform.backups.last")}: ${formatDateTime(status.lastBackupAt)}.`
          : t("platform.backups.none")}
      </span>
      {action}
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="min-w-0 rounded-lg border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)]">
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-[color:var(--pf-border)] px-4 py-2">
        <h2 className="text-[14px] font-medium text-[color:var(--pf-text)]">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function Facts({ items }: { items: Array<[string, string]> }): React.JSX.Element {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 px-4 py-4 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] text-[color:var(--pf-muted)]">{label}</dt>
          <dd className="break-words tabular-nums text-[color:var(--pf-text)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Backoffice "Sistem" section: what is running (app version, database engine,
 * schema version, size, uptime) and the database backups. Backups can be taken
 * and listed here but never downloaded; on PostgreSQL the panel explains that
 * they are made outside the app.
 */
export function SystemPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [system, setSystem] = useState<{ system: PlatformSystem; totals: PlatformTotals } | null>(null);
  const [backups, setBackups] = useState<PlatformBackups | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [metrics, list] = await Promise.all([window.api.getPlatformMetrics(7), window.api.getPlatformBackups()]);
      setSystem({ system: metrics.system, totals: metrics.totals });
      setBackups(list);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : t("platform.backups.loadError"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const createBackup = async (): Promise<void> => {
    setCreating(true);
    setNotice(null);
    try {
      const created = await window.api.createPlatformBackup();
      setNotice(t("platform.backups.created", { name: created.name }));
      setError(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : t("platform.backups.loadError"));
    } finally {
      setCreating(false);
    }
  };

  const info = system?.system;
  const engineLabel = (engine: string | undefined): string =>
    engine === "postgres" ? "PostgreSQL" : engine === "sqlite" ? "SQLite" : "—";

  return (
    <div className="space-y-4">
      {error ? (
        <div role="alert" className="rounded border border-[#e66767]/40 bg-[#e66767]/10 px-4 py-2.5 text-[12px] text-[color:var(--pf-text)]">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="rounded border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)] px-4 py-2.5 text-[12px] text-[color:var(--pf-text)]">
          {notice}
        </div>
      ) : null}

      <Section title={t("platform.system.title")}>
        {info ? (
          <Facts
            items={[
              [t("platform.system.appVersion"), APP_VERSION],
              [t("platform.system.release"), info.release || "—"],
              [t("platform.system.engine"), engineLabel(info.engine)],
              [t("platform.system.schema"), info.schemaVersion ? String(info.schemaVersion) : "—"],
              [t("platform.system.database"), formatBytes(system.totals.databaseBytes)],
              [t("platform.system.started"), formatDateTime(info.startedAt) ?? "—"],
              [t("platform.system.uptime"), formatDuration(info.uptimeSeconds)],
              [t("platform.system.go"), info.goVersion],
            ]}
          />
        ) : (
          <p className="px-4 py-6 text-[13px] text-[color:var(--pf-muted)]">{error ? null : t("common.loading")}</p>
        )}
      </Section>

      <Section
        title={t("platform.backups.title")}
        action={
          backups?.supported ? (
            <button
              type="button"
              onClick={() => void createBackup()}
              disabled={creating}
              className="iris-focusable flex min-h-9 items-center gap-2 rounded-md border border-[color:var(--pf-border)] px-3 text-[13px] font-medium text-[color:var(--pf-text)] hover:bg-white/5 disabled:opacity-60"
            >
              <DatabaseBackup aria-hidden className="h-4 w-4" />
              {creating ? t("platform.backups.creating") : t("platform.backups.create")}
            </button>
          ) : null
        }
      >
        {!backups ? (
          <p className="px-4 py-6 text-[13px] text-[color:var(--pf-muted)]">{error ? null : t("common.loading")}</p>
        ) : !backups.supported ? (
          <div className="px-4 py-4 text-[13px]">
            <p className="font-medium text-[color:var(--pf-text)]">{t("platform.backups.unsupportedTitle")}</p>
            <p className="mt-1 text-[color:var(--pf-text-2)]">{t("platform.backups.unsupported")}</p>
          </div>
        ) : (
          <>
            <div className="px-4 pt-4">
              <BackupWarning status={backups} />
            </div>
            <Facts
              items={[
                [t("platform.backups.last"), formatDateTime(backups.lastBackupAt) ?? t("platform.backups.never")],
                [
                  t("platform.backups.schedule"),
                  backups.intervalSeconds
                    ? t("platform.backups.scheduleEvery", { value: formatInterval(backups.intervalSeconds) })
                    : t("platform.backups.scheduleOff"),
                ],
                [
                  t("platform.backups.keep"),
                  backups.keep ? t("platform.backups.keepCount", { count: backups.keep }) : t("platform.backups.keepAll"),
                ],
                [t("platform.backups.directory"), backups.directory],
              ]}
            />
            {backups.items.length === 0 ? (
              <p className="border-t border-[color:var(--pf-border)] px-4 py-6 text-center text-[13px] text-[color:var(--pf-muted)]">
                {t("platform.backups.empty")}
              </p>
            ) : (
              <div className="overflow-x-auto border-t border-[color:var(--pf-border)]">
                <table className="w-full min-w-[480px] text-[13px]">
                  <thead className="text-left text-[12px] text-[color:var(--pf-muted)]">
                    <tr>
                      <th className="px-4 py-2.5 font-normal">{t("platform.backups.name")}</th>
                      <th className="px-3 py-2.5 font-normal">{t("platform.backups.createdAt")}</th>
                      <th className="px-4 py-2.5 text-right font-normal">{t("platform.backups.size")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.items.map((item) => (
                      <tr key={item.name} className="iris-row border-t border-[color:var(--pf-border)] hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 font-mono text-[12px] text-[color:var(--pf-text)]">{item.name}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-[color:var(--pf-text-2)]">
                          {formatDateTime(item.createdAt) ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[color:var(--pf-text-2)]">{formatBytes(item.sizeBytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="border-t border-[color:var(--pf-border)] px-4 py-2 text-[11px] text-[color:var(--pf-muted)]">
              {backups.total > backups.items.length
                ? `${t("platform.backups.shown", { shown: formatCount(backups.items.length), total: formatCount(backups.total) })} · `
                : ""}
              {t("platform.backups.footnote")}
            </p>
          </>
        )}
      </Section>
    </div>
  );
}
