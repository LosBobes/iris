import { useEffect, useMemo, useRef, useState } from "react";
import {
  parse,
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
} from "date-fns";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  filtersFromSearchParams,
  filtersToSearchParams,
  type WorkOrdersFiltersState,
} from "@/hooks/useWorkOrders";
import { Search, X, ChevronDown, Check, Columns3, Bookmark, Trash2 } from "lucide-react";
import {
  addSavedView,
  readSavedViews,
  removeSavedView,
  type SavedView,
} from "@/lib/saved-views";
import {
  getWorkOrderStatusLabel,
  WORK_ORDER_STATUS_ORDER,
} from "@/shared/utils/work-orders";
import { useColumnVisibility } from "@/hooks/useColumnVisibility";
import {
  WORK_ORDER_COLUMNS,
  isColumnLocked,
} from "@/lib/work-order-columns";

interface WorkOrdersFiltersProps {
  filters: WorkOrdersFiltersState;
  updateFilters: (patch: Partial<WorkOrdersFiltersState>) => void;
  resetFilters: () => void;
}

const STATUS_OPTIONS: Array<{ value: WorkOrdersFiltersState["status"]; label: string }> = [
  { value: "all", label: "Svi statusi" },
  ...WORK_ORDER_STATUS_ORDER.map((status) => ({
    value: status,
    label: getWorkOrderStatusLabel(status),
  })),
];

const BILLING_OPTIONS: Array<{
  value: WorkOrdersFiltersState["billingDocumentType"];
  label: string;
}> = [
  { value: "all", label: "Svi tipovi" },
  { value: "invoice", label: "Faktura" },
  { value: "cashCollection", label: "Gotovinski račun" },
  { value: "proforma", label: "Profaktura" },
];

const DELIVERY_OPTIONS: Array<{
  value: WorkOrdersFiltersState["deliveryMethod"];
  label: string;
}> = [
  { value: "all", label: "Sve dostave" },
  { value: "pickup", label: "Lično preuzimanje" },
  { value: "postExpress", label: "Post Express" },
  { value: "cityExpress", label: "City Express" },
  { value: "fieldVisit", label: "Terenski obilazak" },
];

const QUEUE_OPTIONS: Array<{
  value: WorkOrdersFiltersState["queue"];
  label: string;
}> = [
  { value: "all", label: "Svi redovi" },
  { value: "unassigned", label: "Nedodeljeni" },
  { value: "overdue", label: "Kasne" },
  { value: "today", label: "Danas" },
  { value: "thisWeek", label: "Ove nedelje" },
];

interface FilterPillProps {
  label: string;
  isActive: boolean;
  children: React.ReactNode;
}

function FilterPill({ label, isActive, children }: FilterPillProps): React.JSX.Element {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`iris-focusable iris-press group flex items-center gap-2 border bg-card px-3 py-2 text-[12px] hover:bg-black/[0.02] ${
            isActive
              ? "border-foreground/40 font-medium text-foreground"
              : "border-border text-[color:var(--iris-ink-soft)] hover:text-foreground"
          }`}
        >
          {isActive && (
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-[color:var(--iris-accent)]"
            />
          )}
          {label}
          <ChevronDown className="h-3 w-3 text-[color:var(--iris-ink-faint)] transition-transform duration-200 ease-out group-aria-expanded:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 rounded-none border-border p-1" align="start">
        {children}
      </PopoverContent>
    </Popover>
  );
}

interface OptionListProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  current: T;
  onSelect: (value: T) => void;
}

function OptionList<T extends string>({
  options,
  current,
  onSelect,
}: OptionListProps<T>): React.JSX.Element {
  return (
    <div className="flex flex-col">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(opt.value)}
          className={`iris-focusable bg-transparent px-3 py-2 text-left text-[12px] hover:bg-black/[0.03] ${
            opt.value === current
              ? "font-medium text-foreground"
              : "text-[color:var(--iris-ink-soft)]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function isoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

// Quick date-range presets. Weeks start Monday (Serbian convention).
const DATE_PRESETS: Array<{ label: string; getRange: () => { from: string; to: string } }> = [
  {
    label: "Danas",
    getRange: () => {
      const today = isoDate(new Date());
      return { from: today, to: today };
    },
  },
  {
    label: "Ova nedelja",
    getRange: () => {
      const now = new Date();
      return {
        from: isoDate(startOfWeek(now, { weekStartsOn: 1 })),
        to: isoDate(endOfWeek(now, { weekStartsOn: 1 })),
      };
    },
  },
  {
    label: "Ovaj mesec",
    getRange: () => {
      const now = new Date();
      return { from: isoDate(startOfMonth(now)), to: isoDate(endOfMonth(now)) };
    },
  },
  {
    label: "Prošli mesec",
    getRange: () => {
      const prev = subMonths(new Date(), 1);
      return {
        from: isoDate(startOfMonth(prev)),
        to: isoDate(endOfMonth(prev)),
      };
    },
  },
];

function DateRangePresetsPill({
  onSelect,
}: {
  onSelect: (range: { from: string; to: string }) => void;
}): React.JSX.Element {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="iris-focusable iris-press group flex items-center gap-2 border border-border bg-card px-3 py-2 text-[12px] text-[color:var(--iris-ink-soft)] hover:bg-black/[0.02] hover:text-foreground"
        >
          Brzi opseg
          <ChevronDown className="h-3 w-3 text-[color:var(--iris-ink-faint)] transition-transform duration-200 ease-out group-aria-expanded:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 rounded-none border-border p-1" align="start">
        <div className="flex flex-col">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onSelect(preset.getRange())}
              className="iris-focusable bg-transparent px-3 py-2 text-left text-[12px] text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SavedViewsPill({
  filters,
  onApply,
}: {
  filters: WorkOrdersFiltersState;
  onApply: (next: WorkOrdersFiltersState) => void;
}): React.JSX.Element {
  const [views, setViews] = useState<SavedView[]>(() => readSavedViews());
  const [name, setName] = useState("");

  const currentQuery = useMemo(
    () => filtersToSearchParams(filters).toString(),
    [filters],
  );
  const activeViewId = views.find((view) => view.query === currentQuery)?.id;

  const handleSave = () => {
    if (name.trim() === "") return;
    setViews(addSavedView(name, currentQuery));
    setName("");
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`iris-focusable iris-press group flex items-center gap-2 border bg-card px-3 py-2 text-[12px] hover:bg-black/[0.02] ${
            activeViewId
              ? "border-foreground/40 font-medium text-foreground"
              : "border-border text-[color:var(--iris-ink-soft)] hover:text-foreground"
          }`}
        >
          <Bookmark className="h-3 w-3 text-[color:var(--iris-ink-faint)]" />
          Pogledi
          <ChevronDown className="h-3 w-3 text-[color:var(--iris-ink-faint)] transition-transform duration-200 ease-out group-aria-expanded:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 rounded-none border-border p-1" align="start">
        <div className="px-3 py-2 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
          Sačuvani pogledi
        </div>
        <div className="flex flex-col">
          {views.length === 0 && (
            <div className="px-3 py-2 text-[12px] text-[color:var(--iris-ink-faint)]">
              Još nema sačuvanih pogleda.
            </div>
          )}
          {views.map((view) => (
            <div
              key={view.id}
              className={`group/view flex items-center gap-2 px-1 ${
                view.id === activeViewId ? "bg-black/[0.03]" : ""
              }`}
            >
              <button
                type="button"
                onClick={() =>
                  onApply(
                    filtersFromSearchParams(new URLSearchParams(view.query)),
                  )
                }
                className="iris-focusable flex-1 bg-transparent px-2 py-2 text-left text-[12px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
              >
                {view.name}
              </button>
              <button
                type="button"
                aria-label={`Obriši pogled ${view.name}`}
                onClick={() => setViews(removeSavedView(view.id))}
                className="iris-focusable iris-press shrink-0 bg-transparent p-1.5 text-[color:var(--iris-ink-faint)] opacity-0 transition-opacity group-hover/view:opacity-100 hover:text-[color:var(--iris-status-cancelled)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-1 flex items-center gap-1.5 border-t border-border p-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
            }}
            placeholder="Sačuvaj trenutne filtere…"
            className="w-full border border-border bg-card px-2 py-1.5 text-[12px] text-foreground placeholder:text-[color:var(--iris-ink-mute)] focus:border-foreground focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={name.trim() === ""}
            className="iris-focusable iris-press shrink-0 bg-foreground px-2.5 py-1.5 text-[11px] font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Sačuvaj
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ColumnsPill(): React.JSX.Element {
  const { isVisible, toggleColumn, resetColumns, visibleColumns } =
    useColumnVisibility();
  // Locked columns are always on, so "all visible" means every non-locked
  // column is shown too.
  const allVisible = visibleColumns.length === WORK_ORDER_COLUMNS.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="iris-focusable iris-press group flex items-center gap-2 border border-border bg-card px-3 py-2 text-[12px] text-[color:var(--iris-ink-soft)] hover:bg-black/[0.02] hover:text-foreground"
        >
          <Columns3 className="h-3 w-3 text-[color:var(--iris-ink-faint)]" />
          Polja
          <ChevronDown className="h-3 w-3 text-[color:var(--iris-ink-faint)] transition-transform duration-200 ease-out group-aria-expanded:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 rounded-none border-border p-1" align="start">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            Prikazana polja
          </span>
          {!allVisible && (
            <button
              type="button"
              onClick={resetColumns}
              className="iris-focusable text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
            >
              Sve
            </button>
          )}
        </div>
        <div className="flex flex-col">
          {WORK_ORDER_COLUMNS.map((col) => {
            const checked = isVisible(col.key);
            const locked = isColumnLocked(col.key);
            return (
              <button
                key={col.key}
                type="button"
                role="checkbox"
                aria-checked={checked}
                disabled={locked}
                onClick={() => toggleColumn(col.key)}
                className="iris-focusable flex items-center gap-2.5 bg-transparent px-3 py-2 text-left text-[12px] text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span
                  aria-hidden
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
                    checked
                      ? "border-[color:var(--iris-accent)] bg-[color:var(--iris-accent)] text-white"
                      : "border-[color:var(--iris-ink-faint)] text-transparent"
                  }`}
                >
                  <Check size={11} strokeWidth={3} />
                </span>
                <span className={checked ? "text-foreground" : undefined}>
                  {col.label}
                </span>
                {locked && (
                  <span className="ml-auto text-[10px] text-[color:var(--iris-ink-faint)]">
                    obavezno
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function WorkOrdersFilters({
  filters,
  updateFilters,
  resetFilters,
}: WorkOrdersFiltersProps): React.JSX.Element {
  const { isVisible } = useColumnVisibility();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // "/" focuses search from anywhere on the page (unless typing in a field).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const hasActiveFilters =
    filters.search !== "" ||
    filters.status !== "all" ||
    filters.billingDocumentType !== "all" ||
    filters.deliveryMethod !== "all" ||
    filters.queue !== "all" ||
    filters.customerId !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === filters.status)?.label ?? "Svi statusi";
  const billingLabel =
    BILLING_OPTIONS.find((o) => o.value === filters.billingDocumentType)?.label ??
    "Svi tipovi";
  const deliveryLabel =
    DELIVERY_OPTIONS.find((o) => o.value === filters.deliveryMethod)?.label ??
    "Sve dostave";
  const queueLabel =
    QUEUE_OPTIONS.find((o) => o.value === filters.queue)?.label ?? "Svi redovi";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="group relative flex min-w-[220px] flex-1 items-center gap-2 border border-border bg-card px-3 py-2 transition-colors duration-150 focus-within:border-foreground">
        <Search className="h-3 w-3 text-[color:var(--iris-ink-mute)] transition-colors duration-150 group-focus-within:text-foreground" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Pretraži po nalogu, klijentu, opisu, operateru, ceni…"
          value={filters.search}
          onChange={(e) => updateFilters({ search: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Escape" && filters.search !== "") {
              e.stopPropagation();
              updateFilters({ search: "" });
            }
          }}
          className="w-full border-none bg-transparent text-[12px] text-foreground placeholder:text-[color:var(--iris-ink-mute)] focus:outline-none"
        />
        {filters.search !== "" ? (
          <button
            type="button"
            aria-label="Obriši pretragu"
            onClick={() => {
              updateFilters({ search: "" });
              searchInputRef.current?.focus();
            }}
            className="iris-focusable iris-press shrink-0 bg-transparent p-0.5 text-[color:var(--iris-ink-mute)] hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        ) : (
          <kbd className="hidden shrink-0 border border-[color:var(--iris-border-soft)] px-1.5 py-px font-sans text-[10px] text-[color:var(--iris-ink-faint)] sm:inline-block">
            /
          </kbd>
        )}
      </div>

      {isVisible("status") && (
        <FilterPill label={statusLabel} isActive={filters.status !== "all"}>
          <OptionList
            options={STATUS_OPTIONS}
            current={filters.status}
            onSelect={(value) => updateFilters({ status: value })}
          />
        </FilterPill>
      )}

      {isVisible("billing") && (
        <FilterPill
          label={billingLabel}
          isActive={filters.billingDocumentType !== "all"}
        >
          <OptionList
            options={BILLING_OPTIONS}
            current={filters.billingDocumentType}
            onSelect={(value) => updateFilters({ billingDocumentType: value })}
          />
        </FilterPill>
      )}

      <FilterPill
        label={deliveryLabel}
        isActive={filters.deliveryMethod !== "all"}
      >
        <OptionList
          options={DELIVERY_OPTIONS}
          current={filters.deliveryMethod}
          onSelect={(value) => updateFilters({ deliveryMethod: value })}
        />
      </FilterPill>

      <FilterPill label={queueLabel} isActive={filters.queue !== "all"}>
        <OptionList
          options={QUEUE_OPTIONS}
          current={filters.queue}
          onSelect={(value) => updateFilters({ queue: value })}
        />
      </FilterPill>

      <SavedViewsPill filters={filters} onApply={updateFilters} />

      <ColumnsPill />

      <DateRangePresetsPill
        onSelect={(range) =>
          updateFilters({ dateFrom: range.from, dateTo: range.to })
        }
      />

      <div className="flex items-center gap-1.5 border border-border bg-card px-3 py-1">
        <DatePicker
          value={filters.dateFrom || null}
          onChange={(v) => updateFilters({ dateFrom: v ?? "" })}
          placeholder="Od datuma"
          toDate={
            filters.dateTo
              ? parse(filters.dateTo, "yyyy-MM-dd", new Date())
              : undefined
          }
        />
        <span className="text-[color:var(--iris-ink-faint)]">-</span>
        <DatePicker
          value={filters.dateTo || null}
          onChange={(v) => updateFilters({ dateTo: v ?? "" })}
          placeholder="Do datuma"
          fromDate={
            filters.dateFrom
              ? parse(filters.dateFrom, "yyyy-MM-dd", new Date())
              : undefined
          }
        />
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={resetFilters}
          className="iris-focusable iris-press animate-iris-fade flex items-center gap-1 bg-transparent px-2 py-2 text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
        >
          <X className="h-3 w-3" />
          Resetuj
        </button>
      )}
    </div>
  );
}
