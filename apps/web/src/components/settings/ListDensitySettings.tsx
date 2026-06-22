import { Check, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useListPreferences } from "@/hooks/useListPreferences";
import { DENSITY_OPTIONS } from "@/lib/list-preferences";
import { PAGE_SIZE_OPTIONS, type PageSize } from "@/hooks/useWorkOrders";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ListDensitySettings(): React.JSX.Element {
  const { density, setDensity, defaultPageSize, setDefaultPageSize } =
    useListPreferences();

  return (
    <section className="max-w-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <Rows3 size={16} className="text-[color:var(--iris-accent)]" />
        <div>
          <div className="text-[13px] font-medium text-foreground">
            Lista radnih naloga
          </div>
          <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
            Gustina prikaza i podrazumevani broj redova
          </div>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label="Gustina liste"
        className="grid gap-2 p-5 sm:grid-cols-2"
      >
        {DENSITY_OPTIONS.map((option) => {
          const selected = option.value === density;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setDensity(option.value)}
              className={cn(
                "iris-focusable iris-press flex items-center justify-between gap-3 rounded-sm border px-4 py-3 text-left transition-all duration-200",
                selected
                  ? "border-[color:var(--iris-accent)] bg-black/[0.03]"
                  : "border-border hover:border-[color:var(--iris-ink-faint)] hover:bg-black/[0.02]",
              )}
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-foreground">
                  {option.label}
                </span>
                <span className="block text-[11px] text-[color:var(--iris-ink-soft)]">
                  {option.hint}
                </span>
              </span>
              <span
                aria-hidden
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-200",
                  selected
                    ? "border-[color:var(--iris-accent)] bg-[color:var(--iris-accent)] text-white"
                    : "border-[color:var(--iris-ink-faint)] text-transparent",
                )}
              >
                <Check size={12} strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
        <div>
          <div className="text-[13px] font-medium text-foreground">
            Redova po strani
          </div>
          <div className="text-[11px] text-[color:var(--iris-ink-soft)]">
            Primenjuje se kad otvorite listu bez izabrane veličine
          </div>
        </div>
        <Select
          value={String(defaultPageSize)}
          onValueChange={(value) =>
            setDefaultPageSize(Number(value) as PageSize)
          }
        >
          <SelectTrigger
            size="sm"
            className="h-8 w-20 rounded-none border-border text-[12px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}
