import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, Blocks, Download, Pencil, Plus, RotateCcw, Trash2, Users, Workflow } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { staggerStyle } from "@/lib/motion";
import type { PlatformTenant } from "@/types/platform";
import { formatCount, formatDate, formatDateTime } from "./format";
import {
  BackofficeDialog,
  backofficeError,
  backofficePrimaryButtonClass,
  backofficeSecondaryButtonClass,
  backofficeSmallButtonClass,
} from "./BackofficeDialog";
import { OrganizationDeleteDialog } from "./OrganizationDeleteDialog";
import { downloadTenantExport } from "./tenant-export";
import { OrganizationFormDialog } from "./OrganizationFormDialog";
import { OrganizationModulesDialog } from "./OrganizationModulesDialog";
import { OrganizationProcessesDialog } from "./OrganizationProcessesDialog";
import { OrganizationUsersDialog } from "./OrganizationUsersDialog";

const ghostButtonBase = "iris-focusable flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] hover:bg-white/5";
const ghostButtonClass = `${ghostButtonBase} text-[color:var(--pf-text-2)] hover:text-[color:var(--pf-text)]`;

type OpenDialog =
  | { kind: "create" }
  | { kind: "edit"; tenant: PlatformTenant }
  | { kind: "users"; tenant: PlatformTenant }
  | { kind: "processes"; tenant: PlatformTenant }
  | { kind: "modules"; tenant: PlatformTenant }
  | { kind: "suspend"; tenant: PlatformTenant }
  | { kind: "delete"; tenant: PlatformTenant };

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
  // From tablet width up the organizations are a table; on a phone each is a
  // card, so the name and actions are visible without scrolling sideways.
  const isWide = useMediaQuery("(min-width: 768px)");

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

  const exportTenant = async (tenant: PlatformTenant): Promise<void> => {
    setBusy(true);
    try {
      await downloadTenantExport(tenant.slug);
      setError(null);
      setNotice(t("platform.orgs.exportedNotice", { name: tenant.name }));
    } catch (cause) {
      setError(backofficeError(cause, t("platform.orgs.exportFailed")));
    } finally {
      setBusy(false);
    }
  };

  const status = (tenant: PlatformTenant): React.JSX.Element =>
    tenant.suspendedAt ? (
      <span className="inline-flex items-center gap-1.5 text-[#e66767]">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#e66767]" />
        {t("platform.orgs.suspendedSince", { date: formatDateTime(tenant.suspendedAt) })}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-[color:var(--pf-text-2)]">
        <span aria-hidden className="relative flex h-1.5 w-1.5">
          <span className="iris-dot-ping absolute inset-0 rounded-full bg-[#5fb88a]" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-[#5fb88a]" />
        </span>
        {t("platform.orgs.active")}
      </span>
    );

  // Compact "which modules are on" badges (off ones are simply absent).
  const moduleBadges = (tenant: PlatformTenant): React.JSX.Element => {
    const on = [
      tenant.modules.stock ? t("platform.orgs.modules.stock") : null,
      tenant.modules.stock && tenant.modules.processes ? t("platform.orgs.modules.processes") : null,
    ].filter((label): label is string => label !== null);
    return on.length === 0 ? (
      <span data-testid="module-badges" className="text-[11px] text-[color:var(--pf-muted)]">
        {t("platform.orgs.modules.none")}
      </span>
    ) : (
      <span data-testid="module-badges" className="flex flex-wrap gap-1">
        {on.map((label) => (
          <span key={label} className="rounded border border-[color:var(--pf-border)] px-1.5 py-0.5 text-[11px] text-[color:var(--pf-text-2)]">
            {label}
          </span>
        ))}
      </span>
    );
  };

  // The actions fall into two groups: the three ways into an organization
  // (users, processes, modules) get equal weight; editing and suspending are
  // housekeeping, set apart and quieter, with suspend in the danger colour.
  const openActions: { kind: "users" | "processes" | "modules"; label: string; icon: React.JSX.Element }[] = [
    { kind: "users", label: t("platform.orgs.manageUsers"), icon: <Users className="h-4 w-4" /> },
    { kind: "processes", label: t("platform.orgs.processes"), icon: <Workflow className="h-4 w-4" /> },
    { kind: "modules", label: t("platform.orgs.modules.button"), icon: <Blocks className="h-4 w-4" /> },
  ];

  const editButton = (tenant: PlatformTenant): React.JSX.Element => (
    <button type="button" onClick={() => setDialog({ kind: "edit", tenant })} className={ghostButtonClass}>
      <Pencil className="h-3.5 w-3.5" />
      {t("platform.orgs.edit")}
    </button>
  );

  const suspendButton = (tenant: PlatformTenant): React.JSX.Element => (
    <button
      type="button"
      onClick={() => setDialog({ kind: "suspend", tenant })}
      className={tenant.suspendedAt ? ghostButtonClass : `${ghostButtonBase} text-[#e66767]`}
    >
      {tenant.suspendedAt ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
      {tenant.suspendedAt ? t("platform.orgs.reactivate") : t("platform.orgs.suspend")}
    </button>
  );

  const exportButton = (tenant: PlatformTenant): React.JSX.Element => (
    <button type="button" disabled={busy} onClick={() => void exportTenant(tenant)} className={`${ghostButtonClass} disabled:opacity-60`}>
      <Download className="h-3.5 w-3.5" />
      {t("platform.orgs.exportData")}
    </button>
  );

  // Deleting is only offered once the organization is suspended.
  const deleteButton = (tenant: PlatformTenant): React.JSX.Element => (
    <button
      type="button"
      disabled={!tenant.suspendedAt}
      title={tenant.suspendedAt ? undefined : t("platform.orgs.deleteNeedsSuspend")}
      onClick={() => setDialog({ kind: "delete", tenant })}
      className={`${ghostButtonBase} text-[#e66767] disabled:opacity-40 disabled:hover:bg-transparent`}
    >
      <Trash2 className="h-3.5 w-3.5" />
      {t("platform.orgs.deleteOrg")}
    </button>
  );

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
      ) : !isWide ? (
        <ul className="mt-1">
          {tenants.map((tenant, index) => (
            <li key={tenant.id} style={staggerStyle(index)} className="animate-iris-rise iris-stagger space-y-2.5 border-t border-[color:var(--pf-border)] px-4 py-3 first:border-t-0 text-[13px]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[14px] text-[color:var(--pf-text)]">{tenant.name}</div>
                  <div className="truncate text-[11px] text-[color:var(--pf-muted)]">/login/{tenant.slug}</div>
                </div>
                <div className="shrink-0 text-right text-[12px]">{status(tenant)}</div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[color:var(--pf-text-2)]">
                <span>
                  {t("platform.orgs.users")}:{" "}
                  <span className="tabular-nums text-[color:var(--pf-text)]">{formatCount(tenant.users)}</span>
                  <span className="text-[color:var(--pf-muted)]"> / {formatCount(tenant.admins)}</span>
                </span>
                <span>
                  {t("platform.orgs.created")}: {formatDate(tenant.createdAt)}
                </span>
                {moduleBadges(tenant)}
              </div>
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {openActions.map((action) => (
                  <button
                    key={action.kind}
                    type="button"
                    onClick={() => setDialog({ kind: action.kind, tenant })}
                    className="iris-focusable flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-md border border-[color:var(--pf-border)] px-1 text-[12px] text-[color:var(--pf-text)] hover:bg-white/5"
                  >
                    <span className="text-[color:var(--pf-text-2)]">{action.icon}</span>
                    <span className="max-w-full truncate">{action.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-y-1">
                {editButton(tenant)}
                {exportButton(tenant)}
                {suspendButton(tenant)}
                {deleteButton(tenant)}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        // `relative` keeps the header's absolutely positioned sr-only label
        // inside the scroller; without it the label sits at the table's right
        // edge and widens the whole page on a phone.
        <div className="relative mt-1 overflow-x-auto">
          <table className="w-full min-w-[980px] text-[13px]">
            <thead className="text-left text-[12px] text-[color:var(--pf-muted)]">
              <tr>
                <th className="px-4 py-2.5 font-normal">{t("platform.orgs.name")}</th>
                <th className="px-3 py-2.5 text-right font-normal">{t("platform.orgs.users")}</th>
                <th className="px-3 py-2.5 font-normal">{t("platform.orgs.created")}</th>
                <th className="px-3 py-2.5 font-normal">{t("platform.orgs.modules.column")}</th>
                <th className="px-3 py-2.5 font-normal">{t("platform.orgs.status")}</th>
                <th className="px-4 py-2.5 text-right font-normal">
                  <span className="sr-only">{t("platform.orgs.actionsLabel")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant, index) => (
                <tr
                  key={tenant.id}
                  style={staggerStyle(index)}
                  className="animate-iris-rise iris-stagger iris-row h-14 border-t border-[color:var(--pf-border)] hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-2">
                    <div className="text-[color:var(--pf-text)]">{tenant.name}</div>
                    <div className="text-[11px] text-[color:var(--pf-muted)]">/login/{tenant.slug}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCount(tenant.users)}
                    <span className="text-[color:var(--pf-muted)]"> / {formatCount(tenant.admins)}</span>
                  </td>
                  <td className="px-3 py-2 text-[color:var(--pf-text-2)]">{formatDate(tenant.createdAt)}</td>
                  <td className="px-3 py-2">{moduleBadges(tenant)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{status(tenant)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <div role="group" className="flex divide-x divide-[color:var(--pf-border)] overflow-hidden rounded-md border border-[color:var(--pf-border)]">
                        {openActions.map((action) => (
                          <button
                            key={action.kind}
                            type="button"
                            onClick={() => setDialog({ kind: action.kind, tenant })}
                            className="iris-focusable flex h-9 items-center gap-1.5 px-3 text-[13px] text-[color:var(--pf-text)] hover:bg-white/5"
                          >
                            <span className="text-[color:var(--pf-text-2)]">{action.icon}</span>
                            {action.label}
                          </button>
                        ))}
                      </div>
                      {editButton(tenant)}
                      {exportButton(tenant)}
                      <span aria-hidden className="h-5 w-px bg-[color:var(--pf-border)]" />
                      {suspendButton(tenant)}
                      {deleteButton(tenant)}
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
      {dialog?.kind === "modules" ? (
        <OrganizationModulesDialog
          tenant={dialog.tenant}
          onClose={close}
          onSaved={(saved) => {
            setNotice(t("platform.orgs.modules.savedNotice", { name: saved.name }));
            setDialog(null);
            void load();
          }}
        />
      ) : null}
      {dialog?.kind === "processes" ? <OrganizationProcessesDialog tenant={dialog.tenant} onClose={close} /> : null}
      {dialog?.kind === "delete" ? (
        <OrganizationDeleteDialog
          tenant={dialog.tenant}
          onClose={close}
          onDeleted={(result) => {
            setError(null);
            setNotice(t("platform.orgs.deletedNotice", { name: result.name, total: formatCount(result.totalRows) }));
            setDialog(null);
            void load();
          }}
        />
      ) : null}
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
