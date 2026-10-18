import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { ApiError, formatActionError } from "@/lib/errors";
import type { PlatformTenant } from "@/types/platform";
import type { OrganizationModules } from "@/types/settings";
import {
  BackofficeDialog,
  backofficePrimaryButtonClass,
  backofficeSecondaryButtonClass,
} from "./BackofficeDialog";

function ModuleSwitch({
  checked,
  disabled = false,
  label,
  description,
  helper,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  description: string;
  helper?: string;
  onChange: (checked: boolean) => void;
}): React.JSX.Element {
  const id = useId();
  return (
    <div className={`flex items-start gap-3 rounded-md border border-[color:var(--pf-border)] px-3 py-3 ${disabled ? "opacity-60" : ""}`}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={`${id}-desc`}
        onChange={(event) => onChange(event.target.checked)}
        className="iris-focusable mt-1 h-4 w-4 shrink-0 accent-[color:var(--pf-text)]"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[14px] text-[color:var(--pf-text)]">
          {label}
        </label>
        <p id={`${id}-desc`} className="mt-0.5 text-[12px] leading-relaxed text-[color:var(--pf-text-2)]">
          {description}
          {helper ? <span className="block text-[color:var(--pf-muted)]">{helper}</span> : null}
        </p>
      </div>
    </div>
  );
}

/**
 * Switches an organization's optional modules (Backoffice superadmins only).
 * "Procesi rada" requires "Magacin": its switch is disabled while Magacin is
 * off, and turning Magacin off turns it off too.
 */
export function OrganizationModulesDialog({
  tenant,
  onClose,
  onSaved,
}: {
  tenant: PlatformTenant;
  onClose: () => void;
  onSaved: (tenant: PlatformTenant) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [modules, setModules] = useState<OrganizationModules>({
    stock: tenant.modules.stock,
    processes: tenant.modules.stock && tenant.modules.processes,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      onSaved(await window.api.setPlatformTenantModules(tenant.slug, modules));
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 422 && cause.message
          ? cause.message
          : formatActionError(t("platform.orgs.modules.saveError"), cause),
      );
      setSaving(false);
    }
  };

  return (
    <BackofficeDialog
      title={t("platform.orgs.modules.title", { name: tenant.name })}
      description={t("platform.orgs.modules.description")}
      onClose={onClose}
    >
      <div className="space-y-3 p-4">
        <ModuleSwitch
          checked={modules.stock}
          label={t("platform.orgs.modules.stock")}
          description={t("platform.orgs.modules.stockHint")}
          onChange={(stock) => setModules((current) => ({ stock, processes: stock && current.processes }))}
        />
        <ModuleSwitch
          checked={modules.processes}
          disabled={!modules.stock}
          label={t("platform.orgs.modules.processes")}
          description={t("platform.orgs.modules.processesHint")}
          helper={t("platform.orgs.modules.requiresStock")}
          onChange={(processes) => setModules((current) => ({ ...current, processes }))}
        />
        <p className="text-[12px] text-[color:var(--pf-muted)]">{t("platform.orgs.modules.defaultOff")}</p>
        {error ? (
          <div role="alert" className="rounded border border-[#e66767]/40 bg-[#e66767]/10 px-3 py-2 text-[12px] text-[color:var(--pf-text)]">
            {error}
          </div>
        ) : null}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={`${backofficeSecondaryButtonClass} flex-1`}>
            {t("common.cancel")}
          </button>
          <button type="button" disabled={saving} onClick={() => void save()} className={`${backofficePrimaryButtonClass} flex-1`}>
            {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden /> : t("common.save")}
          </button>
        </div>
      </div>
    </BackofficeDialog>
  );
}
