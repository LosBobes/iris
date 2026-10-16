import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { getOverlayContainer } from "@/lib/overlay-container";
import { cn } from "@/lib/utils";
import {
  parseLineItemsFromText,
  type ParsedLineItem,
} from "@/shared/utils/description-items";
import type { InvoiceLineItemKind } from "@/types/work-order";

export interface TextImportLine extends ParsedLineItem {
  kind: InvoiceLineItemKind;
  unitPrice: number;
}

interface TextImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Text the dialog starts with, e.g. a product list typed into the opis posla. */
  initialText: string;
  /** Confirmed lines; the dialog closes itself after calling this. */
  onImport: (lines: TextImportLine[]) => void;
}

/**
 * Turns a pasted or typed product list ("Mango 20 kom - Kokos 10 kom") into
 * work-order stavke. The text is parsed live into an editable preview; the
 * operator fixes any misread name or quantity, sets one shared kind and unit
 * price (these lists are usually variants of one product), and adds them all.
 */
export function TextImportDialog({
  open,
  onOpenChange,
  initialText,
  onImport,
}: TextImportDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const [text, setText] = useState(initialText);
  const [rows, setRows] = useState<ParsedLineItem[]>(() =>
    parseLineItemsFromText(initialText),
  );
  const [kind, setKind] = useState<InvoiceLineItemKind>("goods");
  const [unitPrice, setUnitPrice] = useState("");

  // Start from the caller's text each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setText(initialText);
    setRows(parseLineItemsFromText(initialText));
    setUnitPrice("");
  }, [open, initialText]);

  const handleTextChange = (value: string): void => {
    setText(value);
    setRows(parseLineItemsFromText(value));
  };

  const updateRow = (index: number, patch: Partial<ParsedLineItem>): void => {
    setRows((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  };

  const validRows = rows.filter(
    (row) => row.description.trim() && row.quantity > 0,
  );

  const handleImport = (): void => {
    const price = Number(unitPrice.replace(",", "."));
    onImport(
      validRows.map((row) => ({
        ...row,
        description: row.description.trim(),
        kind,
        unitPrice: Number.isFinite(price) && price > 0 ? price : 0,
      })),
    );
    onOpenChange(false);
  };

  const inputClass =
    "w-full border-0 border-b border-border bg-transparent py-1 text-[12px] text-foreground outline-none focus:border-foreground";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal container={getOverlayContainer()}>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 grid max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-3 overflow-y-auto rounded-none bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <DialogPrimitive.Title className="text-[13px] font-medium text-foreground">
            {t("workOrders.form.textImport.title")}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-[11px] text-[color:var(--iris-ink-mute)]">
            {t("workOrders.form.textImport.description")}
          </DialogPrimitive.Description>

          <textarea
            aria-label={t("workOrders.form.textImport.textLabel")}
            rows={4}
            value={text}
            onChange={(event) => handleTextChange(event.target.value)}
            placeholder={t("workOrders.form.textImport.placeholder")}
            className="w-full resize-y border border-border bg-background p-2 text-[12px] text-foreground outline-none focus:border-foreground"
          />

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <div className="mb-1 text-[11px] text-[color:var(--iris-ink-soft)]">
                {t("workOrders.form.textImport.kind")}
              </div>
              <div className="inline-flex border border-border" role="group">
                {(["goods", "service"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={kind === option}
                    onClick={() => setKind(option)}
                    className={cn(
                      "iris-focusable px-3 py-1 text-[11px]",
                      kind === option
                        ? "bg-foreground text-background"
                        : "bg-background text-foreground",
                    )}
                  >
                    {t(
                      option === "goods"
                        ? "workOrders.form.textImport.kindGoods"
                        : "workOrders.form.textImport.kindService",
                    )}
                  </button>
                ))}
              </div>
            </div>
            <label className="block w-40">
              <span className="mb-1 block text-[11px] text-[color:var(--iris-ink-soft)]">
                {t("workOrders.form.textImport.unitPrice")}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          {rows.length === 0 ? (
            <div className="border border-dashed border-border px-3 py-4 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
              {t("workOrders.form.textImport.empty")}
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[1px] text-[color:var(--iris-ink-mute)]">
                  <th className="w-8 py-1 font-normal">#</th>
                  <th className="py-1 font-normal">{t("workOrders.form.colDescription")}</th>
                  <th className="w-20 py-1 font-normal">{t("workOrders.form.colQuantity")}</th>
                  <th className="w-14 py-1 font-normal">{t("workOrders.form.colUnit")}</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className="border-t border-border">
                    <td className="py-1 text-[color:var(--iris-ink-mute)]">{index + 1}</td>
                    <td className="py-1 pr-3">
                      <input
                        aria-label={t("workOrders.form.colDescription")}
                        value={row.description}
                        onChange={(event) =>
                          updateRow(index, { description: event.target.value })
                        }
                        className={inputClass}
                      />
                    </td>
                    <td className="py-1 pr-3">
                      <input
                        aria-label={t("workOrders.form.colQuantity")}
                        type="number"
                        min={0}
                        step="any"
                        value={row.quantity}
                        onChange={(event) =>
                          updateRow(index, { quantity: Number(event.target.value) })
                        }
                        className={inputClass}
                      />
                    </td>
                    <td className="py-1">{t(`workOrders.unit.${row.unit}`)}</td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        aria-label={t("workOrders.form.textImport.removeRow")}
                        onClick={() =>
                          setRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))
                        }
                        className="iris-focusable p-1 text-[color:var(--iris-ink-mute)] hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="iris-focusable iris-press border border-border bg-background px-3 py-1.5 text-[11px] text-foreground hover:border-foreground"
              >
                {t("workOrders.form.textImport.cancel")}
              </button>
            </DialogPrimitive.Close>
            <button
              type="button"
              disabled={validRows.length === 0}
              onClick={handleImport}
              className="iris-focusable iris-press border border-foreground bg-foreground px-3 py-1.5 text-[11px] text-background disabled:opacity-50"
            >
              {t("workOrders.form.textImport.confirm", { count: validRows.length })}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
