import { useTranslation } from "react-i18next";
import { UserRoundCog } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { activeOrganizationSlug } from "@/lib/session";

/**
 * Full-width strip across the top of the app while a Backoffice superadmin is
 * signed in as an organization user. "Stop" signs that session out and goes
 * back to the Backoffice (see App's logout handler).
 */
export function ImpersonationBanner(): React.JSX.Element | null {
  const { t } = useTranslation();
  const { currentUser, onLogout } = useAuth();
  if (!currentUser.impersonatedBy) return null;

  // The slug, not the firm name: that is a setting and falls back to a coded
  // default, so it can name the wrong shop.
  const org = activeOrganizationSlug() ?? "—";
  const role = currentUser.role === "admin" ? t("shell.administrator") : t("shell.operator");

  return (
    <div
      role="status"
      className="relative z-[60] flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 bg-amber-500 px-4 py-2 text-[13px] text-amber-950"
    >
      <UserRoundCog aria-hidden className="h-4 w-4 shrink-0" />
      <span className="font-semibold uppercase tracking-[0.5px] text-[11px]">{t("impersonation.label")}</span>
      <span className="min-w-0">
        {t("impersonation.message", { username: currentUser.username, role, org })}
        <span className="text-amber-900/80"> · {t("impersonation.by", { admin: currentUser.impersonatedBy })}</span>
      </span>
      <button
        type="button"
        onClick={onLogout}
        className="iris-focusable ml-auto h-8 shrink-0 rounded-md bg-amber-950 px-3 text-[12px] font-medium text-amber-50 hover:bg-amber-900"
      >
        {t("impersonation.stop")}
      </button>
    </div>
  );
}
