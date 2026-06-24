import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useOrganization } from "@/hooks/useOrganization";

/**
 * Admin-only editor for the shop's firm name (branding). Persists via the
 * organization settings endpoint and updates the app-wide name on success.
 */
export function OrganizationNameSettings(): React.JSX.Element {
  const { t } = useTranslation();
  const { firmName, setFirmName } = useOrganization();
  const [value, setValue] = useState(firmName);
  const [saving, setSaving] = useState(false);
  const dirty = value.trim() !== firmName && value.trim() !== "";

  const save = async (): Promise<void> => {
    const next = value.trim();
    if (!next) {
      toast.error(t("settings.org.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      const saved = await window.api.updateSettings({ firmName: next });
      setFirmName(saved.firmName);
      setValue(saved.firmName);
      toast.success(t("settings.org.saved"));
    } catch (error) {
      toast.error(
        error instanceof Error && error.message.trim() !== ""
          ? `${t("settings.org.saveErrorPrefix")}: ${error.message}`
          : t("settings.org.saveError"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <Building2 size={16} className="text-[color:var(--iris-accent)]" />
        <div>
          <div className="text-[13px] font-medium text-foreground">{t("settings.org.title")}</div>
          <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
            {t("settings.org.hint")}
          </div>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end"
      >
        <label className="block flex-1 text-[11px] text-[color:var(--iris-ink-soft)]">
          {t("settings.org.label")}
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t("settings.org.placeholder")}
            className="mt-1 block w-full border border-border bg-background px-2 py-2 text-[13px] text-foreground"
          />
        </label>
        <button
          type="submit"
          disabled={saving || !dirty}
          className="iris-focusable iris-press inline-flex items-center justify-center gap-2 bg-foreground px-4 py-2 text-[12px] font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {t("common.save")}
        </button>
      </form>
    </section>
  );
}
