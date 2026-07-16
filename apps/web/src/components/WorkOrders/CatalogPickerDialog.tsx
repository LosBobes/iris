import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Loader2, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { getOverlayContainer } from "@/lib/overlay-container";
import { cn } from "@/lib/utils";
import type { CatalogItem, CatalogItemKind } from "@/types/catalog";

interface CatalogPickerDialogProps {
  /** Which catalog kind this dialog browses; also drives the server filter. */
  kind: CatalogItemKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chosen item; the dialog closes itself after calling this. */
  onSelect: (item: CatalogItem) => void;
  /** Ids already on the order, hidden from the results. */
  excludeIds: Set<string>;
  /** Admin sees sale prices in the sublabel; operators do not. */
  isAdmin: boolean;
}

/**
 * A full search dialog for picking a catalog service or article to add as a
 * work-order line. Mirrors the "Posebna usluga/roba" buttons: a plus button
 * opens this, the operator searches the (server-side) catalog filtered to the
 * requested kind, and a click adds the line. Debounced query with request-id
 * guarding to drop out-of-order responses, like AsyncCombobox.
 */
export function CatalogPickerDialog({
  kind,
  open,
  onOpenChange,
  onSelect,
  excludeIds,
  isAdmin,
}: CatalogPickerDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  // Reset the query each time the dialog opens so it never shows stale results.
  useEffect(() => {
    if (open) setTerm("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    setLoading(true);
    const handle = setTimeout(() => {
      window.api
        .getCatalogItems({ q: term.trim(), kind, active: true, limit: 20 })
        .then(({ items }) => {
          if (requestId.current !== id) return;
          setResults(items.filter((item) => !excludeIds.has(item.id)));
          setLoading(false);
        })
        .catch(() => {
          if (requestId.current !== id) return;
          setResults([]);
          setLoading(false);
        });
    }, 220);
    return () => clearTimeout(handle);
  }, [open, term, kind, excludeIds]);

  const title =
    kind === "service"
      ? t("workOrders.form.catalogServiceTitle")
      : t("workOrders.form.catalogArticleTitle");

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal container={getOverlayContainer()}>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-3 rounded-none bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <DialogPrimitive.Title className="text-[13px] font-medium text-foreground">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {title}
          </DialogPrimitive.Description>

          <div className="flex items-center gap-2 border-b border-border px-0 py-2">
            <Search className="h-4 w-4 shrink-0 text-[color:var(--iris-ink-mute)]" />
            <input
              autoFocus
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder={t("workOrders.form.searchCatalog")}
              className="w-full bg-transparent text-[13px] text-foreground outline-none"
            />
            {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-60" />}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {!loading && results.length === 0 ? (
              <div className="px-3 py-8 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
                {t("workOrders.form.noCatalog")}
              </div>
            ) : (
              <div className="flex flex-col">
                {results.map((item) => {
                  const sublabel = [
                    item.code,
                    isAdmin && item.salePrice !== null
                      ? `${item.salePrice} RSD`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelect(item);
                        onOpenChange(false);
                      }}
                      className={cn(
                        "iris-focusable flex flex-col items-start gap-0.5 border-b border-border/60 px-2 py-2.5 text-left last:border-b-0 hover:bg-[color:var(--iris-accent)]/10",
                      )}
                    >
                      <span className="text-[13px] text-foreground">{item.name}</span>
                      {sublabel && (
                        <span className="text-[11px] text-[color:var(--iris-ink-mute)]">
                          {sublabel}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
