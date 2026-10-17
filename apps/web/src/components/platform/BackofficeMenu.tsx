import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { KeyRound, LogOut, Menu, X } from "lucide-react";
import { LanguageToggle } from "./LanguageToggle";

/**
 * The Backoffice's hamburger menu: who is signed in, language, password and
 * sign-out, plus whatever the toolbar has no room for on a phone (the section
 * tabs as `sections`, other controls as `extra`).
 *
 * Self-contained rather than the app's Radix dropdown: Radix portals its
 * content to <body>, outside the Backoffice's dark-surface variables.
 */
export function BackofficeMenu({
  username,
  role,
  sections,
  extra,
  onChangePassword,
  onLogout,
}: {
  username: string;
  role?: string;
  sections?: { to: string; label: string; current: boolean }[];
  extra?: ReactNode;
  onChangePassword: () => void;
  onLogout: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "iris-focusable flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-[14px] text-[color:var(--pf-text)] hover:bg-white/5";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? t("platform.menu.close") : t("platform.menu.open")}
        onClick={() => setOpen((v) => !v)}
        className="iris-focusable flex h-10 w-10 items-center justify-center rounded-md border border-[color:var(--pf-border)] text-[color:var(--pf-text)] hover:bg-white/5"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open ? (
        <div
          id={panelId}
          className="animate-iris-pop absolute right-0 top-12 z-30 origin-top-right w-[min(320px,calc(100vw-32px))] rounded-lg border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)] p-2 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-medium text-[color:var(--pf-text)]">{username}</div>
              <div className="text-[12px] text-[color:var(--pf-muted)]">{t("platform.menu.signedIn")}</div>
            </div>
            {role ? (
              <span className="shrink-0 rounded border border-[color:var(--pf-border)] px-2 py-0.5 text-[11px] uppercase tracking-[1px] text-[color:var(--pf-text-2)]">
                {role}
              </span>
            ) : null}
          </div>

          {sections ? (
            <>
              <div className="my-1 border-t border-[color:var(--pf-border)]" />
              <nav aria-label={t("platform.nav.label")}>
                {sections.map((section) => (
                  <Link
                    key={section.to}
                    to={section.to}
                    aria-current={section.current ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`${item} font-medium ${section.current ? "bg-white/10" : ""}`}
                  >
                    {section.label}
                  </Link>
                ))}
              </nav>
            </>
          ) : null}

          <div className="my-1 border-t border-[color:var(--pf-border)]" />

          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-[13px] text-[color:var(--pf-text-2)]">{t("language.label")}</span>
            <LanguageToggle />
          </div>

          {extra ? (
            <>
              <div className="my-1 border-t border-[color:var(--pf-border)]" />
              <div className="px-3 py-2">{extra}</div>
            </>
          ) : null}

          <div className="my-1 border-t border-[color:var(--pf-border)]" />

          <button
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              onChangePassword();
            }}
          >
            <KeyRound className="h-[18px] w-[18px] text-[color:var(--pf-text-2)]" />
            {t("platform.password.title")}
          </button>
          <button
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogOut className="h-[18px] w-[18px] text-[color:var(--pf-text-2)]" />
            {t("platform.logout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
