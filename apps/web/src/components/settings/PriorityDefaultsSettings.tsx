import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Flag, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrganization } from "@/hooks/useOrganization";
import { getWorkOrderPriorityLabel } from "@/shared/utils/work-orders";
import type { PriorityDefaults } from "@/types/settings";
import type { WorkOrderPriority } from "@/types/work-order";

// The priorities the shop can pick as its default. Kept in sync with the enum
// the API accepts for priorityDefaults.priority.
const PRIORITIES: WorkOrderPriority[] = ["low", "normal", "high", "urgent"];

function defaultsEqual(a: PriorityDefaults, b: PriorityDefaults): boolean {
  return a.priority === b.priority && a.allowOverride === b.allowOverride;
}

/**
 * Admin-only editor for the work-order priority (prioritet): the priority new
 * orders start with and whether operators may change it per order. Persists
 * shop-wide via the organization settings endpoint.
 */
export function PriorityDefaultsSettings(): React.JSX.Element {
  const { t } = useTranslation();
  const { priorityDefaults, setPriorityDefaults } = useOrganization();
  const [draft, setDraft] = useState<PriorityDefaults>(priorityDefaults);
  const [saving, setSaving] = useState(false);
  const dirty = !defaultsEqual(draft, priorityDefaults);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const saved = await window.api.updateSettings({ priorityDefaults: draft });
      setPriorityDefaults(saved.priorityDefaults);
      setDraft(saved.priorityDefaults);
      toast.success(t("settings.priority.saved"));
    } catch (error) {
      toast.error(
        error instanceof Error && error.message.trim() !== ""
          ? `${t("settings.priority.saveErrorPrefix")}: ${error.message}`
          : t("settings.priority.saveError"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <Flag size={16} className="text-[color:var(--iris-accent)]" />
        <div>
          <div className="text-[13px] font-medium text-foreground">
            {t("settings.priority.title")}
          </div>
          <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
            {t("settings.priority.hint")}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="priority-default"
            className="text-[13px] font-medium text-foreground"
          >
            {t("settings.priority.priority")}
          </label>
          <Select
            value={draft.priority}
            onValueChange={(value) =>
              setDraft((prev) => ({
                ...prev,
                priority: value as WorkOrderPriority,
              }))
            }
          >
            <SelectTrigger id="priority-default">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {getWorkOrderPriorityLabel(priority)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="iris-focusable group flex cursor-pointer items-center justify-between gap-3 border-t border-border pt-4">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-foreground">
              {t("settings.priority.allowOverride")}
            </div>
            <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
              {t("settings.priority.allowOverrideHint")}
            </div>
          </div>
          <Checkbox
            checked={draft.allowOverride}
            onCheckedChange={(checked) =>
              setDraft((prev) => ({ ...prev, allowOverride: checked === true }))
            }
            aria-label={t("settings.priority.allowOverride")}
          />
        </label>
      </div>

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
