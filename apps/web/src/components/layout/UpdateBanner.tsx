import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { useAvailableUpdate } from "@/lib/app-update";
import { formatVersion } from "@/lib/app-version";

/**
 * A strip across the top of the app once a newer build is deployed, with a
 * reload button. It never reloads by itself: the user may be mid-form.
 */
export function UpdateBanner({
  version: forcedVersion,
}: {
  /** Test hook: show the banner for this version without checking. */
  version?: string;
} = {}): React.JSX.Element | null {
  const { t } = useTranslation();
  const checked = useAvailableUpdate({ enabled: forcedVersion === undefined ? undefined : false });
  const version = forcedVersion ?? checked;
  if (!version) return null;

  return (
    <div
      role="status"
      className="relative z-[60] flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 bg-emerald-700 px-4 py-2 text-[13px] text-white"
    >
      <RefreshCw aria-hidden className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        {t("appUpdate.available", { version: formatVersion(version) })}
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="iris-focusable iris-press rounded-md bg-white px-3 py-1 text-[12px] font-medium text-emerald-800 hover:bg-white/90"
      >
        {t("appUpdate.reload")}
      </button>
    </div>
  );
}
