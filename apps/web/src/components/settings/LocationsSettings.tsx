import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, MapPin, Save } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useOrganization } from "@/hooks/useOrganization";

/**
 * Admin-only toggle for whether firms may have multiple locations. When off, a
 * firm's location is presented as part of the firm (single address, no location
 * picker); the underlying data model is unchanged. Persists shop-wide via
 * organization settings.
 */
export function LocationsSettings(): React.JSX.Element {
  const { t } = useTranslation();
  const { allowMultipleLocations, setAllowMultipleLocations } = useOrganization();
  const [draft, setDraft] = useState<boolean>(allowMultipleLocations);
  const [saving, setSaving] = useState(false);
  const dirty = draft !== allowMultipleLocations;

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const saved = await window.api.updateSettings({
        allowMultipleLocations: draft,
      });
      setAllowMultipleLocations(saved.allowMultipleLocations);
      setDraft(saved.allowMultipleLocations);
      toast.success(t("settings.locations.saved"));
    } catch (error) {
      toast.error(
        error instanceof Error && error.message.trim() !== ""
          ? `${t("settings.locations.saveErrorPrefix")}: ${error.message}`
          : t("settings.locations.saveError"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <MapPin size={16} className="text-[color:var(--iris-accent)]" />
        <div>
          <div className="text-[13px] font-medium text-foreground">
            {t("settings.locations.title")}
          </div>
          <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
            {t("settings.locations.hint")}
          </div>
        </div>
      </div>

      <label className="iris-focusable group flex cursor-pointer items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-black/[0.02]">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-foreground">
            {t("settings.locations.allow")}
          </div>
          <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
            {t("settings.locations.allowHint")}
          </div>
        </div>
        <Checkbox
          checked={draft}
          onCheckedChange={(checked) => setDraft(checked === true)}
          aria-label={t("settings.locations.allow")}
        />
      </label>

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
