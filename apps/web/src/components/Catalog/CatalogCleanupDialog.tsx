import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCatalogPrice, kindLabel } from "@/lib/catalog";
import type {
  CatalogCleanupFilter,
  CatalogCleanupMissing,
  CatalogItem,
  CatalogItemKind,
} from "@/types/catalog";

const KINDS: CatalogItemKind[] = ["service", "article"];
const MISSING_MODES: CatalogCleanupMissing[] = ["purchase", "sale", "both"];

interface CatalogCleanupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful delete with how many items were removed. */
  onDeleted: (deleted: number) => void;
  /** Called when the preview or the delete fails, with a ready-to-show message. */
  onError: (message: string) => void;
}

/**
 * Admin catalog cleanup in two steps. First the admin picks the scope: which
 * kinds (services, articles, or both) and which price has to be missing. Then a
 * second confirmation lists the exact items that will be deleted — the list
 * comes from the same filter the delete uses, so nothing unexpected can go.
 */
export function CatalogCleanupDialog({
  open,
  onOpenChange,
  onDeleted,
  onError,
}: CatalogCleanupDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const [step, setStep] = useState<"options" | "confirm">("options");
  const [kinds, setKinds] = useState<CatalogItemKind[]>(["service"]);
  const [missing, setMissing] = useState<CatalogCleanupMissing>("both");
  const [preview, setPreview] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // The preview and the delete must send the identical filter, so both read this
  // single value rather than rebuilding it.
  const filter = useMemo<CatalogCleanupFilter>(() => ({ kinds, missing }), [kinds, missing]);

  // Every opening starts from the same safe defaults: services only, and only
  // items with no price at all (the narrowest sweep).
  useEffect(() => {
    if (!open) return;
    setStep("options");
    setKinds(["service"]);
    setMissing("both");
    setPreview([]);
    setLoading(false);
    setDeleting(false);
  }, [open]);

  const toggleKind = useCallback((kind: CatalogItemKind) => {
    setKinds((current) =>
      current.includes(kind)
        ? current.filter((value) => value !== kind)
        : [...current, kind],
    );
  }, []);

  // Step 1 → 2: fetch exactly what this filter would delete.
  const loadPreview = useCallback(async () => {
    if (kinds.length === 0) return;
    setLoading(true);
    try {
      const { items } = await window.api.previewCatalogCleanup(filter);
      setPreview(items);
      setStep("confirm");
    } catch {
      onError(t("catalog.cleanup.previewError"));
    } finally {
      setLoading(false);
    }
  }, [filter, kinds.length, onError, t]);

  const runCleanup = useCallback(async () => {
    setDeleting(true);
    try {
      const { deleted } = await window.api.cleanupCatalogItems(filter);
      onDeleted(deleted);
      onOpenChange(false);
    } catch {
      onError(t("catalog.cleanup.error"));
      setDeleting(false);
    }
  }, [filter, onDeleted, onError, onOpenChange, t]);

  const busy = loading || deleting;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Never yank the dialog away mid-request.
        if (!next && busy) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className="sm:max-w-md">
        {step === "options" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("catalog.cleanup.options.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("catalog.cleanup.options.description")}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-4 text-left">
              <fieldset className="space-y-2">
                <legend className="text-[11px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                  {t("catalog.cleanup.options.kindsLegend")}
                </legend>
                {KINDS.map((kind) => (
                  <label
                    key={kind}
                    className="flex cursor-pointer items-center gap-2 text-[13px] text-foreground"
                  >
                    <Checkbox
                      checked={kinds.includes(kind)}
                      onCheckedChange={() => toggleKind(kind)}
                      aria-label={t(
                        kind === "service"
                          ? "catalog.cleanup.options.kindService"
                          : "catalog.cleanup.options.kindArticle",
                      )}
                    />
                    {t(
                      kind === "service"
                        ? "catalog.cleanup.options.kindService"
                        : "catalog.cleanup.options.kindArticle",
                    )}
                  </label>
                ))}
                {kinds.length === 0 && (
                  <p className="text-[11px] text-destructive">
                    {t("catalog.cleanup.options.kindsRequired")}
                  </p>
                )}
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-[11px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                  {t("catalog.cleanup.options.missingLegend")}
                </legend>
                {MISSING_MODES.map((mode) => (
                  <label
                    key={mode}
                    className="flex cursor-pointer items-center gap-2 text-[13px] text-foreground"
                  >
                    <input
                      type="radio"
                      name="catalog-cleanup-missing"
                      value={mode}
                      checked={missing === mode}
                      onChange={() => setMissing(mode)}
                      className="iris-focusable size-4 accent-[color:var(--iris-accent)]"
                    />
                    {t(
                      mode === "purchase"
                        ? "catalog.cleanup.options.missingPurchase"
                        : mode === "sale"
                          ? "catalog.cleanup.options.missingSale"
                          : "catalog.cleanup.options.missingBoth",
                    )}
                  </label>
                ))}
              </fieldset>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>
                {t("catalog.cleanup.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void loadPreview();
                }}
                disabled={busy || kinds.length === 0}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("catalog.cleanup.next")
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("catalog.cleanup.confirm.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {preview.length === 0
                  ? t("catalog.cleanup.confirm.empty")
                  : t("catalog.cleanup.confirm.description", { count: preview.length })}
              </AlertDialogDescription>
            </AlertDialogHeader>

            {preview.length > 0 && (
              <ul
                className="max-h-64 divide-y divide-[color:var(--iris-border-soft)] overflow-y-auto border border-border text-left"
                data-testid="catalog-cleanup-preview"
              >
                {preview.map((item) => (
                  <li key={item.id} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] text-foreground">
                        {item.name}
                      </span>
                      <span className="shrink-0 border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--iris-ink-soft)]">
                        {kindLabel(item.kind)}
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-[color:var(--iris-ink-soft)]">
                      {[item.code, missingLabel(item, t), pricesLabel(item)]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy} onClick={() => onOpenChange(false)}>
                {preview.length === 0
                  ? t("catalog.cleanup.confirm.close")
                  : t("catalog.cleanup.cancel")}
              </AlertDialogCancel>
              {preview.length === 0 ? (
                <AlertDialogAction
                  onClick={(event) => {
                    event.preventDefault();
                    setStep("options");
                  }}
                  disabled={busy}
                >
                  {t("catalog.cleanup.back")}
                </AlertDialogAction>
              ) : (
                <AlertDialogAction
                  onClick={(event) => {
                    event.preventDefault();
                    void runCleanup();
                  }}
                  disabled={busy}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("catalog.cleanup.action", { count: preview.length })
                  )}
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Says which price the item is missing, so the list justifies each deletion. */
function missingLabel(item: CatalogItem, t: (key: string) => string): string {
  if (item.purchasePrice === null && item.salePrice === null) {
    return t("catalog.cleanup.confirm.noPrices");
  }
  return item.purchasePrice === null
    ? t("catalog.cleanup.confirm.noPurchase")
    : t("catalog.cleanup.confirm.noSale");
}

/** Shows the price the item does have, if any, so nothing is deleted blind. */
function pricesLabel(item: CatalogItem): string {
  if (item.purchasePrice !== null) return formatCatalogPrice(item.purchasePrice);
  if (item.salePrice !== null) return formatCatalogPrice(item.salePrice);
  return "";
}

export default CatalogCleanupDialog;
