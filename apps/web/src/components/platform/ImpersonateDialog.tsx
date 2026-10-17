import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LogIn, X } from "lucide-react";
import { rememberOrganizationSlug } from "@/lib/session";
import type { PlatformTenantUsers } from "@/types/platform";

/**
 * Picks an account of one organization and opens an organization session as
 * it. The API replaces this browser's iris_session cookie, so the app is
 * reloaded at "/" to boot into that session (with the impersonation banner).
 */
export function ImpersonateDialog({
  tenant,
  onClose,
}: {
  tenant: { slug: string; name: string };
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [data, setData] = useState<PlatformTenantUsers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    window.api
      .getPlatformTenantUsers(tenant.slug)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error && cause.message ? cause.message : t("platform.loadError"));
      });
    return () => {
      active = false;
    };
  }, [tenant.slug, t]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const start = async (userId: string): Promise<void> => {
    setPendingId(userId);
    setError(null);
    try {
      const result = await window.api.platformImpersonate(tenant.slug, userId);
      if (!result.success) throw new Error(t("platform.impersonate.error"));
      rememberOrganizationSlug(result.orgSlug ?? tenant.slug);
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : t("platform.impersonate.error"));
      setPendingId(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("platform.impersonate.title")}
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[440px] rounded-lg border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)] shadow-2xl">
        <header className="flex items-start gap-3 border-b border-[color:var(--pf-border)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-medium text-[color:var(--pf-text)]">{t("platform.impersonate.title")}</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--pf-text-2)]">
              {t("platform.impersonate.description", { name: tenant.name })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("platform.impersonate.close")}
            className="iris-focusable flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[color:var(--pf-text-2)] hover:bg-white/5 hover:text-[color:var(--pf-text)]"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </header>

        {error ? (
          <div role="alert" className="mx-4 mt-3 rounded border border-[#e66767]/40 bg-[#e66767]/10 px-3 py-2 text-[12px] text-[color:var(--pf-text)]">
            {error}
          </div>
        ) : null}

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!data ? (
            error ? null : (
              <p className="px-2 py-6 text-center text-[13px] text-[color:var(--pf-muted)]">{t("common.loading")}</p>
            )
          ) : data.users.length === 0 ? (
            <p className="px-2 py-6 text-center text-[13px] text-[color:var(--pf-muted)]">{t("platform.impersonate.empty")}</p>
          ) : (
            <ul>
              {data.users.map((user) => (
                <li key={user.id} className="flex min-h-12 items-center gap-3 rounded-md px-2 hover:bg-white/[0.03]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] text-[color:var(--pf-text)]">{user.username}</div>
                    <div className="text-[11px] text-[color:var(--pf-muted)]">
                      {user.role === "admin" ? t("platform.impersonate.admin") : t("platform.impersonate.operator")}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={pendingId !== null}
                    onClick={() => void start(user.id)}
                    className="iris-focusable flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--pf-border)] px-3 text-[13px] text-[color:var(--pf-text)] hover:bg-white/5 disabled:opacity-60"
                  >
                    <LogIn className="h-4 w-4" />
                    {t("platform.impersonate.start")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
