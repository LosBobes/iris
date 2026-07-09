import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ComboboxItem } from "./SearchableCombobox";

interface AsyncComboboxProps {
  /** Label for the current selection (it may not be in the latest results). */
  selectedLabel: string | null;
  /** Debounced server-side search; receives the trimmed term ("" on open). */
  onSearch: (term: string) => Promise<ComboboxItem[]>;
  onSelect: (item: ComboboxItem | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Optional first row that clears the selection (e.g. "Novi klijent"). */
  clearLabel?: string;
  /** Called when the clear row is chosen, with the trimmed search term so the
   * caller can keep a freely-typed value (e.g. a one-off client name). */
  onClear?: (term: string) => void;
  /** When true, the trigger never shows a persistent selection (use for an
   * "add" picker that keeps adding items rather than holding one value). */
  resetAfterSelect?: boolean;
  triggerId?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

/**
 * A type-to-search dropdown backed by an async (server-side) query, for lists
 * too large to load into the client — catalog items, clients. Filtering and
 * paging happen on the server; input is debounced.
 */
export function AsyncCombobox({
  selectedLabel,
  onSearch,
  onSelect,
  placeholder = "Izaberite stavku",
  searchPlaceholder = "Pretraga...",
  emptyText = "Nema rezultata.",
  clearLabel,
  onClear,
  resetAfterSelect = false,
  triggerId,
  triggerClassName,
  disabled = false,
}: AsyncComboboxProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ComboboxItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Keep the latest onSearch without retriggering the effect each render, and
  // use a request id to drop out-of-order responses.
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  const requestId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    setLoading(true);
    const handle = setTimeout(() => {
      onSearchRef
        .current(term.trim())
        .then((items) => {
          if (requestId.current === id) {
            setResults(items);
            setLoading(false);
          }
        })
        .catch(() => {
          if (requestId.current === id) {
            setResults([]);
            setLoading(false);
          }
        });
    }, 220);
    return () => clearTimeout(handle);
  }, [open, term]);

  const choose = (item: ComboboxItem | null): void => {
    onSelect(item);
    setOpen(false);
    setTerm("");
  };

  const triggerLabel = resetAfterSelect ? placeholder : (selectedLabel ?? placeholder);
  const hasSelection = !resetAfterSelect && selectedLabel !== null;

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
          <span className={cn("truncate", hasSelection ? "" : "text-[color:var(--iris-ink-mute)]")}>
            {triggerLabel}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-[color:var(--iris-ink-mute)]" />
          <input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-transparent text-[13px] text-foreground outline-none"
          />
          {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-60" />}
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {clearLabel && (
            <button
              type="button"
              onClick={() => {
                const typed = term.trim();
                choose(null);
                onClear?.(typed);
              }}
              className="iris-focusable flex w-full items-center px-3 py-2 text-left text-[12px] text-[color:var(--iris-ink-soft)] hover:bg-[color:var(--iris-accent)]/10"
            >
              {clearLabel}
            </button>
          )}
          {!loading && results.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
              {emptyText}
            </div>
          ) : (
            results.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => choose(item)}
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
                {!resetAfterSelect && item.label === selectedLabel && (
                  <Check className="mt-0.5 h-4 w-4 shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
