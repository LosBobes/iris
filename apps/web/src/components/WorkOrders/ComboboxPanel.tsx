import { useEffect, useId, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface ComboboxRow {
  id: string;
  label: string;
  sublabel?: string;
  selected: boolean;
  /** The "clear selection" row is styled as a secondary action. */
  isClear?: boolean;
  onChoose: () => void;
}

interface ComboboxPanelProps {
  listId: string;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  rows: ComboboxRow[];
  /** Whether to show the "no results" text below the rows. */
  showEmpty: boolean;
  emptyText: string;
  loading?: boolean;
}

/**
 * Shared popover body for the comboboxes: a search input that owns focus
 * (`role="combobox"` + `aria-activedescendant`) driving a `role="listbox"` of
 * `role="option"` rows, with arrow/Home/End/Enter keyboard support.
 */
export function ComboboxPanel({
  listId,
  search,
  onSearchChange,
  searchPlaceholder,
  rows,
  showEmpty,
  emptyText,
  loading = false,
}: ComboboxPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const baseId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const active = rows.length === 0 ? -1 : Math.min(activeIndex, rows.length - 1);
  const activeOptionId = active >= 0 ? `${baseId}-opt-${active}` : undefined;

  useEffect(() => {
    if (!activeOptionId) return;
    document.getElementById(activeOptionId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeOptionId]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (rows.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((active + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((active - 1 + rows.length) % rows.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(rows.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      rows[active]?.onChoose();
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search
          className="h-4 w-4 shrink-0 text-[color:var(--iris-ink-mute)]"
          aria-hidden="true"
        />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-label={t("combobox.searchAria")}
          value={search}
          onChange={(event) => {
            onSearchChange(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={searchPlaceholder}
          className="w-full bg-transparent text-[13px] text-foreground outline-none"
        />
        {loading && (
          <span role="status" aria-label={t("combobox.loading")} className="shrink-0">
            <Loader2 className="h-4 w-4 animate-spin opacity-60" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        <div id={listId} role="listbox" aria-busy={loading} aria-label={t("combobox.searchAria")}>
          {rows.map((row, index) => (
            <div
              key={row.id}
              id={`${baseId}-opt-${index}`}
              role="option"
              aria-selected={row.selected}
              onMouseEnter={() => setActiveIndex(index)}
              // Keep focus in the search input while clicking an option.
              onMouseDown={(event) => event.preventDefault()}
              onClick={row.onChoose}
              className={cn(
                "flex w-full cursor-pointer items-start justify-between gap-2 px-3 py-2 text-left",
                row.isClear && "items-center text-[12px] text-[color:var(--iris-ink-soft)]",
                index === active && "bg-[color:var(--iris-accent)]/10",
              )}
            >
              {row.isClear ? (
                row.label
              ) : (
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-foreground">{row.label}</span>
                  {row.sublabel && (
                    <span className="block truncate text-[11px] text-[color:var(--iris-ink-soft)]">
                      {row.sublabel}
                    </span>
                  )}
                </span>
              )}
              {row.selected && (
                <Check
                  className={cn("h-4 w-4 shrink-0", !row.isClear && "mt-0.5")}
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </div>
        {showEmpty && (
          <div className="px-3 py-6 text-center text-[12px] text-[color:var(--iris-ink-mute)]">
            {emptyText}
          </div>
        )}
      </div>
    </>
  );
}
