import { parse } from "date-fns";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { WorkOrdersFiltersState } from "@/hooks/useWorkOrders";
import { Search, X, ChevronDown } from "lucide-react";

interface WorkOrdersFiltersProps {
  filters: WorkOrdersFiltersState;
  updateFilters: (patch: Partial<WorkOrdersFiltersState>) => void;
  resetFilters: () => void;
}

function buildStatusOptions(
  t: TFunction,
): Array<{ value: WorkOrdersFiltersState["status"]; label: string }> {
  return [
    { value: "all", label: t("workOrders.filters.allStatuses") },
    { value: "draft", label: t("workOrders.status.draft") },
    { value: "active", label: t("workOrders.status.active") },
    { value: "completed", label: t("workOrders.status.completed") },
    { value: "cancelled", label: t("workOrders.status.cancelled") },
  ];
}

function buildBillingOptions(
  t: TFunction,
): Array<{ value: WorkOrdersFiltersState["billingDocumentType"]; label: string }> {
  return [
    { value: "all", label: t("workOrders.filters.allTypes") },
    { value: "invoice", label: t("workOrders.billing.invoice") },
    { value: "cashCollection", label: t("workOrders.billing.cashCollection") },
    { value: "proforma", label: t("workOrders.billing.proforma") },
  ];
}

function buildDeliveryOptions(
  t: TFunction,
): Array<{ value: WorkOrdersFiltersState["deliveryMethod"]; label: string }> {
  return [
    { value: "all", label: t("workOrders.filters.allDeliveries") },
    { value: "pickup", label: t("workOrders.delivery.pickup") },
    { value: "postExpress", label: t("workOrders.delivery.postExpress") },
    { value: "cityExpress", label: t("workOrders.delivery.cityExpress") },
    { value: "fieldVisit", label: t("workOrders.delivery.fieldVisit") },
  ];
}

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
          className={`iris-focusable iris-press group flex items-center gap-2 border border-border bg-card px-3 py-2 text-[12px] hover:bg-black/[0.02] ${
            isActive
              ? "text-foreground"
              : "text-[color:var(--iris-ink-soft)] hover:text-foreground"
          }`}
        >
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

export function WorkOrdersFilters({
  filters,
  updateFilters,
  resetFilters,
}: WorkOrdersFiltersProps): React.JSX.Element {
  const { t } = useTranslation();
  const statusOptions = buildStatusOptions(t);
  const billingOptions = buildBillingOptions(t);
  const deliveryOptions = buildDeliveryOptions(t);

  const hasActiveFilters =
    filters.search !== "" ||
    filters.status !== "all" ||
    filters.billingDocumentType !== "all" ||
    filters.deliveryMethod !== "all" ||
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

  return (
    <div className="flex items-center gap-2">
      <div className="group relative flex flex-1 items-center gap-2 border border-border bg-card px-3 py-2 transition-colors duration-150 focus-within:border-foreground">
        <Search className="h-3 w-3 text-[color:var(--iris-ink-mute)] transition-colors duration-150 group-focus-within:text-foreground" />
        <input
          type="text"
          placeholder={t("workOrders.filters.searchPlaceholder")}
          value={filters.search}
          onChange={(e) => updateFilters({ search: e.target.value })}
          className="w-full border-none bg-transparent text-[12px] text-foreground placeholder:text-[color:var(--iris-ink-mute)] focus:outline-none"
        />
      </div>

      <FilterPill label={statusLabel} isActive={filters.status !== "all"}>
        <OptionList
          options={statusOptions}
          current={filters.status}
          onSelect={(value) => updateFilters({ status: value })}
        />
      </FilterPill>

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

      <div className="flex items-center gap-1.5 border border-border bg-card px-3 py-1">
        <DatePicker
          value={filters.dateFrom || null}
          onChange={(v) => updateFilters({ dateFrom: v ?? "" })}
          placeholder={t("workOrders.filters.dateFrom")}
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
          placeholder={t("workOrders.filters.dateTo")}
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
          {t("workOrders.filters.reset")}
        </button>
      )}
    </div>
  );
}
