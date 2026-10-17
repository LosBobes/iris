import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ProcessTemplateForm } from "@/components/process/ProcessTemplateForm";
import { staggerStyle } from "@/lib/motion";
import type { PlatformTenant } from "@/types/platform";
import type { ProcessTemplate, ProcessTemplateInput } from "@/types/process";
import {
  BackofficeDialog,
  backofficeError,
  backofficeSecondaryButtonClass,
  backofficeSmallButtonClass,
} from "./BackofficeDialog";

type View = { kind: "list" } | { kind: "form"; template?: ProcessTemplate };

/**
 * Backoffice: one organization's process templates. The superadmin lists,
 * creates, edits and deletes them with the same graph editor the organization's
 * own admins use; each change lands in the activity log.
 */
export function OrganizationProcessesDialog({
  tenant,
  onClose,
}: {
  tenant: PlatformTenant;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<ProcessTemplate[] | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      setTemplates(await window.api.getPlatformProcessTemplates(tenant.slug));
      setError(null);
    } catch (cause) {
      setError(backofficeError(cause, t("platform.loadError")));
    }
  }, [tenant.slug, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (input: ProcessTemplateInput): Promise<void> => {
    const editing = view.kind === "form" ? view.template : undefined;
    try {
      if (editing) {
        await window.api.updatePlatformProcessTemplate(tenant.slug, editing.id, input);
      } else {
        await window.api.createPlatformProcessTemplate(tenant.slug, input);
      }
      setNotice(t("process.templates.saved"));
      setError(null);
      setView({ kind: "list" });
      await load();
    } catch (cause) {
      // Stay on the form so nothing typed is lost; the API's message says what to fix.
      setError(backofficeError(cause, t("process.templates.saveError")));
    }
  };

  const remove = async (template: ProcessTemplate): Promise<void> => {
    setBusy(true);
    try {
      await window.api.deletePlatformProcessTemplate(tenant.slug, template.id);
      setNotice(t("process.templates.deleted"));
      setError(null);
      setConfirmId(null);
      await load();
    } catch (cause) {
      setError(backofficeError(cause, t("process.templates.deleteError")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BackofficeDialog
      wide={view.kind === "form"}
      title={t("process.backoffice.title", { name: tenant.name })}
      description={t("process.backoffice.description")}
      onClose={onClose}
    >
      <div className="space-y-3 p-4">
        {!(tenant.modules.stock && tenant.modules.processes) ? (
          <p data-testid="processes-module-off" className="text-[12px] text-[color:var(--pf-muted)]">
            {t("platform.orgs.modules.templatesPrepNote")}
          </p>
        ) : null}
        {notice ? (
          <div role="status" className="rounded border border-[color:var(--pf-border)] bg-white/[0.03] px-4 py-2.5 text-[12px]">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="animate-iris-shake rounded border border-[#e66767]/40 bg-[#e66767]/10 px-4 py-2.5 text-[12px]">
            {error}
          </div>
        ) : null}

        {view.kind === "form" ? (
          // `dark` scopes the app's dark theme tokens to the editor so it sits
          // naturally on the Backoffice's dark surface.
          <div className="dark animate-iris-rise rounded-md bg-background p-4 text-foreground">
            <ProcessTemplateForm
              template={view.template}
              onSubmit={save}
              onCancel={() => setView({ kind: "list" })}
              variant="backoffice"
            />
          </div>
        ) : templates === null ? (
          error ? null : <p className="py-8 text-center text-[13px] text-[color:var(--pf-muted)]">{t("common.loading")}</p>
        ) : (
          <div className="animate-iris-rise space-y-3">
            <div className="flex justify-end">
              <button type="button" onClick={() => setView({ kind: "form" })} className={backofficeSmallButtonClass}>
                <Plus className="h-4 w-4" />
                {t("process.templates.new")}
              </button>
            </div>
            {templates.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-[color:var(--pf-muted)]">{t("process.templates.empty")}</p>
            ) : (
              <ul className="divide-y divide-[color:var(--pf-border)] rounded-md border border-[color:var(--pf-border)]">
                {templates.map((template, index) => (
                  <li
                    key={template.id}
                    style={staggerStyle(index)}
                    className="animate-iris-rise iris-stagger iris-row flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[13px] hover:bg-white/[0.02]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[color:var(--pf-text)]">
                        {template.name}
                        {template.isDefault ? (
                          <span className="animate-iris-pop ml-2 inline-block rounded-sm bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                            {t("process.templates.default")}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-[color:var(--pf-muted)]">
                        {t("process.templates.stepCount", {
                          count: template.graph.nodes.filter((node) => node.kind === "step").length,
                        })}
                      </div>
                    </div>
                    {confirmId === template.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] text-[color:var(--pf-text-2)]">
                          {t("process.backoffice.confirmDelete")}
                        </span>
                        <button type="button" onClick={() => setConfirmId(null)} className={backofficeSecondaryButtonClass + " !h-9 !px-3 !text-[13px]"}>
                          {t("common.cancel")}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void remove(template)}
                          className={`${backofficeSmallButtonClass} text-[#e66767]`}
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setView({ kind: "form", template })}
                          aria-label={t("process.templates.editAria", { name: template.name })}
                          className={backofficeSmallButtonClass}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {t("common.edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(template.id)}
                          aria-label={t("process.templates.deleteAria", { name: template.name })}
                          className={`${backofficeSmallButtonClass} text-[#e66767]`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </BackofficeDialog>
  );
}
