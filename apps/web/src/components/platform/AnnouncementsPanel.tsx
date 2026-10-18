import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleStop, Info, Pencil, Plus, Trash2, TriangleAlert, Wrench } from "lucide-react";
import { staggerStyle } from "@/lib/motion";
import type { AnnouncementSeverity, PlatformAnnouncement, PlatformAnnouncementStatus } from "@/types/announcement";
import { formatDateTime } from "./format";
import {
  BackofficeDialog,
  backofficeError,
  backofficePrimaryButtonClass,
  backofficeSecondaryButtonClass,
  backofficeSmallButtonClass,
} from "./BackofficeDialog";
import { AnnouncementFormDialog } from "./AnnouncementFormDialog";

const ghostButtonBase = "iris-focusable flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] hover:bg-white/5";
const ghostButtonClass = `${ghostButtonBase} text-[color:var(--pf-text-2)] hover:text-[color:var(--pf-text)]`;

const GROUPS: PlatformAnnouncementStatus[] = ["active", "scheduled", "ended"];

const SEVERITY_BADGE: Record<AnnouncementSeverity, { className: string; Icon: typeof Info }> = {
  info: { className: "border-sky-500/40 text-sky-300", Icon: Info },
  warning: { className: "border-yellow-400/40 text-yellow-300", Icon: TriangleAlert },
  maintenance: { className: "border-red-500/50 text-red-300", Icon: Wrench },
};

type OpenDialog =
  | { kind: "create" }
  | { kind: "edit"; announcement: PlatformAnnouncement }
  | { kind: "end"; announcement: PlatformAnnouncement }
  | { kind: "delete"; announcement: PlatformAnnouncement };

/**
 * Backoffice announcements: banners shown to all or chosen organizations,
 * grouped as active, scheduled and past. Every change lands in the activity
 * log.
 */
export function AnnouncementsPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [items, setItems] = useState<PlatformAnnouncement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      setItems(await window.api.getPlatformAnnouncements());
      setError(null);
    } catch (cause) {
      setError(backofficeError(cause, t("platform.loadError")));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const close = useCallback(() => setDialog(null), []);

  const confirm = async (kind: "end" | "delete", announcement: PlatformAnnouncement): Promise<void> => {
    setBusy(true);
    try {
      if (kind === "end") await window.api.endPlatformAnnouncement(announcement.id);
      else await window.api.deletePlatformAnnouncement(announcement.id);
      setNotice(t(kind === "end" ? "platform.announcements.endedNotice" : "platform.announcements.deletedNotice"));
      await load();
    } catch (cause) {
      setError(backofficeError(cause, t("platform.announcements.failed")));
    } finally {
      setBusy(false);
      setDialog(null);
    }
  };

  const severityBadge = (severity: AnnouncementSeverity): React.JSX.Element => {
    const { className, Icon } = SEVERITY_BADGE[severity];
    return (
      <span className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${className}`}>
        <Icon aria-hidden className="h-3 w-3" />
        {t(`platform.announcements.severities.${severity}`)}
      </span>
    );
  };

  const item = (announcement: PlatformAnnouncement, index: number): React.JSX.Element => (
    <li
      key={announcement.id}
      style={staggerStyle(index)}
      data-testid="announcement-item"
      className="animate-iris-rise iris-stagger space-y-2 border-t border-[color:var(--pf-border)] px-4 py-3 text-[13px] first:border-t-0"
    >
      <div className="flex flex-wrap items-start gap-2">
        {severityBadge(announcement.severity)}
        <p className="min-w-0 flex-1 whitespace-pre-line break-words text-[color:var(--pf-text)]">{announcement.message}</p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[color:var(--pf-text-2)]">
        <span className="tabular-nums">
          {t("platform.announcements.from", { time: formatDateTime(announcement.startsAt) })}
          {" · "}
          {announcement.endsAt
            ? t("platform.announcements.to", { time: formatDateTime(announcement.endsAt) })
            : t("platform.announcements.openEnded")}
        </span>
        <span>
          {announcement.allTenants
            ? t("platform.announcements.allTenants")
            : announcement.tenants.map((tenant) => tenant.name).join(", ")}
        </span>
        <span className="text-[color:var(--pf-muted)]">{t("platform.announcements.by", { username: announcement.createdBy })}</span>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1">
        <button type="button" onClick={() => setDialog({ kind: "edit", announcement })} className={ghostButtonClass}>
          <Pencil aria-hidden className="h-3.5 w-3.5" />
          {t("platform.announcements.edit")}
        </button>
        {announcement.status === "ended" ? null : (
          <button type="button" onClick={() => setDialog({ kind: "end", announcement })} className={ghostButtonClass}>
            <CircleStop aria-hidden className="h-3.5 w-3.5" />
            {t("platform.announcements.end")}
          </button>
        )}
        <button
          type="button"
          onClick={() => setDialog({ kind: "delete", announcement })}
          className={`${ghostButtonBase} text-[#e66767]`}
        >
          <Trash2 aria-hidden className="h-3.5 w-3.5" />
          {t("platform.announcements.delete")}
        </button>
      </div>
    </li>
  );

  return (
    <section className="min-w-0 rounded-lg border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)]">
      <header className="flex items-center justify-between gap-3 border-b border-[color:var(--pf-border)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-medium text-[color:var(--pf-text)]">{t("platform.announcements.title")}</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[color:var(--pf-muted)]">{t("platform.announcements.note")}</p>
        </div>
        <button type="button" onClick={() => setDialog({ kind: "create" })} className={backofficeSmallButtonClass}>
          <Plus aria-hidden className="h-4 w-4" />
          {t("platform.announcements.create")}
        </button>
      </header>

      {notice ? (
        <div role="status" className="mx-4 mt-3 rounded border border-[color:var(--pf-border)] bg-white/[0.03] px-4 py-2.5 text-[12px] text-[color:var(--pf-text)]">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="mx-4 mt-3 rounded border border-[#e66767]/40 bg-[#e66767]/10 px-4 py-2.5 text-[12px] text-[color:var(--pf-text)]">
          {error}
        </div>
      ) : null}

      {items === null ? (
        error ? null : <p className="py-16 text-center text-[13px] text-[color:var(--pf-muted)]">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-[color:var(--pf-muted)]">{t("platform.announcements.empty")}</p>
      ) : (
        GROUPS.map((status) => {
          const group = items.filter((announcement) => announcement.status === status);
          if (group.length === 0) return null;
          return (
            <div key={status} className="mt-2">
              <h3 className="px-4 pt-2 pb-1 text-[11px] font-medium uppercase tracking-[0.5px] text-[color:var(--pf-muted)]">
                {t(`platform.announcements.groups.${status}`)} · {group.length}
              </h3>
              <ul className={status === "ended" ? "opacity-70" : undefined}>{group.map(item)}</ul>
            </div>
          );
        })
      )}

      {dialog?.kind === "create" || dialog?.kind === "edit" ? (
        <AnnouncementFormDialog
          announcement={dialog.kind === "edit" ? dialog.announcement : undefined}
          onClose={close}
          onSaved={() => {
            setNotice(t(dialog.kind === "edit" ? "platform.announcements.updatedNotice" : "platform.announcements.createdNotice"));
            setDialog(null);
            void load();
          }}
        />
      ) : null}
      {dialog?.kind === "end" || dialog?.kind === "delete" ? (
        <BackofficeDialog
          title={t(dialog.kind === "end" ? "platform.announcements.endTitle" : "platform.announcements.deleteTitle")}
          onClose={close}
        >
          <div className="space-y-4 p-4">
            <p className="text-[13px] leading-5 text-[color:var(--pf-text-2)]">
              {t(dialog.kind === "end" ? "platform.announcements.endBody" : "platform.announcements.deleteBody")}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={close} className={`${backofficeSecondaryButtonClass} flex-1`}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirm(dialog.kind as "end" | "delete", dialog.announcement)}
                className={`${backofficePrimaryButtonClass} flex-1 ${dialog.kind === "delete" ? "bg-[#e66767] text-white" : ""}`}
              >
                {t(dialog.kind === "end" ? "platform.announcements.end" : "platform.announcements.delete")}
              </button>
            </div>
          </div>
        </BackofficeDialog>
      ) : null}
    </section>
  );
}
