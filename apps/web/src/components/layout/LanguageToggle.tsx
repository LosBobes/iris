import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUPPORTED_LANGUAGES, type AppLanguage } from "@/i18n";

/**
 * Language switcher for the sidebar. Expanded: a compact SR | EN segmented
 * control. Collapsed: a single globe button that cycles to the next language.
 * Persistence is handled by i18next's localStorage detector cache.
 */
export function LanguageToggle({
  collapsed = false,
}: {
  collapsed?: boolean;
}): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const current: AppLanguage =
    i18n.resolvedLanguage === "en" ? "en" : "sr";

  const setLanguage = (lng: AppLanguage): void => {
    void i18n.changeLanguage(lng);
  };

  if (collapsed) {
    const next: AppLanguage = current === "sr" ? "en" : "sr";
    return (
      <button
        type="button"
        onClick={() => setLanguage(next)}
        aria-label={t("language.label")}
        className="iris-focusable iris-press flex h-9 w-full items-center justify-center rounded-sm text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground"
      >
        <Languages size={16} className="shrink-0" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <Languages size={14} className="shrink-0 text-[color:var(--iris-ink-mute)]" />
      <div className="flex overflow-hidden rounded-sm border border-[color:var(--iris-border-soft)]">
        {SUPPORTED_LANGUAGES.map((lng) => (
          <button
            key={lng}
            type="button"
            onClick={() => setLanguage(lng)}
            aria-pressed={current === lng}
            className={cn(
              "px-2 py-0.5 text-[11px] uppercase tracking-[0.5px] transition-colors",
              current === lng
                ? "bg-[color:var(--iris-accent)]/15 font-medium text-[color:var(--iris-accent)]"
                : "text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground",
            )}
          >
            {lng}
          </button>
        ))}
      </div>
    </div>
  );
}
