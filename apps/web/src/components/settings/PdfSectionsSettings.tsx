import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useOrganization } from "@/hooks/useOrganization";
import type { PDFSections } from "@/types/settings";

// The toggleable sections, in the order they appear on the printout.
const SECTION_KEYS: Array<keyof PDFSections> = [
  "delivery",
  "billing",
  "notes",
  "shippingAddress",
  "completion",
  "signatures",
];

function sectionsEqual(a: PDFSections, b: PDFSections): boolean {
  return SECTION_KEYS.every((key) => a[key] === b[key]);
}

/**
 * Admin-only editor for which sections appear on the work-order PDF/printout.
 * Persists shop-wide via the organization settings endpoint and updates the
 * app-wide config on success.
 */
export function PdfSectionsSettings(): React.JSX.Element {
  const { t } = useTranslation();
  const { pdfSections, setPdfSections } = useOrganization();
  const [draft, setDraft] = useState<PDFSections>(pdfSections);
  const [saving, setSaving] = useState(false);
  const dirty = !sectionsEqual(draft, pdfSections);

  const toggle = (key: keyof PDFSections): void => {
    setDraft((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const saved = await window.api.updateSettings({ pdfSections: draft });
      setPdfSections(saved.pdfSections);
      setDraft(saved.pdfSections);
      toast.success(t("settings.pdf.saved"));
    } catch (error) {
      toast.error(
        error instanceof Error && error.message.trim() !== ""
          ? `${t("settings.pdf.saveErrorPrefix")}: ${error.message}`
          : t("settings.pdf.saveError"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <FileText size={16} className="text-[color:var(--iris-accent)]" />
        <div>
          <div className="text-[13px] font-medium text-foreground">
            {t("settings.pdf.title")}
          </div>
          <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
            {t("settings.pdf.hint")}
          </div>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-border">
        {SECTION_KEYS.map((key) => (
          <label
            key={key}
            className="iris-focusable group flex cursor-pointer items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-black/[0.02]"
          >
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-foreground">
                {t(`settings.pdf.sections.${key}`)}
              </div>
              <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
                {t(`settings.pdf.sections.${key}Hint`)}
              </div>
            </div>
            <Checkbox
              checked={draft[key]}
              onCheckedChange={() => toggle(key)}
              aria-label={t(`settings.pdf.sections.${key}`)}
            />
          </label>
        ))}
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
