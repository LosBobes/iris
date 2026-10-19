package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/planner"
)

// Calibration report (D-028, "Actual step times"): GET /planning/calibration.
// Read-only; the computation lives in planner.Calibrate.

const (
	calibrationWindowOrderMessage = "Početni datum mora biti pre krajnjeg ili isti."
	calibrationWindowSpanFormat   = "Period izveštaja može biti najviše %d dana."
)

// calibrationWindow resolves the report's inclusive local date range: to
// defaults to today, from to CalibrationDefaultDays days up to to.
func calibrationWindow(from, to string, today string) (domain.PlanningCalibrationWindow, error) {
	from, to = strings.TrimSpace(from), strings.TrimSpace(to)
	if (from != "" && !ValidPlanningDate(from)) || (to != "" && !ValidPlanningDate(to)) {
		return domain.PlanningCalibrationWindow{}, newValidationError(invalidPlanningDate)
	}
	if to == "" {
		to = today
	}
	end, _ := time.Parse(planningDateLayout, to)
	if from == "" {
		from = end.AddDate(0, 0, -(domain.CalibrationDefaultDays - 1)).Format(planningDateLayout)
	}
	start, _ := time.Parse(planningDateLayout, from)
	if start.After(end) {
		return domain.PlanningCalibrationWindow{}, newValidationError(calibrationWindowOrderMessage)
	}
	if int(end.Sub(start).Hours()/24)+1 > domain.CalibrationMaxDays {
		return domain.PlanningCalibrationWindow{}, newValidationError(fmt.Sprintf(calibrationWindowSpanFormat, domain.CalibrationMaxDays))
	}
	return domain.PlanningCalibrationWindow{From: from, To: to}, nil
}

// PlanningCalibration reports, over the orders completed in the window, the
// measured inter-operation time and planned vs actual minutes per step label.
// An order counts as completed in the window when it is not cancelled, its
// process is finished (every step done or skipped, at least one done) and the
// latest step finishedAt falls on a local date (working-hours time zone)
// within the window — whatever the order's status (completed, invoiced or
// still open on paper). Orders finished before step times were recorded have
// no finishedAt and are not counted.
func (s *SQLiteStore) PlanningCalibration(ctx context.Context, from, to string) (domain.PlanningCalibration, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.PlanningCalibration{}, err
	}
	hours, err := readWorkingHours(ctx, s.db, tenantID)
	if err != nil {
		return domain.PlanningCalibration{}, err
	}
	location := planningLocation(hours)
	window, err := calibrationWindow(from, to, planningToday(s.planningNow(), location))
	if err != nil {
		return domain.PlanningCalibration{}, err
	}
	orders, err := loadCalibrationOrders(ctx, s.db, tenantID, window, location)
	if err != nil {
		return domain.PlanningCalibration{}, err
	}
	result, err := planner.Calibrate(hours, orders)
	if err != nil {
		return domain.PlanningCalibration{}, newValidationError("Kalibraciju nije moguće izračunati: radno vreme nije ispravno.")
	}
	return domain.PlanningCalibration{
		Window:                 window,
		Orders:                 len(orders),
		OrdersWithTimes:        result.OrdersWithTimes,
		AvgTransferMinutes:     result.AvgTransferMinutes,
		MedianTransferMinutes:  result.MedianTransferMinutes,
		CurrentTransferMinutes: hours.TransferMinutes,
		Steps:                  result.Steps,
	}, nil
}

// loadCalibrationOrders returns the processes completed in the window (see
// PlanningCalibration), ordered by order number.
func loadCalibrationOrders(
	ctx context.Context, q dbExecQuerier, tenantID string, window domain.PlanningCalibrationWindow, location *time.Location,
) ([]planner.CalibrationOrder, error) {
	rows, err := q.QueryContext(
		ctx,
		`SELECT w.payload, p.graph FROM work_order_processes p
		 JOIN work_orders w ON w.id = p.work_order_id
		 WHERE p.tenant_id = ? AND w.tenant_id = ?
		 ORDER BY w.order_number, w.id`,
		tenantID, tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("load calibration orders: %w", err)
	}
	defer rows.Close()
	orders := make([]planner.CalibrationOrder, 0)
	for rows.Next() {
		var payload, graphRaw string
		if err := rows.Scan(&payload, &graphRaw); err != nil {
			return nil, fmt.Errorf("scan calibration order: %w", err)
		}
		var workOrder domain.WorkOrder
		if err := json.Unmarshal([]byte(payload), &workOrder); err != nil {
			return nil, fmt.Errorf("decode work order: %w", err)
		}
		if workOrder.Status == domain.WorkOrderStatusCancelled {
			continue
		}
		graph, err := decodeProcessGraph(graphRaw)
		if err != nil {
			return nil, err
		}
		completed, ok := planner.ProcessCompletion(graph)
		if !ok {
			continue
		}
		date := completed.In(location).Format(planningDateLayout)
		if date < window.From || date > window.To {
			continue
		}
		quantity := 0
		if workOrder.JobDetails != nil && workOrder.JobDetails.Quantity != nil {
			quantity = *workOrder.JobDetails.Quantity
		}
		orders = append(orders, planner.CalibrationOrder{Quantity: quantity, Graph: graph})
	}
	return orders, rows.Err()
}
