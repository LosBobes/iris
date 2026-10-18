import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import type { PlatformTenant, PlatformTenantDeletion } from "@/types/platform";
import {
  BackofficeDialog,
  backofficeError,
  backofficeInputClass,
  backofficePrimaryButtonClass,
  backofficeSecondaryButtonClass,
} from "./BackofficeDialog";
import { downloadTenantExport } from "./tenant-export";

/**
 * Guarded, permanent deletion of a suspended organization: the superadmin has
 * to type the slug exactly before the confirm button works. Offers an export
 * first, since nothing can be restored afterwards.
 */
export function OrganizationDeleteDialog({
  tenant,
  onClose,
  onDeleted,
}: {
  tenant: PlatformTenant;
  onClose: () => void;
  onDeleted: (result: PlatformTenantDeletion) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const inputId = useId();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportData = async (): Promise<void> => {
    setExporting(true);
    setError(null);
    try {
      await downloadTenantExport(tenant.slug);
    } catch (cause) {
      setError(backofficeError(cause, t("platform.orgs.exportFailed")));
    } finally {
      setExporting(false);
    }
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      onDeleted(await window.api.platformDeleteTenant(tenant.slug, typed));
    } catch (cause) {
      setError(backofficeError(cause, t("platform.orgs.failed")));
      setBusy(false);
    }
  };

  return (
    <BackofficeDialog title={t("platform.orgs.deleteTitle", { name: tenant.name })} onClose={onClose}>
      <form
        className="space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (typed === tenant.slug && !busy) void remove();
        }}
      >
        <p className="text-[13px] font-medium leading-5 text-[#e66767]">{t("platform.orgs.deleteIrreversible")}</p>
        <p className="text-[13px] leading-5 text-[color:var(--pf-text-2)]">{t("platform.orgs.deleteScope")}</p>
        <p className="text-[13px] leading-5 text-[color:var(--pf-text-2)]">{t("platform.orgs.deleteAuditNote")}</p>
        <div className="space-y-2 rounded border border-[color:var(--pf-border)] p-3">
          <p className="text-[12px] leading-5 text-[color:var(--pf-text-2)]">{t("platform.orgs.deleteExportHint")}</p>
          <button
            type="button"
            disabled={exporting || busy}
            onClick={() => void exportData()}
            className="iris-focusable flex h-9 items-center gap-1.5 rounded-md border border-[color:var(--pf-border)] px-3 text-[13px] text-[color:var(--pf-text)] hover:bg-white/5 disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {t("platform.orgs.exportData")}
          </button>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={inputId} className="block text-[13px] text-[color:var(--pf-text-2)]">
            {t("platform.orgs.deleteConfirmLabel", { slug: tenant.slug })}
          </label>
          <input
            id={inputId}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className={backofficeInputClass}
          />
        </div>
        {error ? (
          <p role="alert" className="text-[12px] text-[#e66767]">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={`${backofficeSecondaryButtonClass} flex-1`}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy || typed !== tenant.slug}
            className={`${backofficePrimaryButtonClass} flex-1 bg-[#e66767] text-white`}
          >
            {t("platform.orgs.deleteConfirm")}
          </button>
        </div>
      </form>
    </BackofficeDialog>
  );
}
