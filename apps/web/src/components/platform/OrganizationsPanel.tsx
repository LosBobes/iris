import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import type { PlatformTenant } from "@/types/platform";
import { formatCount, formatDate, formatDateTime } from "./format";
import {
  BackofficeDialog,
  backofficeError,
  backofficePrimaryButtonClass,
  backofficeSecondaryButtonClass,
  backofficeSmallButtonClass,
} from "./BackofficeDialog";
import { OrganizationFormDialog } from "./OrganizationFormDialog";
import { OrganizationUsersDialog } from "./OrganizationUsersDialog";

type OpenDialog =
  | { kind: "create" }
  | { kind: "edit"; tenant: PlatformTenant }
  | { kind: "users"; tenant: PlatformTenant }
  | { kind: "suspend"; tenant: PlatformTenant };

/**
 * The Backoffice's organization management: create, edit, suspend or
 * reactivate an organization, and reach its users (impersonate, new
 * password). Every operation lands in the activity log.
 */
export function OrganizationsPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [tenants, setTenants] = useState<PlatformTenant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      setTenants(await window.api.getPlatformTenants());
      setError(null);
    } catch (cause) {
      setError(backofficeError(cause, t("platform.loadError")));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const close = useCallback(() => setDialog(null), []);

  const toggleSuspended = async (tenant: PlatformTenant): Promise<void> => {
    const suspend = !tenant.suspendedAt;
    setBusy(true);
    try {
      await window.api.setPlatformTenantSuspended(tenant.slug, suspend);
      setNotice(t(suspend ? "platform.orgs.suspendedNotice" : "platform.orgs.reactivatedNotice", { name: tenant.name }));
      setDialog(null);
      await load();
    } catch (cause) {
      setError(backofficeError(cause, t("platform.orgs.failed")));
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="min-w-0 rounded-lg border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)]">
      <header className="flex items-center justify-between gap-3 border-b border-[color:var(--pf-border)] px-4 py-3">
        <h2 className="text-[14px] font-medium text-[color:var(--pf-text)]">{t("platform.orgs.title")}</h2>
        <button type="button" onClick={() => setDialog({ kind: "create" })} className={backofficeSmallButtonClass}>
          <Plus className="h-4 w-4" />
          {t("platform.orgs.create")}
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

      {tenants === null ? (
        error ? null : <p className="py-16 text-center text-[13px] text-[color:var(--pf-muted)]">{t("common.loading")}</p>
      ) : tenants.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-[color:var(--pf-muted)]">{t("platform.orgs.empty")}</p>
      ) : (
        <div className="mt-1 overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead className="text-left text-[12px] text-[color:var(--pf-muted)]">
              <tr>
                <th className="px-4 py-2.5 font-normal">{t("platform.orgs.name")}</th>
                <th className="px-3 py-2.5 text-right font-normal">{t("platform.orgs.users")}</th>
                <th className="px-3 py-2.5 font-normal">{t("platform.orgs.created")}</th>
                <th className="px-3 py-2.5 font-normal">{t("platform.orgs.status")}</th>
                <th className="px-4 py-2.5 text-right font-normal">
                  <span className="sr-only">{t("platform.orgs.actionsLabel")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="h-14 border-t border-[color:var(--pf-border)] hover:bg-white/[0.02]">
                  <td className="px-4 py-2">
                    <div className="text-[color:var(--pf-text)]">{tenant.name}</div>
                    <div className="text-[11px] text-[color:var(--pf-muted)]">/login/{tenant.slug}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCount(tenant.users)}
                    <span className="text-[color:var(--pf-muted)]"> / {formatCount(tenant.admins)}</span>
                  </td>
                  <td className="px-3 py-2 text-[color:var(--pf-text-2)]">{formatDate(tenant.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {tenant.suspendedAt ? (
                      <span className="inline-flex items-center gap-1.5 text-[#e66767]">
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#e66767]" />
                        {t("platform.orgs.suspendedSince", { date: formatDateTime(tenant.suspendedAt) })}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[color:var(--pf-text-2)]">
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#5fb88a]" />
                        {t("platform.orgs.active")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => setDialog({ kind: "users", tenant })} className={backofficeSmallButtonClass}>
                        {t("platform.orgs.manageUsers")}
                      </button>
                      <button type="button" onClick={() => setDialog({ kind: "edit", tenant })} className={backofficeSmallButtonClass}>
                        {t("platform.orgs.edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDialog({ kind: "suspend", tenant })}
                        className={`${backofficeSmallButtonClass} ${tenant.suspendedAt ? "" : "text-[#e66767]"}`}
                      >
                        {tenant.suspendedAt ? t("platform.orgs.reactivate") : t("platform.orgs.suspend")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === "create" || dialog?.kind === "edit" ? (
        <OrganizationFormDialog
          tenant={dialog.kind === "edit" ? dialog.tenant : undefined}
          onClose={close}
          onSaved={(saved) => {
            setNotice(t(dialog.kind === "edit" ? "platform.orgs.updatedNotice" : "platform.orgs.createdNotice", { name: saved.name }));
            setDialog(null);
            void load();
          }}
        />
      ) : null}
      {dialog?.kind === "users" ? <OrganizationUsersDialog tenant={dialog.tenant} onClose={close} /> : null}
      {dialog?.kind === "suspend" ? (
        <BackofficeDialog
          title={t(dialog.tenant.suspendedAt ? "platform.orgs.reactivateTitle" : "platform.orgs.suspendTitle", { name: dialog.tenant.name })}
          onClose={close}
        >
          <div className="space-y-4 p-4">
            <p className="text-[13px] leading-5 text-[color:var(--pf-text-2)]">
              {t(dialog.tenant.suspendedAt ? "platform.orgs.reactivateBody" : "platform.orgs.suspendBody")}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={close} className={`${backofficeSecondaryButtonClass} flex-1`}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggleSuspended(dialog.tenant)}
                className={`${backofficePrimaryButtonClass} flex-1 ${dialog.tenant.suspendedAt ? "" : "bg-[#e66767] text-white"}`}
              >
                {dialog.tenant.suspendedAt ? t("platform.orgs.reactivate") : t("platform.orgs.suspend")}
              </button>
            </div>
          </div>
        </BackofficeDialog>
      ) : null}
    </section>
  );
}
