import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Info, TriangleAlert, Wrench, X } from "lucide-react";
import { useAnnouncements } from "@/hooks/useAnnouncements";
import { dismissAnnouncement, readDismissedAnnouncements } from "@/lib/announcement-dismissals";
import { formatDateTime } from "@/components/platform/format";
import type { Announcement, AnnouncementSeverity } from "@/types/announcement";

const SEVERITY_STYLE: Record<AnnouncementSeverity, { strip: string; button: string; Icon: typeof Info }> = {
  info: { strip: "bg-sky-700 text-white", button: "text-white/80 hover:bg-white/15 hover:text-white", Icon: Info },
  warning: {
    strip: "bg-yellow-300 text-yellow-950",
    button: "text-yellow-950/80 hover:bg-black/10 hover:text-yellow-950",
    Icon: TriangleAlert,
  },
  maintenance: { strip: "bg-red-700 text-white", button: "text-white/80 hover:bg-white/15 hover:text-white", Icon: Wrench },
};

/** Whether the announcement's window includes now (the list may be minutes old). */
export function isAnnouncementLive(announcement: Announcement, now = Date.now()): boolean {
  return (
    Date.parse(announcement.startsAt) <= now &&
    (announcement.endsAt === null || Date.parse(announcement.endsAt) > now)
  );
}

/** One announcement's icon, label, message and end time. */
export function AnnouncementContent({ announcement }: { announcement: Announcement }): React.JSX.Element {
  const { t } = useTranslation();
  const { Icon } = SEVERITY_STYLE[announcement.severity];
  const until = formatDateTime(announcement.endsAt);
  return (
    <>
      <Icon aria-hidden className="h-4 w-4 shrink-0" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.5px]">
        {t(`announcements.severity.${announcement.severity}`)}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-line break-words">
        {announcement.message}
        {until ? <span className="opacity-80"> · {t("announcements.until", { time: until })}</span> : null}
      </span>
    </>
  );
}

export function announcementStripClass(severity: AnnouncementSeverity): string {
  return SEVERITY_STYLE[severity].strip;
}

/**
 * Platform announcements as full-width strips across the top of the app,
 * under the impersonation banner when both show. Info ones can be dismissed
 * (remembered on this device); warning and maintenance ones stay until they
 * end.
 */
export function AnnouncementBanner(): React.JSX.Element | null {
  const { t } = useTranslation();
  const announcements = useAnnouncements();
  const [dismissed, setDismissed] = useState<string[]>(readDismissedAnnouncements);

  const visible = announcements.filter(
    (announcement) =>
      isAnnouncementLive(announcement) && !(announcement.severity === "info" && dismissed.includes(announcement.id)),
  );
  if (visible.length === 0) return null;

  return (
    <div className="relative z-[60] shrink-0" aria-label={t("announcements.region")} role="region">
      {visible.map((announcement) => {
        const style = SEVERITY_STYLE[announcement.severity];
        return (
          <div
            key={announcement.id}
            role={announcement.severity === "info" ? "status" : "alert"}
            data-severity={announcement.severity}
            className={`flex items-center gap-x-3 gap-y-1.5 px-4 py-2 text-[13px] ${style.strip}`}
          >
            <AnnouncementContent announcement={announcement} />
            {announcement.severity === "info" ? (
              <button
                type="button"
                onClick={() => setDismissed(dismissAnnouncement(announcement.id))}
                aria-label={t("announcements.dismiss")}
                title={t("announcements.dismiss")}
                className={`iris-focusable -my-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${style.button}`}
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
