import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LanguageToggle } from "./LanguageToggle";

/** Full-screen frame for the Backoffice's sign-in and password screens. */
export function BackofficeScreen({ children }: { children: ReactNode }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    // Its own scroll container (see .iris-screen): the app's font-scale wrapper
    // clips document scrolling, and on a phone — keyboard open — the form must
    // still scroll into reach. The column grows past the viewport when needed.
    <div data-testid="backoffice-screen" className="iris-screen bg-[color:var(--pf-bg)] text-[color:var(--pf-text)]">
      <div className="flex min-h-full flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-[18px] font-medium tracking-[-0.3px]">Iris</span>
            <span aria-hidden className="h-5 w-px bg-[color:var(--pf-border)]" />
            <span className="text-[15px] text-[color:var(--pf-text-2)]">{t("platform.title")}</span>
          </div>
          <LanguageToggle />
        </header>
        <main className="flex flex-1 items-center justify-center px-4 pb-16">{children}</main>
      </div>
    </div>
  );
}
