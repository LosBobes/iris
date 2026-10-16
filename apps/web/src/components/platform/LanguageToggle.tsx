import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, ensureLanguageBundle } from "@/i18n";

/**
 * SR | EN switch for the Backoffice. Same mechanism as the language picker in
 * the app's Settings: load the bundle first, then switch, so no Serbian
 * fallback text flashes; the choice is remembered on the device.
 */
export function LanguageToggle({ className = "" }: { className?: string }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage === "en" ? "en" : "sr";
  return (
    <div
      role="radiogroup"
      aria-label={t("language.label")}
      className={`inline-flex rounded-md border border-[color:var(--pf-border)] p-0.5 ${className}`}
    >
      {SUPPORTED_LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          role="radio"
          aria-checked={current === lng}
          aria-label={t(`language.${lng}`)}
          onClick={() => {
            void ensureLanguageBundle(lng).then(() => i18n.changeLanguage(lng));
          }}
          className={`iris-focusable min-h-9 min-w-11 rounded px-3 text-[13px] font-medium uppercase ${
            current === lng
              ? "bg-white/10 text-[color:var(--pf-text)]"
              : "text-[color:var(--pf-text-2)] hover:text-[color:var(--pf-text)]"
          }`}
        >
          {lng}
        </button>
      ))}
    </div>
  );
}
