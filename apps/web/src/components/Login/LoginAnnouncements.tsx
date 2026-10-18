import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AnnouncementContent,
  announcementStripClass,
  isAnnouncementLive,
} from "@/components/layout/AnnouncementBanner";
import type { Announcement } from "@/types/announcement";

/**
 * Active platform announcements for the organization, above the sign-in form
 * (e.g. a maintenance window). Not dismissible here; a failed request shows
 * nothing.
 */
export function LoginAnnouncements({ orgSlug }: { orgSlug: string }): React.JSX.Element | null {
  const { t } = useTranslation();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => window.api.getPublicAnnouncements(orgSlug))
      .then((items) => {
        if (active) setAnnouncements(items);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [orgSlug]);

  const visible = announcements.filter((announcement) => isAnnouncementLive(announcement));
  if (visible.length === 0) return null;

  return (
    <div role="region" aria-label={t("announcements.region")} className="mb-5 space-y-2">
      {visible.map((announcement) => (
        <div
          key={announcement.id}
          role={announcement.severity === "info" ? "status" : "alert"}
          className={`flex items-start gap-2 rounded-md px-3 py-2.5 text-[12px] leading-5 ${announcementStripClass(announcement.severity)}`}
        >
          <AnnouncementContent announcement={announcement} />
        </div>
      ))}
    </div>
  );
}
