import { useId, useMemo, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ComboboxPanel, type ComboboxRow } from "./ComboboxPanel";

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
  placeholder,
  searchPlaceholder,
  emptyText,
  clearLabel,
  triggerId,
  triggerClassName,
  disabled = false,
  limit = 50,
}: SearchableComboboxProps): React.JSX.Element {
  const { t } = useTranslation();
  const listId = useId();
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

  const rows: ComboboxRow[] = [
    ...(clearLabel
      ? [
          {
            id: "__clear",
            label: clearLabel,
            selected: value === null,
            isClear: true,
            onChoose: () => choose(null),
          },
        ]
      : []),
    ...filtered.map((item) => ({
      id: item.id,
      label: item.label,
      sublabel: item.sublabel,
      selected: item.id === value,
      onChoose: () => choose(item.id),
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
          <span className={cn("truncate", selected ? "" : "text-[color:var(--iris-ink-mute)]")}>
            {selected ? selected.label : (placeholder ?? t("combobox.placeholder"))}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <ComboboxPanel
          listId={listId}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={searchPlaceholder ?? t("combobox.searchPlaceholder")}
          rows={rows}
          showEmpty={filtered.length === 0}
          emptyText={emptyText ?? t("combobox.empty")}
        />
      </PopoverContent>
    </Popover>
  );
}
