package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/planner"
)

// Material needs by week (D-028, GET /planning/material-needs): the store
// gathers the published plans, the open orders' process copies and the stock
// levels; planner.MaterialNeeds does the arithmetic.

const (
	materialNeedsOrderMessage = "Kraj perioda ne može biti pre početka."
	materialNeedsSpanMessage  = "Period može obuhvatiti najviše 8 nedelja."
)

// MaterialNeedsStore is the material-needs report of the planning module
// (implemented by the SQL store only).
type MaterialNeedsStore interface {
	// MaterialNeeds reports input material per week over from..to (local
	// dates; "" = defaults: from today, to the published horizon end or four
	// weeks). It returns validation errors for a malformed date, a reversed
	// window or more than domain.MaxMaterialNeedsWeeks weeks.
	MaterialNeeds(ctx context.Context, from, to string) (domain.MaterialNeeds, error)
}

var _ MaterialNeedsStore = (*SQLiteStore)(nil)

func (s *SQLiteStore) MaterialNeeds(ctx context.Context, from, to string) (domain.MaterialNeeds, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.MaterialNeeds{}, err
	}
	hours, err := readWorkingHours(ctx, s.db, tenantID)
	if err != nil {
		return domain.MaterialNeeds{}, err
	}
	from, err = s.resolvePlanDate(from, planningLocation(hours))
	if err != nil {
		return domain.MaterialNeeds{}, err
	}
	to = strings.TrimSpace(to)
	if to != "" && !ValidPlanningDate(to) {
		return domain.MaterialNeeds{}, newValidationError(invalidPlanningDate)
	}

	plans, err := materialNeedsPlans(ctx, s.db, tenantID, from)
	if err != nil {
		return domain.MaterialNeeds{}, err
	}
	if to == "" {
		to = defaultMaterialNeedsEnd(from, plans)
	}
	weeks, err := planner.MaterialWeeks(from, to)
	switch {
	case errors.Is(err, planner.ErrMaterialWindowOrder):
		return domain.MaterialNeeds{}, newValidationError(materialNeedsOrderMessage)
	case errors.Is(err, planner.ErrMaterialWindowSpan):
		return domain.MaterialNeeds{}, newValidationError(materialNeedsSpanMessage)
	case err != nil:
		return domain.MaterialNeeds{}, newValidationError(invalidPlanningDate)
	}

	orders, err := materialNeedsOrders(ctx, s.db, tenantID)
	if err != nil {
		return domain.MaterialNeeds{}, err
	}
	stock, err := s.materialNeedsStock(ctx, tenantID, orders)
	if err != nil {
		return domain.MaterialNeeds{}, err
	}
	return planner.MaterialNeeds(planner.MaterialNeedsInput{Weeks: weeks, Plans: plans, Orders: orders, Stock: stock}), nil
}

// materialNeedsPlans returns the published plans that speak for dates from
// from on: the most recent one dated before from, and every later one.
func materialNeedsPlans(ctx context.Context, q dbExecQuerier, tenantID, from string) ([]domain.ProductionPlan, error) {
	plans := make([]domain.ProductionPlan, 0)
	earlier, err := scanPlan(q.QueryRowContext(
		ctx,
		`SELECT `+planColumns+` FROM production_plans
		 WHERE tenant_id = ? AND status = ? AND date < ?
		 ORDER BY date DESC LIMIT 1`,
		tenantID, string(domain.PlanStatusPublished), from,
	))
	switch {
	case errors.Is(err, sql.ErrNoRows):
	case err != nil:
		return nil, fmt.Errorf("load earlier published plan: %w", err)
	default:
		plans = append(plans, earlier)
	}
	later, err := loadPublishedPlans(ctx, q, tenantID, from, planDateMax)
	if err != nil {
		return nil, err
	}
	return append(plans, later...), nil
}

// defaultMaterialNeedsEnd is the end of the published horizon (the latest
// horizonEnd among the plans) when it lies on or after from, else four weeks
// from from; either way clipped to the last day of the eighth week.
func defaultMaterialNeedsEnd(from string, plans []domain.ProductionPlan) string {
	start, err := time.Parse(planningDateLayout, from)
	if err != nil {
		return from
	}
	end := ""
	for _, plan := range plans {
		if plan.HorizonEnd > end {
			end = plan.HorizonEnd
		}
	}
	if end < from {
		end = start.AddDate(0, 0, domain.DefaultMaterialNeedsDays-1).Format(planningDateLayout)
	}
	sinceMonday := (int(start.Weekday()) + 6) % 7
	last := start.AddDate(0, 0, 7*domain.MaxMaterialNeedsWeeks-1-sinceMonday).Format(planningDateLayout)
	if end > last {
		end = last
	}
	return end
}

// materialNeedsOrders returns the open work orders' process copies (whether or
// not the copy is stock-tracked: the material is needed either way) with
// their planned-quantity factor, ordered by order id.
func materialNeedsOrders(ctx context.Context, q dbExecQuerier, tenantID string) ([]planner.MaterialOrder, error) {
	rows, err := q.QueryContext(
		ctx,
		`SELECT w.payload, p.graph, p.quantities_per_order FROM work_order_processes p
		 JOIN work_orders w ON w.id = p.work_order_id
		 WHERE p.tenant_id = ? AND w.tenant_id = ? AND w.status NOT IN `+closedWorkOrderStatusesSQL+`
		 ORDER BY w.id`,
		tenantID, tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("load material orders: %w", err)
	}
	defer rows.Close()
	orders := make([]planner.MaterialOrder, 0)
	for rows.Next() {
		var payload, graphRaw string
		var perOrder int
		if err := rows.Scan(&payload, &graphRaw, &perOrder); err != nil {
			return nil, fmt.Errorf("scan material order: %w", err)
		}
		var workOrder domain.WorkOrder
		if err := json.Unmarshal([]byte(payload), &workOrder); err != nil {
			return nil, fmt.Errorf("decode work order: %w", err)
		}
		if workOrder.IsCompleted || !isOpenStatus(workOrder.Status) {
			continue
		}
		graph, err := decodeProcessGraph(graphRaw)
		if err != nil {
			return nil, err
		}
		orders = append(orders, planner.MaterialOrder{
			WorkOrderID: workOrder.ID, Graph: graph,
			Factor: domain.WorkOrderQuantityFactor(&workOrder, perOrder != 0),
		})
	}
	return orders, rows.Err()
}

// materialNeedsStock returns the stock level of every article the orders'
// input nodes link to. The stock list leaves out inactive articles without
// stock; such an article is filled in with nothing on hand. A link to an id
// that is no longer an article gets no entry (no stock figures).
func (s *SQLiteStore) materialNeedsStock(
	ctx context.Context, tenantID string, orders []planner.MaterialOrder,
) (map[string]domain.StockLevel, error) {
	levels, err := s.StockLevels(ctx, StockLevelQuery{})
	if err != nil {
		return nil, err
	}
	stock := make(map[string]domain.StockLevel, len(levels.Items))
	for _, level := range levels.Items {
		stock[level.CatalogItemID] = level
	}
	var reserved map[string]float64
	for _, order := range orders {
		for _, node := range order.Graph.Nodes {
			id := strings.TrimSpace(node.CatalogItemID)
			if node.Kind != domain.ProcessNodeInput || id == "" {
				continue
			}
			if _, known := stock[id]; known {
				continue
			}
			article, ok, err := stockArticle(ctx, s.db, tenantID, id)
			if err != nil {
				return nil, err
			}
			if !ok {
				continue
			}
			if reserved == nil {
				if reserved, err = openReservations(ctx, s.db, tenantID); err != nil {
					return nil, err
				}
			}
			held := reserved[id]
			stock[id] = domain.StockLevel{
				CatalogItemID: id, Code: article.Code, Name: article.Name, Unit: article.Unit,
				Reserved: held, Available: 0 - held, // 0 - held, not -held: never a negative zero
			}
		}
	}
	return stock, nil
}
