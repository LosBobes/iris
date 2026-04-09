import { parse } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkOrdersFiltersState } from "@/hooks/useWorkOrders";
import { Search, X } from "lucide-react";

interface WorkOrdersFiltersProps {
  filters: WorkOrdersFiltersState;
  updateFilters: (patch: Partial<WorkOrdersFiltersState>) => void;
  resetFilters: () => void;
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

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative w-64">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Pretraži naloge..."
          value={filters.search}
          onChange={(e) => updateFilters({ search: e.target.value })}
          className="pl-8"
        />
      </div>

      <Select
        value={filters.status}
        onValueChange={(value) =>
          updateFilters({ status: value as WorkOrdersFiltersState["status"] })
        }
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Svi</SelectItem>
          <SelectItem value="draft">Nacrt</SelectItem>
          <SelectItem value="active">Aktivan</SelectItem>
          <SelectItem value="completed">Završen</SelectItem>
          <SelectItem value="cancelled">Otkazan</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.billingDocumentType}
        onValueChange={(value) =>
          updateFilters({
            billingDocumentType:
              value as WorkOrdersFiltersState["billingDocumentType"],
          })
        }
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Tip dokumenta" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Svi dokumenti</SelectItem>
          <SelectItem value="invoice">Faktura</SelectItem>
          <SelectItem value="cashCollection">Gotovinski račun</SelectItem>
          <SelectItem value="proforma">Profaktura</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.deliveryMethod}
        onValueChange={(value) =>
          updateFilters({
            deliveryMethod: value as WorkOrdersFiltersState["deliveryMethod"],
          })
        }
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Dostava" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Sve dostave</SelectItem>
          <SelectItem value="pickup">Lično preuzimanje</SelectItem>
          <SelectItem value="postExpress">Post Express</SelectItem>
          <SelectItem value="cityExpress">City Express</SelectItem>
          <SelectItem value="fieldVisit">Terenski obilazak</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        <DatePicker
          value={filters.dateFrom || null}
          onChange={(v) => updateFilters({ dateFrom: v ?? "" })}
          placeholder="Od datuma"
          toDate={filters.dateTo ? parse(filters.dateTo, "yyyy-MM-dd", new Date()) : undefined}
        />
        <span className="text-xs text-muted-foreground">—</span>
        <DatePicker
          value={filters.dateTo || null}
          onChange={(v) => updateFilters({ dateTo: v ?? "" })}
          placeholder="Do datuma"
          fromDate={filters.dateFrom ? parse(filters.dateFrom, "yyyy-MM-dd", new Date()) : undefined}
        />
      </div>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={resetFilters}>
          <X className="mr-1 h-3 w-3" />
          Resetuj filtere
        </Button>
      )}
    </div>
  );
}
