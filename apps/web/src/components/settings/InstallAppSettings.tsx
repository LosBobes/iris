import { useTranslation } from "react-i18next";
import { CheckCircle2, Download, Share, SquarePlus, Smartphone } from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";

/**
 * "Install the app" card: a one-tap install button where the browser supports
 * it (Android / desktop Chromium), step-by-step Share-menu instructions on
 * iOS/iPadOS, and a confirmation once Iris already runs as an installed app.
 * Hidden on browsers that offer neither.
 */
export function InstallAppSettings(): React.JSX.Element | null {
  const { t } = useTranslation();
  const { state, install } = usePwaInstall();

  if (state === "unavailable") return null;

  return (
    <section className="max-w-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <Smartphone size={16} className="text-[color:var(--iris-accent)]" />
        <div>
          <div className="text-[13px] font-medium text-foreground">
            {t("settings.install.title")}
          </div>
          <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
            {t("settings.install.hint")}
          </div>
        </div>
      </div>

      {state === "installed" && (
        <div className="flex items-center gap-2.5 px-5 py-4 text-[13px] text-foreground">
          <CheckCircle2 size={16} className="shrink-0 text-[color:var(--iris-accent)]" />
          {t("settings.install.installed")}
        </div>
      )}

      {state === "promptable" && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="min-w-0 text-[12px] text-[color:var(--iris-ink-soft)]">
            {t("settings.install.promptBody")}
          </p>
          <button
            type="button"
            onClick={() => void install()}
            className="iris-focusable iris-press inline-flex items-center justify-center gap-2 bg-foreground px-4 py-2 text-[12px] font-medium text-background hover:bg-foreground/90"
          >
            <Download className="h-3.5 w-3.5" />
            {t("settings.install.button")}
          </button>
        </div>
      )}

      {state === "ios-manual" && (
        <ol className="space-y-2.5 px-5 py-4 text-[13px] text-foreground">
          <li className="flex items-center gap-2.5">
            <Share size={16} aria-hidden className="shrink-0 text-[color:var(--iris-accent)]" />
            {t("settings.install.iosStep1")}
          </li>
          <li className="flex items-center gap-2.5">
            <SquarePlus size={16} aria-hidden className="shrink-0 text-[color:var(--iris-accent)]" />
            {t("settings.install.iosStep2")}
          </li>
          <li className="flex items-center gap-2.5">
            <CheckCircle2 size={16} aria-hidden className="shrink-0 text-[color:var(--iris-accent)]" />
            {t("settings.install.iosStep3")}
          </li>
        </ol>
      )}
    </section>
  );
}
