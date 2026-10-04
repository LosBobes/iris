import { useEffect, useId, useRef, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ComboboxItem } from "./SearchableCombobox";
import { ComboboxPanel, type ComboboxRow } from "./ComboboxPanel";

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
  placeholder: placeholderProp,
  searchPlaceholder,
  emptyText,
  clearLabel,
  onClear,
  resetAfterSelect = false,
  triggerId,
  triggerClassName,
  disabled = false,
}: AsyncComboboxProps): React.JSX.Element {
  const { t } = useTranslation();
  const listId = useId();
  const placeholder = placeholderProp ?? t("combobox.placeholder");
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

  const rows: ComboboxRow[] = [
    ...(clearLabel
      ? [
          {
            id: "__clear",
            label: clearLabel,
            selected: false,
            isClear: true,
            onChoose: () => {
              const typed = term.trim();
              choose(null);
              onClear?.(typed);
            },
          },
        ]
      : []),
    ...results.map((item) => ({
      id: item.id,
      label: item.label,
      sublabel: item.sublabel,
      selected: !resetAfterSelect && item.label === selectedLabel,
      onChoose: () => choose(item),
    })),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={triggerId}
          disabled={disabled}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          className={cn(
            "iris-focusable flex w-full items-center justify-between gap-2 border-b border-border bg-transparent px-0 py-2 text-left text-[13px] text-foreground disabled:opacity-50",
            triggerClassName,
          )}
        >
          <span className={cn("truncate", hasSelection ? "" : "text-[color:var(--iris-ink-mute)]")}>
            {triggerLabel}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <ComboboxPanel
          listId={listId}
          search={term}
          onSearchChange={setTerm}
          searchPlaceholder={searchPlaceholder ?? t("combobox.searchPlaceholder")}
          rows={rows}
          showEmpty={!loading && results.length === 0}
          emptyText={emptyText ?? t("combobox.empty")}
          loading={loading}
        />
      </PopoverContent>
    </Popover>
  );
}
