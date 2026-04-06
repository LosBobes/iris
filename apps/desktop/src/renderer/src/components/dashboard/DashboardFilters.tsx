import type { DashboardFilters } from '@/types/work-order'
import { Button } from '@/components/ui/button'

interface DashboardFiltersProps {
  filters: DashboardFilters
  setFilters: React.Dispatch<React.SetStateAction<DashboardFilters>>
  operators: string[]
}

export function DashboardFilters({
  filters,
  setFilters,
  operators,
}: DashboardFiltersProps): React.JSX.Element {
  const isActive =
    filters.dateFrom !== null || filters.dateTo !== null || filters.issuedBy !== null

  return (
    <div className="flex items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-date-from" className="text-xs text-muted-foreground">
          Od datuma
        </label>
        <input
          id="filter-date-from"
          type="date"
          value={filters.dateFrom ?? ''}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, dateFrom: e.target.value || null }))
          }
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-date-to" className="text-xs text-muted-foreground">
          Do datuma
        </label>
        <input
          id="filter-date-to"
          type="date"
          value={filters.dateTo ?? ''}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, dateTo: e.target.value || null }))
          }
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-operator" className="text-xs text-muted-foreground">
          Operater
        </label>
        <select
          id="filter-operator"
          value={filters.issuedBy ?? ''}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, issuedBy: e.target.value || null }))
          }
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        >
          <option value="">Svi operateri</option>
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
        onClick={() => setFilters({ dateFrom: null, dateTo: null, issuedBy: null })}
        disabled={!isActive}
      >
        Resetuj
      </Button>
    </div>
  )
}
