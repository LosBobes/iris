import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileCheck2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrganization } from "@/hooks/useOrganization";
import { getWorkOrderBillingDocumentLabel } from "@/shared/utils/work-orders";
import type { BillingDefaults } from "@/types/settings";
import type { BillingDocumentType } from "@/types/work-order";

// The document types the shop can pick as its default. Kept in sync with the
// enum the API accepts for billingDefaults.documentType.
const DOCUMENT_TYPES: BillingDocumentType[] = [
  "proforma",
  "invoice",
  "cashCollection",
];

function defaultsEqual(a: BillingDefaults, b: BillingDefaults): boolean {
  return a.documentType === b.documentType && a.allowOverride === b.allowOverride;
}

/**
 * Admin-only editor for the work-order document type (tip dokumenta): the type
 * new orders start with and whether operators may change it per order. Persists
 * shop-wide via the organization settings endpoint.
 */
export function BillingDefaultsSettings(): React.JSX.Element {
  const { t } = useTranslation();
  const { billingDefaults, setBillingDefaults } = useOrganization();
  const [draft, setDraft] = useState<BillingDefaults>(billingDefaults);
  const [saving, setSaving] = useState(false);
  const dirty = !defaultsEqual(draft, billingDefaults);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const saved = await window.api.updateSettings({ billingDefaults: draft });
      setBillingDefaults(saved.billingDefaults);
      setDraft(saved.billingDefaults);
      toast.success(t("settings.billing.saved"));
    } catch (error) {
      toast.error(
        error instanceof Error && error.message.trim() !== ""
          ? `${t("settings.billing.saveErrorPrefix")}: ${error.message}`
          : t("settings.billing.saveError"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <FileCheck2 size={16} className="text-[color:var(--iris-accent)]" />
        <div>
          <div className="text-[13px] font-medium text-foreground">
            {t("settings.billing.title")}
          </div>
          <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
            {t("settings.billing.hint")}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="billing-default-document-type"
            className="text-[13px] font-medium text-foreground"
          >
            {t("settings.billing.documentType")}
          </label>
          <Select
            value={draft.documentType}
            onValueChange={(value) =>
              setDraft((prev) => ({
                ...prev,
                documentType: value as BillingDocumentType,
              }))
            }
          >
            <SelectTrigger id="billing-default-document-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {getWorkOrderBillingDocumentLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="iris-focusable group flex cursor-pointer items-center justify-between gap-3 border-t border-border pt-4">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-foreground">
              {t("settings.billing.allowOverride")}
            </div>
            <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
              {t("settings.billing.allowOverrideHint")}
            </div>
          </div>
          <Checkbox
            checked={draft.allowOverride}
            onCheckedChange={(checked) =>
              setDraft((prev) => ({ ...prev, allowOverride: checked === true }))
            }
            aria-label={t("settings.billing.allowOverride")}
          />
        </label>
      </div>

      <div className="flex justify-end border-t border-border px-5 py-4">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="iris-focusable iris-press inline-flex items-center justify-center gap-2 bg-foreground px-4 py-2 text-[12px] font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {t("common.save")}
        </button>
      </div>
    </section>
  );
}
