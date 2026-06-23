import { parse } from "date-fns";
import { useTranslation } from "react-i18next";
import type { DashboardFilters } from "@/types/work-order";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";

interface DashboardFiltersProps {
  filters: DashboardFilters;
  setFilters: React.Dispatch<React.SetStateAction<DashboardFilters>>;
  operators: string[];
}

export function DashboardFilters({
  filters,
  setFilters,
  operators,
}: DashboardFiltersProps): React.JSX.Element {
  const { t } = useTranslation();
  const isActive =
    filters.dateFrom !== null ||
    filters.dateTo !== null ||
    filters.issuedBy !== null;

  return (
    <div className="flex items-end gap-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-date-from"
          className="text-xs text-muted-foreground"
        >
          {t("dashboard.filters.dateFrom")}
        </label>
        <DatePicker
          id="filter-date-from"
          value={filters.dateFrom}
          onChange={(dateFrom) => setFilters((prev) => ({ ...prev, dateFrom }))}
          placeholder={t("dashboard.filters.dateFrom")}
          toDate={filters.dateTo ? parse(filters.dateTo, "yyyy-MM-dd", new Date()) : undefined}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-date-to"
          className="text-xs text-muted-foreground"
        >
          {t("dashboard.filters.dateTo")}
        </label>
        <DatePicker
          id="filter-date-to"
          value={filters.dateTo}
          onChange={(dateTo) => setFilters((prev) => ({ ...prev, dateTo }))}
          placeholder={t("dashboard.filters.dateTo")}
          fromDate={filters.dateFrom ? parse(filters.dateFrom, "yyyy-MM-dd", new Date()) : undefined}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-operator"
          className="text-xs text-muted-foreground"
        >
          {t("dashboard.filters.operator")}
        </label>
        <select
          id="filter-operator"
          value={filters.issuedBy ?? ""}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              issuedBy: e.target.value || null,
            }))
          }
          className="iris-focusable h-8 border border-input bg-background px-2 text-xs text-foreground transition-colors duration-150 hover:border-foreground/40"
        >
          <option value="">{t("dashboard.filters.allOperators")}</option>
          {operators.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          setFilters({ dateFrom: null, dateTo: null, issuedBy: null })
        }
        disabled={!isActive}
      >
        {t("dashboard.filters.reset")}
      </Button>
    </div>
  );
}
