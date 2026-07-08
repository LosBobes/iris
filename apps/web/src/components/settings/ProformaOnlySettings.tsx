import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useOrganization } from "@/hooks/useOrganization";

/**
 * Admin-only toggle for whether this shop only ever issues proformas
 * (profaktura/predračun) and never invoices (faktura). Persists shop-wide via
 * the organization settings endpoint and updates the app-wide config on
 * success; the work-order form reads it to default to and restrict the
 * billing document type.
 */
export function ProformaOnlySettings(): React.JSX.Element {
  const { t } = useTranslation();
  const { proformaOnly, setProformaOnly } = useOrganization();
  const [saving, setSaving] = useState(false);

  const toggle = async (checked: boolean): Promise<void> => {
    setSaving(true);
    try {
      const saved = await window.api.updateSettings({ proformaOnly: checked });
      setProformaOnly(saved.proformaOnly);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message.trim() !== ""
          ? `${t("settings.proforma.saveErrorPrefix")}: ${error.message}`
          : t("settings.proforma.saveError"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <Receipt size={16} className="text-[color:var(--iris-accent)]" />
        <div>
          <div className="text-[13px] font-medium text-foreground">
            {t("settings.proforma.title")}
          </div>
          <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
            {t("settings.proforma.hint")}
          </div>
        </div>
      </div>

      <label className="iris-focusable group flex cursor-pointer items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-black/[0.02]">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-foreground">
            {t("settings.proforma.label")}
          </div>
          <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
            {t("settings.proforma.labelHint")}
          </div>
        </div>
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[color:var(--iris-ink-soft)]" />
        ) : (
          <Checkbox
            checked={proformaOnly}
            disabled={saving}
            onCheckedChange={(checked) => void toggle(checked === true)}
            aria-label={t("settings.proforma.label")}
          />
        )}
      </label>
    </section>
  );
}
