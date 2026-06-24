import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ComboboxItem {
  id: string;
  label: string;
  sublabel?: string;
  /** Optional source object, carried through so onSelect handlers can use it. */
  data?: unknown;
}

interface SearchableComboboxProps {
  items: ComboboxItem[];
  value: string | null;
  onSelect: (id: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Optional first row that clears the selection (e.g. "Novi klijent"). */
  clearLabel?: string;
  triggerId?: string;
  triggerClassName?: string;
  disabled?: boolean;
  /** Cap on rendered matches to keep large lists (thousands) responsive. */
  limit?: number;
}

function matches(item: ComboboxItem, term: string): boolean {
  const haystack = `${item.label} ${item.sublabel ?? ""}`.toLowerCase();
  return haystack.includes(term);
}

/**
 * A type-to-search dropdown for large lists (clients, catalog items). Filtering
 * is client-side and the rendered result set is capped via `limit` so a list of
 * thousands stays responsive. Built on the existing Popover primitive since the
 * project has no cmdk dependency.
 */
export function SearchableCombobox({
  items,
  value,
  onSelect,
  placeholder = "Izaberite stavku",
  searchPlaceholder = "Pretraga...",
  emptyText = "Nema rezultata.",
  clearLabel,
  triggerId,
  triggerClassName,
  disabled = false,
  limit = 50,
}: SearchableComboboxProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(
    () => items.find((item) => item.id === value) ?? null,
    [items, value],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const source = term === "" ? items : items.filter((item) => matches(item, term));
    return source.slice(0, limit);
  }, [items, search, limit]);

  const choose = (id: string | null): void => {
    onSelect(id);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={triggerId}
          disabled={disabled}
          className={cn(
            "iris-focusable flex w-full items-center justify-between gap-2 border-b border-border bg-transparent px-0 py-2 text-left text-[13px] text-foreground disabled:opacity-50",
            triggerClassName,
          )}
        >
          <span className={cn("truncate", selected ? "" : "text-[color:var(--iris-ink-mute)]")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-[color:var(--iris-ink-mute)]" />
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-transparent text-[13px] text-foreground outline-none"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {clearLabel && (
            <button
              type="button"
              onClick={() => choose(null)}
              className="iris-focusable flex w-full items-center justify-between px-3 py-2 text-left text-[12px] text-[color:var(--iris-ink-soft)] hover:bg-[color:var(--iris-accent)]/10"
            >
              {clearLabel}
              {value === null && <Check className="h-4 w-4" />}
            </button>
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
              {emptyText}
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => choose(item.id)}
                className="iris-focusable flex w-full items-start justify-between gap-2 px-3 py-2 text-left hover:bg-[color:var(--iris-accent)]/10"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-foreground">{item.label}</span>
                  {item.sublabel && (
                    <span className="block truncate text-[11px] text-[color:var(--iris-ink-soft)]">
                      {item.sublabel}
                    </span>
                  )}
                </span>
                {item.id === value && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
