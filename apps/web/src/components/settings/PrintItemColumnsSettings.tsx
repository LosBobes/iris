import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Columns3, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useOrganization } from "@/hooks/useOrganization";
import {
  normalizePrintItemColumns,
  type PrintItemColumn,
} from "@/types/settings";
import { printItemColumnLabel } from "@/components/WorkOrders/WorkOrderPrintSheet";

/** Moves one column one slot up (-1) or down (+1), or returns the list as-is
 *  when the move would fall off either end. */
function moveColumn(
  columns: PrintItemColumn[],
  index: number,
  offset: -1 | 1,
): PrintItemColumn[] {
  const target = index + offset;
  if (target < 0 || target >= columns.length) return columns;
  const next = [...columns];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Admin-only reordering of the numeric columns in the work-order printout's
 * "stavke" table. The item name always leads the row, so only quantity, price,
 * and total move. Persists shop-wide via organization settings, so the
 * server-generated PDF follows the same order as the on-screen printout.
 */
export function PrintItemColumnsSettings(): React.JSX.Element {
  const { t } = useTranslation();
  const { printItemColumns, setPrintItemColumns } = useOrganization();
  const saved = normalizePrintItemColumns(printItemColumns);
  const [draft, setDraft] = useState<PrintItemColumn[]>(saved);
  const [saving, setSaving] = useState(false);
  const dirty = draft.some((column, index) => column !== saved[index]);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const result = await window.api.updateSettings({
        printItemColumns: draft,
      });
      const next = normalizePrintItemColumns(result.printItemColumns);
      setPrintItemColumns(next);
      setDraft(next);
      toast.success(t("settings.printItemColumns.saved"));
    } catch (error) {
      toast.error(
        error instanceof Error && error.message.trim() !== ""
          ? `${t("settings.printItemColumns.saveErrorPrefix")}: ${error.message}`
          : t("settings.printItemColumns.saveError"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <Columns3 size={16} className="text-[color:var(--iris-accent)]" />
        <div>
          <div className="text-[13px] font-medium text-foreground">
            {t("settings.printItemColumns.title")}
          </div>
          <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
            {t("settings.printItemColumns.hint")}
          </div>
        </div>
      </div>

      {/* Preview of the printed header row, so the effect of a move is visible
          without opening a nalog. */}
      <div className="border-b border-border px-5 py-3">
        <div className="text-[10px] font-medium uppercase tracking-[0.6px] text-[color:var(--iris-ink-mute)]">
          {t("settings.printItemColumns.preview")}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-foreground">
          <span className="border border-dashed border-border px-2 py-0.5 text-[color:var(--iris-ink-soft)]">
            {t("workOrders.print.itemsTable.name")}
          </span>
          {draft.map((column) => (
            <span key={column} className="border border-border px-2 py-0.5">
              {printItemColumnLabel(column)}
            </span>
          ))}
        </div>
      </div>

      <ol className="divide-y divide-border">
        {draft.map((column, index) => (
          <li
            key={column}
            className="flex items-center justify-between gap-3 px-5 py-3"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="tnum text-[11px] text-[color:var(--iris-ink-mute)]">
                {index + 1}.
              </span>
              <span className="text-[13px] font-medium text-foreground">
                {printItemColumnLabel(column)}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label={t("settings.printItemColumns.moveUp", {
                  column: printItemColumnLabel(column),
                })}
                disabled={index === 0}
                onClick={() => setDraft((prev) => moveColumn(prev, index, -1))}
                className="iris-focusable iris-press flex h-7 w-7 items-center justify-center border border-border text-[color:var(--iris-ink-mute)] hover:bg-muted hover:text-foreground disabled:opacity-30"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={t("settings.printItemColumns.moveDown", {
                  column: printItemColumnLabel(column),
                })}
                disabled={index === draft.length - 1}
                onClick={() => setDraft((prev) => moveColumn(prev, index, 1))}
                className="iris-focusable iris-press flex h-7 w-7 items-center justify-center border border-border text-[color:var(--iris-ink-mute)] hover:bg-muted hover:text-foreground disabled:opacity-30"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex justify-end border-t border-border px-5 py-4">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="iris-focusable iris-press inline-flex items-center justify-center gap-2 bg-foreground px-4 py-2 text-[12px] font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {t("common.save")}
        </button>
      </div>
    </section>
  );
}
