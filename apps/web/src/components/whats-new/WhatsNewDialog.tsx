import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getOverlayContainer } from "@/lib/overlay-container";
import type { WhatsNewEntry } from "@/lib/whats-new";
import { StackedLabel } from "@/components/ui/stacked-label";
import { WhatsNewArt } from "./WhatsNewArt";

/** `**words**` in bold. */
export function rich(text: string): ReactNode[] {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((part, i) => (i % 2 ? <b key={i} className="font-medium text-foreground">{part}</b> : part));
}

interface WhatsNewDialogProps {
  /** Newest first (lib/whats-new.ts). */
  entries: readonly WhatsNewEntry[];
  /** Closed by any route: what was shown counts as seen. */
  onClose: () => void;
}

/**
 * Šta je novo: one page per entry, each with its looping demo, a title and a
 * few lines, stepped with Nazad / Dalje.
 *
 * Nothing moves between pages: the demo has a fixed box, every page's text is
 * laid out in the same grid cell (the hidden ones keep their space), so the
 * dialog is as tall as its longest page from the start, and the footer has
 * fixed slots, so Nazad, the counter and Dalje stay put whatever the words.
 */
export function WhatsNewDialog({ entries, onClose }: WhatsNewDialogProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const index = Math.min(page, entries.length - 1);
  const entry = entries[index];
  if (!entry) return null;
  const lastPage = index >= entries.length - 1;

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal container={getOverlayContainer()}>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 duration-100 data-open:animate-in data-open:fade-in-0" />
        <DialogPrimitive.Content
          data-whats-new
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto border border-border bg-popover p-5 text-popover-foreground shadow-2xl outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 sm:p-6"
        >
          <div className="flex items-center justify-between gap-4">
            <DialogPrimitive.Title className="text-[10px] font-medium uppercase tracking-[1.5px] text-[color:var(--iris-accent)]">
              {t("whatsNew.title")}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={t("whatsNew.close")}
              className="iris-focusable iris-press -mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center text-[color:var(--iris-ink-mute)] hover:bg-black/[0.04] hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          {/* Keyed, so each page's animation starts from the top. */}
          <div key={entry.id} className="mt-3">
            <WhatsNewArt demo={entry.id} />
          </div>

          <div className="mt-4 grid">
            {entries.map((item, i) => {
              const current = i === index;
              return (
                <article
                  key={item.id}
                  aria-hidden={current ? undefined : true}
                  className={cn("col-start-1 row-start-1", !current && "invisible")}
                  data-current={current ? "true" : undefined}
                >
                  <h2 className="text-[20px] font-medium leading-tight tracking-[-0.35px] text-foreground">
                    {t(`whatsNew.entries.${item.id}.title`)}
                  </h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--iris-ink-soft)]">
                    {rich(t(`whatsNew.entries.${item.id}.body`))}
                  </p>
                </article>
              );
            })}
          </div>

          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <button
              type="button"
              onClick={() => setPage(index - 1)}
              disabled={index === 0}
              aria-hidden={index === 0 ? true : undefined}
              tabIndex={index === 0 ? -1 : undefined}
              className={cn(
                "iris-focusable iris-press flex min-w-[6.5rem] items-center justify-center gap-1.5 justify-self-start border border-border bg-card px-3 py-2 text-[12px] font-medium text-foreground hover:bg-black/[0.03]",
                index === 0 && "invisible",
              )}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {t("whatsNew.back")}
            </button>
            <span className="min-w-[4rem] text-center text-[11px] tabular-nums text-[color:var(--iris-ink-mute)]">
              {entries.length > 1 ? t("whatsNew.step", { current: index + 1, total: entries.length }) : null}
            </span>
            <button
              type="button"
              onClick={lastPage ? onClose : () => setPage(index + 1)}
              className="iris-focusable iris-press min-w-[6.5rem] justify-self-end bg-foreground px-3 py-2 text-[12px] font-medium text-background hover:bg-foreground/90"
            >
              <StackedLabel
                showSecond={lastPage}
                first={
                  <>
                    {t("whatsNew.next")}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </>
                }
                second={t("whatsNew.done")}
              />
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
