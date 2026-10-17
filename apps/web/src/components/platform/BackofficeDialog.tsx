import { useEffect, useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

/**
 * Modal shell for Backoffice dialogs, drawn with the console's dark-surface
 * variables (the app's Radix dialog portals to <body>, outside them). Escape,
 * the close button and a click on the backdrop all call onClose.
 */
export function BackofficeDialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[calc(100dvh-32px)] w-full max-w-[460px] overflow-y-auto rounded-lg border border-[color:var(--pf-border)] bg-[color:var(--pf-panel)] text-[color:var(--pf-text)] shadow-2xl">
        <header className="flex items-start gap-3 border-b border-[color:var(--pf-border)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[15px] font-medium">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--pf-text-2)]">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("platform.impersonate.close")}
            className="iris-focusable flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[color:var(--pf-text-2)] hover:bg-white/5 hover:text-[color:var(--pf-text)]"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

/** Shared Backoffice form styles. */
export const backofficeInputClass =
  "w-full h-11 rounded-md border border-[color:var(--pf-border)] bg-[color:var(--pf-bg)] px-3 text-[15px] text-[color:var(--pf-text)] outline-none focus:border-[color:var(--pf-text-2)]";
export const backofficePrimaryButtonClass =
  "iris-focusable h-11 rounded-md bg-[color:var(--pf-text)] px-4 text-[14px] font-medium text-[color:var(--pf-bg)] hover:opacity-90 disabled:opacity-50";
export const backofficeSecondaryButtonClass =
  "iris-focusable h-11 rounded-md border border-[color:var(--pf-border)] px-4 text-[14px] text-[color:var(--pf-text-2)] hover:text-[color:var(--pf-text)]";
export const backofficeSmallButtonClass =
  "iris-focusable flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--pf-border)] px-3 text-[13px] text-[color:var(--pf-text)] hover:bg-white/5 disabled:opacity-60";

/** The message to show for a failed Backoffice request. */
export function backofficeError(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
