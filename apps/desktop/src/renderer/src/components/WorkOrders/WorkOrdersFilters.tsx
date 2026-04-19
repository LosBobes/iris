import { parse } from "date-fns";
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

const STATUS_OPTIONS: Array<{ value: WorkOrdersFiltersState["status"]; label: string }> = [
  { value: "all", label: "Svi statusi" },
  { value: "draft", label: "Nacrt" },
  { value: "active", label: "Aktivan" },
  { value: "completed", label: "Završen" },
  { value: "cancelled", label: "Otkazan" },
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
          className={`flex items-center gap-2 border border-border bg-card px-3 py-2 text-[12px] ${
            isActive
              ? "text-foreground"
              : "text-[color:var(--iris-ink-soft)] hover:text-foreground"
          }`}
        >
          {label}
          <ChevronDown className="h-3 w-3 text-[color:var(--iris-ink-faint)]" />
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
          className={`bg-transparent px-3 py-2 text-left text-[12px] hover:bg-black/[0.03] ${
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
  const hasActiveFilters =
    filters.search !== "" ||
    filters.status !== "all" ||
    filters.billingDocumentType !== "all" ||
    filters.deliveryMethod !== "all" ||
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

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex flex-1 items-center gap-2 border border-border bg-card px-3 py-2">
        <Search className="h-3 w-3 text-[color:var(--iris-ink-mute)]" />
        <input
          type="text"
          placeholder="Pretraži naloge, klijente, opis…"
          value={filters.search}
          onChange={(e) => updateFilters({ search: e.target.value })}
          className="w-full border-none bg-transparent text-[12px] text-foreground placeholder:text-[color:var(--iris-ink-mute)] focus:outline-none"
        />
      </div>

      <FilterPill label={statusLabel} isActive={filters.status !== "all"}>
        <OptionList
          options={STATUS_OPTIONS}
          current={filters.status}
          onSelect={(value) => updateFilters({ status: value })}
        />
      </FilterPill>

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
        <span className="text-[color:var(--iris-ink-faint)]">—</span>
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
          className="flex items-center gap-1 bg-transparent px-2 py-2 text-[11px] text-[color:var(--iris-ink-soft)] hover:text-foreground"
        >
          <X className="h-3 w-3" />
          Resetuj
        </button>
      )}
    </div>
  );
}
