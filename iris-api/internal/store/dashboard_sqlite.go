package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

const dashboardDateLayout = "2006-01-02"

// DashboardOrdersQuery selects the orders the dashboard needs. The dashboard
// aggregates two populations: the "filtered" set (issue-date range / issuedBy)
// behind the summary, charts and finance, and the "attention" set behind the
// deadline signals and work queues, which ignores those filters.
type DashboardOrdersQuery struct {
	DateFrom string
	DateTo   string
	IssuedBy string
	// Today is the caller's local date (YYYY-MM-DD); with Username it bounds
	// which orders can still raise an attention signal or queue entry.
	Today    string
	Username string
}

// DashboardOrders is the dashboard's order input.
type DashboardOrders struct {
	// HasOrders reports whether the tenant has any work order at all.
	HasOrders bool
	// Orders is a superset of the filtered and attention populations, in the
	// default list order (issue date descending, then id). Orders outside both
	// populations are omitted; the aggregation re-applies the filters itself, so
	// the extras are harmless and the omitted ones contribute nothing.
	Orders []domain.WorkOrder
}

// DashboardOrders loads only the orders the dashboard can use instead of the
// whole tenant: orders inside the filter range, plus the non-cancelled orders
// that can raise a signal or enter a queue (see the attention predicate below).
// It relies on the is_completed column maintained by putWorkOrder (migration v24).
func (s *SQLiteStore) DashboardOrders(ctx context.Context, query DashboardOrdersQuery) (DashboardOrders, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return DashboardOrders{}, err
	}

	var result DashboardOrders
	var exists int
	if err := s.db.QueryRowContext(
		ctx,
		`SELECT EXISTS(SELECT 1 FROM work_orders WHERE tenant_id = ?)`,
		tenantID,
	).Scan(&exists); err != nil {
		return DashboardOrders{}, fmt.Errorf("check work orders: %w", err)
	}
	result.HasOrders = exists != 0
	if !result.HasOrders {
		result.Orders = []domain.WorkOrder{}
		return result, nil
	}

	// End of the "due this week" window: today+7 when today parses, otherwise
	// today itself (due today is a plain string comparison).
	maxDue := query.Today
	if today, err := time.Parse(dashboardDateLayout, query.Today); err == nil {
		maxDue = today.AddDate(0, 0, 7).Format(dashboardDateLayout)
	}

	// filtered: the conjunction of the active filters; empty means "all orders".
	filtered := ""
	args := []any{tenantID}
	var filterArgs []any
	addFilter := func(clause string, arg any) {
		if filtered != "" {
			filtered += " AND "
		}
		filtered += clause
		filterArgs = append(filterArgs, arg)
	}
	if query.DateFrom != "" {
		addFilter("issue_date >= ?", query.DateFrom)
	}
	if query.DateTo != "" {
		addFilter("issue_date <= ?", query.DateTo)
	}
	if query.IssuedBy != "" {
		addFilter("issued_by = ?", query.IssuedBy)
	}

	// An order can raise a signal or enter a queue only if it is not cancelled
	// and is unassigned (any completion state), or is due today / within the
	// week (any completion state), or is overdue and not completed, or is open
	// and assigned to the session user (operator queue, any due date).
	attention := `(status <> 'cancelled' AND (
		   assigned_to IS NULL OR assigned_to = ''
		   OR (is_completed = 0 AND assigned_to = ?)
		   OR (due_date IS NOT NULL AND due_date <> '' AND (
		         (due_date >= ? AND due_date <= ?)
		         OR (due_date < ? AND is_completed = 0)))))`
	attentionArgs := []any{query.Username, query.Today, maxDue, query.Today}

	where := "tenant_id = ?"
	if filtered != "" {
		where += " AND ((" + filtered + ") OR " + attention + ")"
		args = append(args, filterArgs...)
		args = append(args, attentionArgs...)
	}
	// With no active filter the filtered population is every order, so nothing
	// can be pruned and the plain tenant scan is exact.

	rows, err := s.db.QueryContext(
		ctx,
		`SELECT payload FROM work_orders WHERE `+where+` `+workOrderOrderBy(""),
		args...,
	)
	if err != nil {
		return DashboardOrders{}, fmt.Errorf("list dashboard work orders: %w", err)
	}
	defer rows.Close()

	result.Orders = make([]domain.WorkOrder, 0)
	for rows.Next() {
		var payload string
		if err := rows.Scan(&payload); err != nil {
			return DashboardOrders{}, fmt.Errorf("scan dashboard work order: %w", err)
		}
		var workOrder domain.WorkOrder
		if err := json.Unmarshal([]byte(payload), &workOrder); err != nil {
			return DashboardOrders{}, fmt.Errorf("decode work order payload: %w", err)
		}
		result.Orders = append(result.Orders, normalizeStoredWorkOrder(workOrder))
	}
	if err := rows.Err(); err != nil {
		return DashboardOrders{}, err
	}
	return result, nil
}

// DashboardOrders returns every order: the fixture store has no SQL to prune
// with, and the aggregation filters on its own.
func (s *FixtureStore) DashboardOrders(ctx context.Context, _ DashboardOrdersQuery) (DashboardOrders, error) {
	all, err := s.WorkOrders(ctx, WorkOrderListQuery{})
	if err != nil {
		return DashboardOrders{}, err
	}
	return DashboardOrders{HasOrders: len(all.Items) > 0, Orders: all.Items}, nil
}
