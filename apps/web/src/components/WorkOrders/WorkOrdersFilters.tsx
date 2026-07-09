import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
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
  columnLabel,
  isColumnLocked,
} from "@/lib/work-order-columns";

interface WorkOrdersFiltersProps {
  filters: WorkOrdersFiltersState;
  updateFilters: (patch: Partial<WorkOrdersFiltersState>) => void;
  resetFilters: () => void;
}

// Option value lists; labels are resolved via i18n at render time.
const BILLING_VALUES: Array<WorkOrdersFiltersState["billingDocumentType"]> = [
  "invoice",
  "cashCollection",
  "proforma",
];

const DELIVERY_VALUES: Array<WorkOrdersFiltersState["deliveryMethod"]> = [
  "pickup",
  "postExpress",
  "cityExpress",
  "fieldVisit",
];

const QUEUE_VALUES: Array<Exclude<WorkOrdersFiltersState["queue"], "all">> = [
  "unassigned",
  "overdue",
  "today",
  "thisWeek",
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

// Quick date-range presets. Weeks start Monday (Serbian convention). Labels are
// resolved via i18n (workOrders.filters.presets.<key>) at render time.
const DATE_PRESETS: Array<{
  key: "today" | "thisWeek" | "thisMonth" | "lastMonth";
  getRange: () => { from: string; to: string };
}> = [
  {
    key: "today",
    getRange: () => {
      const today = isoDate(new Date());
      return { from: today, to: today };
    },
  },
  {
    key: "thisWeek",
    getRange: () => {
      const now = new Date();
      return {
        from: isoDate(startOfWeek(now, { weekStartsOn: 1 })),
        to: isoDate(endOfWeek(now, { weekStartsOn: 1 })),
      };
    },
  },
  {
    key: "thisMonth",
    getRange: () => {
      const now = new Date();
      return { from: isoDate(startOfMonth(now)), to: isoDate(endOfMonth(now)) };
    },
  },
  {
    key: "lastMonth",
    getRange: () => {
      const prev = subMonths(new Date(), 1);
      return {
        from: isoDate(startOfMonth(prev)),
        to: isoDate(endOfMonth(prev)),
      };
    },
  },
];

/** Compact DD.MM. label for a range trigger, e.g. "12.03." */
function shortDmy(iso: string): string {
  return format(parse(iso, "yyyy-MM-dd", new Date()), "dd.MM.");
}

/**
 * Unified date-range control: quick presets plus explicit from/to pickers in a
 * single popover, so date filtering reads as one coherent pill alongside the
 * other filters instead of a separate preset button and a floating field box.
 */
function DateRangePill({
  dateFrom,
  dateTo,
  onChange,
}: {
  dateFrom: string;
  dateTo: string;
  onChange: (patch: { dateFrom?: string; dateTo?: string }) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const isActive = dateFrom !== "" || dateTo !== "";

  // Active-range label shown on the trigger.
  let label = t("workOrders.filters.date");
  if (dateFrom && dateTo) {
    label =
      dateFrom === dateTo
        ? shortDmy(dateFrom)
        : `${shortDmy(dateFrom)} – ${shortDmy(dateTo)}`;
  } else if (dateFrom) {
    label = t("workOrders.filters.rangeFrom", { date: shortDmy(dateFrom) });
  } else if (dateTo) {
    label = t("workOrders.filters.rangeTo", { date: shortDmy(dateTo) });
  }

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
      <PopoverContent className="w-64 rounded-none border-border p-0" align="start">
        <div className="grid grid-cols-2 gap-1 border-b border-border p-2">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => {
                const range = preset.getRange();
                onChange({ dateFrom: range.from, dateTo: range.to });
              }}
              className="iris-focusable iris-press border border-border bg-transparent px-2 py-1.5 text-center text-[12px] text-[color:var(--iris-ink-soft)] hover:bg-black/[0.03] hover:text-foreground"
            >
              {t(`workOrders.filters.presets.${preset.key}`)}
            </button>
          ))}
        </div>
        <div className="space-y-2 p-2">
          <label className="flex items-center justify-between gap-2 text-[11px] text-[color:var(--iris-ink-soft)]">
            <span className="w-6 shrink-0">{t("workOrders.filters.from")}</span>
            <DatePicker
              value={dateFrom || null}
              onChange={(v) => onChange({ dateFrom: v ?? "" })}
              placeholder={t("workOrders.filters.dateFrom")}
              className="flex-1"
              toDate={dateTo ? parse(dateTo, "yyyy-MM-dd", new Date()) : undefined}
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-[11px] text-[color:var(--iris-ink-soft)]">
            <span className="w-6 shrink-0">{t("workOrders.filters.to")}</span>
            <DatePicker
              value={dateTo || null}
              onChange={(v) => onChange({ dateTo: v ?? "" })}
              placeholder={t("workOrders.filters.dateTo")}
              className="flex-1"
              fromDate={dateFrom ? parse(dateFrom, "yyyy-MM-dd", new Date()) : undefined}
            />
          </label>
        </div>
        {isActive && (
          <div className="border-t border-border p-1">
            <button
              type="button"
              onClick={() => onChange({ dateFrom: "", dateTo: "" })}
              className="iris-focusable iris-press flex w-full items-center justify-center gap-1 bg-transparent px-2 py-1.5 text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
            >
              <X className="h-3 w-3" />
              {t("workOrders.filters.clearRange")}
            </button>
          </div>
        )}
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
  const { t } = useTranslation();
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
          {t("workOrders.filters.views.label")}
          <ChevronDown className="h-3 w-3 text-[color:var(--iris-ink-faint)] transition-transform duration-200 ease-out group-aria-expanded:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 rounded-none border-border p-1" align="start">
        <div className="px-3 py-2 text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
          {t("workOrders.filters.views.saved")}
        </div>
        <div className="flex flex-col">
          {views.length === 0 && (
            <div className="px-3 py-2 text-[12px] text-[color:var(--iris-ink-faint)]">
              {t("workOrders.filters.views.empty")}
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
                aria-label={t("workOrders.filters.views.deleteAria", { name: view.name })}
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
            placeholder={t("workOrders.filters.views.savePlaceholder")}
            className="w-full border border-border bg-card px-2 py-1.5 text-[12px] text-foreground placeholder:text-[color:var(--iris-ink-mute)] focus:border-foreground focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={name.trim() === ""}
            className="iris-focusable iris-press shrink-0 bg-foreground px-2.5 py-1.5 text-[11px] font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("workOrders.filters.views.save")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ColumnsPill(): React.JSX.Element {
  const { t } = useTranslation();
  const { isVisible, toggleColumn, resetColumns, visibleColumns } =
    useColumnVisibility();
  // Operators never see money, so the price column isn't offered in the picker.
  const { currentUser } = useAuth();
  const isAdmin = currentUser.role === "admin";
  const pickableColumns = WORK_ORDER_COLUMNS.filter(
    (col) => isAdmin || col.key !== "price",
  );
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
          {t("workOrders.filters.fields.label")}
          <ChevronDown className="h-3 w-3 text-[color:var(--iris-ink-faint)] transition-transform duration-200 ease-out group-aria-expanded:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 rounded-none border-border p-1" align="start">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[10px] uppercase tracking-[1.5px] text-[color:var(--iris-ink-mute)]">
            {t("workOrders.filters.fields.shown")}
          </span>
          {!allVisible && (
            <button
              type="button"
              onClick={resetColumns}
              className="iris-focusable text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
            >
              {t("workOrders.filters.fields.all")}
            </button>
          )}
        </div>
        <div className="flex flex-col">
          {pickableColumns.map((col) => {
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
                  {columnLabel(col)}
                </span>
                {locked && (
                  <span className="ml-auto text-[10px] text-[color:var(--iris-ink-faint)]">
                    {t("workOrders.filters.fields.required")}
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
  const { t } = useTranslation();
  const { isVisible } = useColumnVisibility();
  const { billingDefaults } = useOrganization();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // When the shop pins the document type (override off), every order shares the
  // same type, so the "Svi tipovi" filter would only ever match all or none.
  const showBillingFilter = billingDefaults.allowOverride;

  // Option lists with i18n labels; "all" sentinels reuse the per-filter
  // "all…" copy, the rest reuse the shared status/billing/delivery labels.
  const statusOptions = useMemo(
    () => [
      { value: "all" as const, label: t("workOrders.filters.allStatuses") },
      ...WORK_ORDER_STATUS_ORDER.map((status) => ({
        value: status,
        label: getWorkOrderStatusLabel(status),
      })),
    ],
    [t],
  );
  const billingOptions = useMemo(
    () => [
      { value: "all" as const, label: t("workOrders.filters.allTypes") },
      ...BILLING_VALUES.map((value) => ({
        value,
        label: t(`workOrders.billing.${value}`),
      })),
    ],
    [t],
  );
  const deliveryOptions = useMemo(
    () => [
      { value: "all" as const, label: t("workOrders.filters.allDeliveries") },
      ...DELIVERY_VALUES.map((value) => ({
        value,
        label: t(`workOrders.delivery.${value}`),
      })),
    ],
    [t],
  );
  const queueOptions = useMemo(
    () => [
      { value: "all" as const, label: t("workOrders.filters.allQueues") },
      ...QUEUE_VALUES.map((value) => ({
        value,
        label: t(`workOrders.filters.queue.${value}`),
      })),
    ],
    [t],
  );

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
    statusOptions.find((o) => o.value === filters.status)?.label ??
    t("workOrders.filters.allStatuses");
  const billingLabel =
    billingOptions.find((o) => o.value === filters.billingDocumentType)?.label ??
    t("workOrders.filters.allTypes");
  const deliveryLabel =
    deliveryOptions.find((o) => o.value === filters.deliveryMethod)?.label ??
    t("workOrders.filters.allDeliveries");
  const queueLabel =
    queueOptions.find((o) => o.value === filters.queue)?.label ??
    t("workOrders.filters.allQueues");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="group relative flex min-w-[220px] flex-1 items-center gap-2 border border-border bg-card px-3 py-2 transition-colors duration-150 focus-within:border-foreground">
        <Search className="h-3 w-3 text-[color:var(--iris-ink-mute)] transition-colors duration-150 group-focus-within:text-foreground" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder={t("workOrders.filters.searchPlaceholder")}
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
            aria-label={t("workOrders.filters.clearSearch")}
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
            options={statusOptions}
            current={filters.status}
            onSelect={(value) => updateFilters({ status: value })}
          />
        </FilterPill>
      )}

      {showBillingFilter && isVisible("billing") && (
        <FilterPill
          label={billingLabel}
          isActive={filters.billingDocumentType !== "all"}
        >
          <OptionList
            options={billingOptions}
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
          options={deliveryOptions}
          current={filters.deliveryMethod}
          onSelect={(value) => updateFilters({ deliveryMethod: value })}
        />
      </FilterPill>

      <FilterPill label={queueLabel} isActive={filters.queue !== "all"}>
        <OptionList
          options={queueOptions}
          current={filters.queue}
          onSelect={(value) => updateFilters({ queue: value })}
        />
      </FilterPill>

      <DateRangePill
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        onChange={updateFilters}
      />

      <span aria-hidden className="mx-0.5 h-5 w-px self-center bg-border" />

      <SavedViewsPill filters={filters} onApply={updateFilters} />

      <ColumnsPill />

      {hasActiveFilters && (
        <button
          type="button"
          onClick={resetFilters}
          className="iris-focusable iris-press animate-iris-fade flex items-center gap-1 bg-transparent px-2 py-2 text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
        >
          <X className="h-3 w-3" />
          {t("workOrders.filters.reset")}
        </button>
      )}
    </div>
  );
}
