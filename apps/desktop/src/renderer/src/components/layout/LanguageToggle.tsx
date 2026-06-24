import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUPPORTED_LANGUAGES, type AppLanguage } from "@/i18n";

/**
 * Compact SR | EN language switcher for the desktop sidebar footer. Persistence
 * is handled by i18next's localStorage detector cache.
 */
export function LanguageToggle(): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const current: AppLanguage = i18n.resolvedLanguage === "en" ? "en" : "sr";

  return (
    <div className="flex items-center gap-2 py-1">
      <Languages size={14} className="shrink-0 text-[color:var(--iris-ink-mute)]" />
      <div
        className="flex overflow-hidden rounded-sm border border-[color:var(--iris-border-soft)]"
        aria-label={t("language.label")}
      >
        {SUPPORTED_LANGUAGES.map((lng) => (
          <button
            key={lng}
            type="button"
            onClick={() => void i18n.changeLanguage(lng)}
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
