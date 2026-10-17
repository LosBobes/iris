import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, LogIn } from "lucide-react";
import { rememberOrganizationSlug } from "@/lib/session";
import { isPasswordTooLong } from "@/lib/password";
import type { PlatformTenantUsers } from "@/types/platform";
import {
  BackofficeDialog,
  backofficeError,
  backofficeInputClass,
  backofficeSmallButtonClass,
} from "./BackofficeDialog";

// Mirrors the API's minimum for organization user passwords.
const MIN_USER_PASSWORD_LENGTH = 6;

/**
 * An organization's accounts, each with two Backoffice operations:
 * - "Uđi" opens an organization session as that user. The API replaces this
 *   browser's iris_session cookie, so the app reloads at "/" to boot into it
 *   (with the impersonation banner).
 * - "Nova lozinka" sets a new password and signs the user out everywhere.
 */
export function OrganizationUsersDialog({
  tenant,
  onClose,
}: {
  tenant: { slug: string; name: string };
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [data, setData] = useState<PlatformTenantUsers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [resetting, setResetting] = useState<{ id: string; password: string; error: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    window.api
      .getPlatformTenantUsers(tenant.slug)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (active) setError(backofficeError(cause, t("platform.loadError")));
      });
    return () => {
      active = false;
    };
  }, [tenant.slug, t]);

  const impersonate = async (userId: string): Promise<void> => {
    setPendingId(userId);
    setError(null);
    try {
      const result = await window.api.platformImpersonate(tenant.slug, userId);
      if (!result.success) throw new Error(t("platform.impersonate.error"));
      rememberOrganizationSlug(result.orgSlug ?? tenant.slug);
      window.location.assign("/");
    } catch (cause) {
      setError(backofficeError(cause, t("platform.impersonate.error")));
      setPendingId(null);
    }
  };

  const resetPassword = async (userId: string, username: string, password: string): Promise<void> => {
    if (password.trim().length < MIN_USER_PASSWORD_LENGTH) {
      setResetting({ id: userId, password, error: t("platform.orgs.errors.passwordShort") });
      return;
    }
    if (isPasswordTooLong(password)) {
      setResetting({ id: userId, password, error: t("platform.orgs.errors.passwordLong") });
      return;
    }
    setPendingId(userId);
    try {
      await window.api.resetPlatformUserPassword(tenant.slug, userId, password);
      setResetting(null);
      setNotice(t("platform.impersonate.resetDone", { username }));
    } catch (cause) {
      setResetting({ id: userId, password, error: backofficeError(cause, t("platform.orgs.failed")) });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <BackofficeDialog
      title={t("platform.impersonate.title")}
      description={t("platform.impersonate.description", { name: tenant.name })}
      onClose={onClose}
    >
      {error ? (
        <div role="alert" className="mx-4 mt-3 rounded border border-[#e66767]/40 bg-[#e66767]/10 px-3 py-2 text-[12px]">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="mx-4 mt-3 rounded border border-[color:var(--pf-border)] bg-white/[0.03] px-3 py-2 text-[12px]">
          {notice}
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
            {data.users.map((user) => {
              const editing = resetting?.id === user.id ? resetting : null;
              return (
                <li key={user.id} className="rounded-md px-2 py-1.5 hover:bg-white/[0.03]">
                  <div className="flex min-h-11 flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px]">{user.username}</div>
                      <div className="text-[11px] text-[color:var(--pf-muted)]">
                        {user.role === "admin" ? t("platform.impersonate.admin") : t("platform.impersonate.operator")}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={pendingId !== null}
                      aria-expanded={Boolean(editing)}
                      onClick={() => {
                        setNotice(null);
                        setResetting(editing ? null : { id: user.id, password: "", error: null });
                      }}
                      className={backofficeSmallButtonClass}
                    >
                      <KeyRound className="h-4 w-4" />
                      {t("platform.impersonate.resetPassword")}
                    </button>
                    <button
                      type="button"
                      disabled={pendingId !== null}
                      onClick={() => void impersonate(user.id)}
                      className={backofficeSmallButtonClass}
                    >
                      <LogIn className="h-4 w-4" />
                      {t("platform.impersonate.start")}
                    </button>
                  </div>
                  {editing ? (
                    <form
                      noValidate
                      className="mt-2 pb-1"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void resetPassword(user.id, user.username, editing.password);
                      }}
                    >
                      <label htmlFor={`reset-${user.id}`} className="mb-1.5 block text-[12px] text-[color:var(--pf-text-2)]">
                        {t("platform.impersonate.newPassword", { username: user.username })}
                      </label>
                      <div className="flex gap-2">
                        <input
                          id={`reset-${user.id}`}
                          type="password"
                          autoComplete="new-password"
                          autoFocus
                          value={editing.password}
                          onChange={(event) => setResetting({ ...editing, password: event.target.value, error: null })}
                          className={backofficeInputClass}
                        />
                        <button type="submit" disabled={pendingId !== null} className={`${backofficeSmallButtonClass} h-11`}>
                          {t("platform.impersonate.resetSubmit")}
                        </button>
                      </div>
                      {editing.error ? <p className="mt-1.5 text-[12px] text-[#e66767]">{editing.error}</p> : null}
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </BackofficeDialog>
  );
}
