import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Ban, Plus, RotateCcw } from "lucide-react";
import { staggerStyle } from "@/lib/motion";
import { MAX_PASSWORD_BYTES, isPasswordTooLong } from "@/lib/password";
import type { PlatformAdminSummary } from "@/types/platform";
import { formatDate, formatDateTime } from "./format";
import { MIN_PLATFORM_PASSWORD_LENGTH } from "./PlatformChangePassword";
import {
  BackofficeDialog,
  backofficeError,
  backofficeInputClass,
  backofficePrimaryButtonClass,
  backofficeSecondaryButtonClass,
  backofficeSmallButtonClass,
} from "./BackofficeDialog";

const ghostButtonBase = "iris-focusable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] hover:bg-white/5";

const createSchema = z.object({
  username: z.string().trim().min(1, "platform.admins.errors.usernameRequired").max(64, "platform.admins.errors.usernameRequired"),
  password: z
    .string()
    .min(MIN_PLATFORM_PASSWORD_LENGTH, "platform.admins.errors.passwordShort")
    .refine((value) => !isPasswordTooLong(value), "platform.admins.errors.passwordLong"),
});
type CreateForm = z.infer<typeof createSchema>;

function CreateAdminDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (admin: PlatformAdminSummary) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateForm>({ resolver: zodResolver(createSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      onCreated(await window.api.createPlatformAdmin({ username: values.username, password: values.password }));
    } catch (cause) {
      setServerError(backofficeError(cause, t("platform.admins.failed")));
    }
  });

  const messageParams = { min: MIN_PLATFORM_PASSWORD_LENGTH, max: MAX_PASSWORD_BYTES };
  return (
    <BackofficeDialog title={t("platform.admins.createTitle")} description={t("platform.admins.createIntro")} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4 p-4">
        <div>
          <label htmlFor="admin-username" className="mb-1.5 block text-[13px] text-[color:var(--pf-text-2)]">
            {t("platform.admins.username")}
          </label>
          <input id="admin-username" autoComplete="off" autoCapitalize="none" spellCheck={false} {...register("username")} className={backofficeInputClass} />
          {errors.username?.message ? <p className="mt-1.5 text-[12px] text-[#e66767]">{t(errors.username.message)}</p> : null}
        </div>
        <div>
          <label htmlFor="admin-password" className="mb-1.5 block text-[13px] text-[color:var(--pf-text-2)]">
            {t("platform.admins.password")}
          </label>
          <input id="admin-password" type="password" autoComplete="new-password" {...register("password")} className={backofficeInputClass} />
          {errors.password?.message ? (
            <p className="mt-1.5 text-[12px] text-[#e66767]">{t(errors.password.message, messageParams)}</p>
          ) : null}
        </div>
        {serverError ? (
          <p role="alert" className="rounded-md border border-[#e66767]/40 bg-[#e66767]/10 px-3 py-2.5 text-[13px] leading-5">
            {serverError}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={`${backofficeSecondaryButtonClass} flex-1`}>
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={isSubmitting} className={`${backofficePrimaryButtonClass} flex-1`}>
            {isSubmitting ? t("common.loading") : t("platform.admins.createSubmit")}
          </button>
        </div>
      </form>
    </BackofficeDialog>
  );
}

type OpenDialog = { kind: "create" } | { kind: "toggle"; admin: PlatformAdminSummary };

/**
 * Backoffice superadmin accounts: who they are, when they last signed in,
 * whether two-factor sign-in is on, and whether they are disabled. Adds new
 * ones (temporary password) and disables or re-enables others; you cannot
 * disable yourself, and the API also keeps one enabled account. Audited.
 */
export function PlatformAdminsPanel({ currentUsername }: { currentUsername: string }): React.JSX.Element {
  const { t } = useTranslation();
  const [admins, setAdmins] = useState<PlatformAdminSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      setAdmins(await window.api.getPlatformAdmins());
      setError(null);
    } catch (cause) {
      setError(backofficeError(cause, t("platform.loadError")));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const close = useCallback(() => setDialog(null), []);

  const toggle = async (admin: PlatformAdminSummary): Promise<void> => {
    const disable = !admin.disabledAt;
    setBusy(true);
    try {
      await window.api.setPlatformAdminDisabled(admin.id, disable);
      setNotice(t(disable ? "platform.admins.disabledNotice" : "platform.admins.enabledNotice", { username: admin.username }));
      await load();
    } catch (cause) {
      setError(backofficeError(cause, t("platform.admins.failed")));
    } finally {
      setBusy(false);
      setDialog(null);
    }
  };

  const isSelf = (admin: PlatformAdminSummary): boolean => admin.username.toLowerCase() === currentUsername.toLowerCase();

  return (
    <section className="min-w-0 rounded-lg border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)]">
      <header className="flex items-start justify-between gap-3 border-b border-[color:var(--pf-border)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-medium text-[color:var(--pf-text)]">{t("platform.admins.title")}</h2>
          <p className="mt-0.5 text-[12px] text-[color:var(--pf-muted)]">{t("platform.admins.note")}</p>
        </div>
        <button type="button" onClick={() => setDialog({ kind: "create" })} className={backofficeSmallButtonClass}>
          <Plus className="h-4 w-4" />
          {t("platform.admins.create")}
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

      {admins === null ? (
        error ? null : <p className="py-16 text-center text-[13px] text-[color:var(--pf-muted)]">{t("common.loading")}</p>
      ) : admins.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-[color:var(--pf-muted)]">{t("platform.admins.empty")}</p>
      ) : (
        <div className="relative mt-1 overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className="text-left text-[12px] text-[color:var(--pf-muted)]">
              <tr>
                <th className="px-4 py-2.5 font-normal">{t("platform.admins.username")}</th>
                <th className="px-3 py-2.5 font-normal">{t("platform.admins.created")}</th>
                <th className="px-3 py-2.5 font-normal">{t("platform.admins.lastLogin")}</th>
                <th className="px-3 py-2.5 font-normal">{t("platform.admins.twoFactor")}</th>
                <th className="px-3 py-2.5 font-normal">{t("platform.admins.status")}</th>
                <th className="px-4 py-2.5 text-right font-normal">
                  <span className="sr-only">{t("platform.admins.actionsLabel")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin, index) => (
                <tr
                  key={admin.id}
                  style={staggerStyle(index)}
                  className="animate-iris-rise iris-stagger iris-row h-14 border-t border-[color:var(--pf-border)] hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-2">
                    <div className="text-[color:var(--pf-text)]">
                      {admin.username}
                      {isSelf(admin) ? <span className="ml-1.5 text-[11px] text-[color:var(--pf-muted)]">({t("platform.admins.you")})</span> : null}
                    </div>
                    {admin.mustChangePassword ? (
                      <div className="text-[11px] text-[#f2b544]">{t("platform.admins.mustChange")}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-[color:var(--pf-text-2)]">{formatDate(admin.createdAt)}</td>
                  <td className="px-3 py-2 text-[color:var(--pf-text-2)]">
                    {formatDateTime(admin.lastLoginAt) ?? t("platform.admins.never")}
                  </td>
                  <td className="px-3 py-2">
                    <span className={admin.twoFactorEnabled ? "text-[#5fb88a]" : "text-[color:var(--pf-muted)]"}>
                      {admin.twoFactorEnabled ? t("platform.admins.twoFactorOn") : t("platform.admins.twoFactorOff")}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {admin.disabledAt ? (
                      <span className="text-[#e66767]">
                        {t("platform.admins.disabledSince", { date: formatDateTime(admin.disabledAt) })}
                      </span>
                    ) : (
                      <span className="text-[color:var(--pf-text-2)]">{t("platform.admins.active")}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {isSelf(admin) ? null : (
                      <button
                        type="button"
                        onClick={() => setDialog({ kind: "toggle", admin })}
                        aria-label={`${admin.disabledAt ? t("platform.admins.enable") : t("platform.admins.disable")} ${admin.username}`}
                        className={
                          admin.disabledAt
                            ? `${ghostButtonBase} text-[color:var(--pf-text-2)] hover:text-[color:var(--pf-text)]`
                            : `${ghostButtonBase} text-[#e66767]`
                        }
                      >
                        {admin.disabledAt ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                        {admin.disabledAt ? t("platform.admins.enable") : t("platform.admins.disable")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === "create" ? (
        <CreateAdminDialog
          onClose={close}
          onCreated={(created) => {
            setNotice(t("platform.admins.createdNotice", { username: created.username }));
            setDialog(null);
            void load();
          }}
        />
      ) : null}
      {dialog?.kind === "toggle" ? (
        <BackofficeDialog
          title={t(dialog.admin.disabledAt ? "platform.admins.enableTitle" : "platform.admins.disableTitle", { username: dialog.admin.username })}
          onClose={close}
        >
          <div className="space-y-4 p-4">
            <p className="text-[13px] leading-5 text-[color:var(--pf-text-2)]">
              {t(dialog.admin.disabledAt ? "platform.admins.enableBody" : "platform.admins.disableBody")}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={close} className={`${backofficeSecondaryButtonClass} flex-1`}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggle(dialog.admin)}
                className={`${backofficePrimaryButtonClass} flex-1 ${dialog.admin.disabledAt ? "" : "bg-[#e66767] text-white"}`}
              >
                {dialog.admin.disabledAt ? t("platform.admins.enable") : t("platform.admins.disable")}
              </button>
            </div>
          </div>
        </BackofficeDialog>
      ) : null}
    </section>
  );
}
