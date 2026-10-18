package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/planner"
)

// Day plans (production_plans) and the planner runs behind them (D-026). The
// planner itself is pure (internal/planner); this file loads its input from
// the tenant's data and stores its output.

const (
	planPastDateMessage     = "Plan se ne može praviti za prošli datum."
	planReplanTodayMessage  = "Preplaniranje je moguće samo za današnji dan."
	planTooManyBlocksFormat = "Plan može imati najviše %d blokova."
)

// planData is the JSON document kept in production_plans.data.
type planData struct {
	Assignments []domain.PlanAssignment `json:"assignments"`
	Issues      []domain.PlanIssue      `json:"issues"`
	LateOrders  []domain.OrderForecast  `json:"lateOrders"`
}

// unplaceableIssues are the issue codes that mean a step was left out of the
// plan; they are kept on a generated plan whatever day the step would fall on.
var unplaceableIssues = map[domain.PlanIssueCode]bool{
	domain.PlanIssueUnknownMachineType: true,
	domain.PlanIssueNoMachine:          true,
	domain.PlanIssueNoWorkers:          true,
	domain.PlanIssueNoCapacity:         true,
}

func normalizePlan(plan *domain.ProductionPlan) {
	if plan.Assignments == nil {
		plan.Assignments = []domain.PlanAssignment{}
	}
	for i := range plan.Assignments {
		if plan.Assignments[i].UserIDs == nil {
			plan.Assignments[i].UserIDs = []string{}
		}
	}
	if plan.Issues == nil {
		plan.Issues = []domain.PlanIssue{}
	}
	if plan.LateOrders == nil {
		plan.LateOrders = []domain.OrderForecast{}
	}
}

const planColumns = `id, date, status, generated_at, generated_by, updated_at, updated_by, published_at, published_by, data`

func scanPlan(row interface{ Scan(...any) error }) (domain.ProductionPlan, error) {
	var plan domain.ProductionPlan
	var status, data string
	var publishedAt, publishedBy sql.NullString
	if err := row.Scan(
		&plan.ID, &plan.Date, &status, &plan.GeneratedAt, &plan.GeneratedBy, &plan.UpdatedAt, &plan.UpdatedBy,
		&publishedAt, &publishedBy, &data,
	); err != nil {
		return plan, err
	}
	plan.Status = domain.PlanStatus(status)
	if publishedAt.Valid {
		plan.PublishedAt = &publishedAt.String
	}
	if publishedBy.Valid {
		plan.PublishedBy = &publishedBy.String
	}
	var document planData
	if err := json.Unmarshal([]byte(data), &document); err != nil {
		return plan, fmt.Errorf("decode plan: %w", err)
	}
	plan.Assignments, plan.Issues, plan.LateOrders = document.Assignments, document.Issues, document.LateOrders
	normalizePlan(&plan)
	return plan, nil
}

// loadPlan returns nil when the date has no plan with that status.
func loadPlan(ctx context.Context, q dbExecQuerier, tenantID, date string, status domain.PlanStatus) (*domain.ProductionPlan, error) {
	plan, err := scanPlan(q.QueryRowContext(
		ctx,
		`SELECT `+planColumns+` FROM production_plans WHERE tenant_id = ? AND date = ? AND status = ?`,
		tenantID, date, string(status),
	))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load plan: %w", err)
	}
	return &plan, nil
}

func encodePlanData(plan domain.ProductionPlan) (string, error) {
	raw, err := json.Marshal(planData{Assignments: plan.Assignments, Issues: plan.Issues, LateOrders: plan.LateOrders})
	if err != nil {
		return "", fmt.Errorf("encode plan: %w", err)
	}
	return string(raw), nil
}

func insertPlan(ctx context.Context, q dbExecQuerier, tenantID string, plan domain.ProductionPlan) error {
	data, err := encodePlanData(plan)
	if err != nil {
		return err
	}
	if _, err := q.ExecContext(
		ctx,
		`INSERT INTO production_plans(id, tenant_id, date, status, generated_at, generated_by, updated_at, updated_by, published_at, published_by, data)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		plan.ID, tenantID, plan.Date, string(plan.Status), plan.GeneratedAt, plan.GeneratedBy, plan.UpdatedAt, plan.UpdatedBy,
		plan.PublishedAt, plan.PublishedBy, data,
	); err != nil {
		return fmt.Errorf("save plan: %w", err)
	}
	return nil
}

// ---- planner input ----

// planningData is the static input of a planner run.
type planningData struct {
	hours    domain.WorkingHours
	location *time.Location
	types    []domain.MachineType
	machines []domain.Machine
	users    []planningUser
	quals    map[string][]string
}

func loadPlanningData(ctx context.Context, q dbExecQuerier, tenantID string) (planningData, error) {
	var data planningData
	var err error
	if data.hours, err = readWorkingHours(ctx, q, tenantID); err != nil {
		return data, err
	}
	data.location = planningLocation(data.hours)
	if data.types, err = listMachineTypes(ctx, q, tenantID); err != nil {
		return data, err
	}
	if data.machines, err = listMachines(ctx, q, tenantID); err != nil {
		return data, err
	}
	if data.users, err = listPlanningUsers(ctx, q, tenantID); err != nil {
		return data, err
	}
	data.quals, err = qualificationsByUser(ctx, q, tenantID)
	return data, err
}

// workers builds the planner's people. Presence per date is the admin overrides
// from planDate on; with signIns the plan date itself defaults to "signed in
// that day", otherwise every date not overridden counts as present.
func (d planningData) workers(
	ctx context.Context, q dbExecQuerier, tenantID, planDate string, signIns bool,
) ([]planner.Worker, error) {
	overrides, err := attendanceOverrides(ctx, q, tenantID, planDate)
	if err != nil {
		return nil, err
	}
	var signedIn map[string]bool
	if signIns {
		if signedIn, err = signedInUsers(ctx, q, tenantID, planDate, d.location); err != nil {
			return nil, err
		}
	}
	workers := make([]planner.Worker, 0, len(d.users))
	for _, user := range d.users {
		presence := map[string]bool{}
		for date, present := range overrides[user.id] {
			presence[date] = present
		}
		if signIns {
			if _, overridden := presence[planDate]; !overridden {
				presence[planDate] = signedIn[user.id]
			}
		}
		typeIDs := d.quals[user.id]
		if typeIDs == nil {
			typeIDs = []string{}
		}
		workers = append(workers, planner.Worker{
			UserID: user.id, Username: user.username, MachineTypeIDs: typeIDs, Presence: presence,
		})
	}
	return workers, nil
}

func isOpenStatus(status domain.WorkOrderStatus) bool {
	return !openStatusExclusions[string(status)]
}

func plannerOrder(workOrder domain.WorkOrder, graph domain.ProcessGraph) planner.Order {
	quantity := 0
	if workOrder.JobDetails != nil && workOrder.JobDetails.Quantity != nil {
		quantity = *workOrder.JobDetails.Quantity
	}
	priority := workOrder.Assignment.Priority
	if priority == "" {
		priority = domain.WorkOrderPriorityNormal
	}
	return planner.Order{
		ID: workOrder.ID, Number: workOrder.OrderNumber, ClientName: workOrder.ClientName,
		DueDate: workOrder.DueDate, Priority: priority, Quantity: quantity, Graph: graph, CreatedAt: workOrder.CreatedAt,
	}
}

// loadPlanningOrders returns the open work orders that have a process (not
// completed, cancelled or invoiced) plus the orders in include, whatever
// their status, ordered by order number.
func loadPlanningOrders(ctx context.Context, q dbExecQuerier, tenantID string, include map[string]bool) ([]planner.Order, error) {
	rows, err := q.QueryContext(
		ctx,
		`SELECT w.payload, p.graph FROM work_order_processes p
		 JOIN work_orders w ON w.id = p.work_order_id
		 WHERE p.tenant_id = ? AND w.tenant_id = ?
		 ORDER BY w.order_number, w.id`,
		tenantID, tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("load planning orders: %w", err)
	}
	defer rows.Close()
	orders := make([]planner.Order, 0)
	for rows.Next() {
		var payload, graphRaw string
		if err := rows.Scan(&payload, &graphRaw); err != nil {
			return nil, fmt.Errorf("scan planning order: %w", err)
		}
		var workOrder domain.WorkOrder
		if err := json.Unmarshal([]byte(payload), &workOrder); err != nil {
			return nil, fmt.Errorf("decode work order: %w", err)
		}
		if (workOrder.IsCompleted || !isOpenStatus(workOrder.Status)) && !include[workOrder.ID] {
			continue
		}
		graph, err := decodeProcessGraph(graphRaw)
		if err != nil {
			return nil, err
		}
		orders = append(orders, plannerOrder(workOrder, graph))
	}
	return orders, rows.Err()
}

// ---- working-day helpers ----

func isoWeekday(date time.Time) int {
	if weekday := int(date.Weekday()); weekday != 0 {
		return weekday
	}
	return 7
}

// workingDay finds the shift of a local date; ok is false on a day off.
func workingDay(hours domain.WorkingHours, date string) (domain.WorkingDay, bool) {
	parsed, err := time.Parse(planningDateLayout, date)
	if err != nil {
		return domain.WorkingDay{}, false
	}
	weekday := isoWeekday(parsed)
	for _, day := range hours.Days {
		if day.Weekday == weekday {
			return day, true
		}
	}
	return domain.WorkingDay{}, false
}

// clockOn is the local time "HH:MM" on a local date.
func clockOn(date, clock string, location *time.Location) (time.Time, bool) {
	parsed, err := time.ParseInLocation(planningDateLayout+" 15:04", date+" "+clock, location)
	return parsed, err == nil
}

// planStart is when planning begins for date: its shift start, or for a
// re-plan the current time, never earlier than the shift start. ok is false
// on a day off.
func planStart(hours domain.WorkingHours, location *time.Location, date string, replan bool, now time.Time) (time.Time, bool) {
	day, working := workingDay(hours, date)
	if !working {
		return time.Time{}, false
	}
	start, ok := clockOn(date, day.Start, location)
	if !ok {
		return time.Time{}, false
	}
	if replan && now.After(start) {
		return now.In(location), true
	}
	return start, true
}

func (d planningData) input(date string, start time.Time, workers []planner.Worker, orders []planner.Order) planner.Input {
	return planner.Input{
		Hours: d.hours, Date: date, Start: start, HorizonDays: domain.PlanningForecastDays,
		MachineTypes: d.types, Machines: d.machines, Workers: workers, Orders: orders,
	}
}

func (s *SQLiteStore) resolvePlanDate(date string, location *time.Location) (string, error) {
	date = strings.TrimSpace(date)
	if date == "" {
		return planningToday(s.planningNow(), location), nil
	}
	if !ValidPlanningDate(date) {
		return "", newValidationError(invalidPlanningDate)
	}
	return date, nil
}

// ---- plan day ----

func (s *SQLiteStore) PlanDay(ctx context.Context, date string, includeDraft bool) (domain.PlanDay, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.PlanDay{}, err
	}
	hours, err := readWorkingHours(ctx, s.db, tenantID)
	if err != nil {
		return domain.PlanDay{}, err
	}
	location := planningLocation(hours)
	date, err = s.resolvePlanDate(date, location)
	if err != nil {
		return domain.PlanDay{}, err
	}
	day := domain.PlanDay{Date: date}
	if includeDraft {
		if day.Draft, err = loadPlan(ctx, s.db, tenantID, date, domain.PlanStatusDraft); err != nil {
			return day, err
		}
	}
	if day.Published, err = loadPlan(ctx, s.db, tenantID, date, domain.PlanStatusPublished); err != nil {
		return day, err
	}
	now := s.planningNow()
	if day.Published != nil && date == planningToday(now, location) {
		include := map[string]bool{}
		for _, assignment := range day.Published.Assignments {
			include[assignment.WorkOrderID] = true
		}
		orders, err := loadPlanningOrders(ctx, s.db, tenantID, include)
		if err != nil {
			return day, err
		}
		drift := planner.Drift(*day.Published, orders, now.In(location))
		if drift.Reasons == nil {
			drift.Reasons = []string{}
		}
		day.Drift = &drift
	}
	return day, nil
}

// ---- generate ----

// GeneratePlan runs the planner for a date and replaces the date's draft. A
// day off yields an empty plan. It returns validation errors for a malformed or
// past date and for a re-plan of any day but today.
func (s *SQLiteStore) GeneratePlan(ctx context.Context, input domain.PlanGenerateInput, username string) (*domain.ProductionPlan, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	data, err := loadPlanningData(ctx, s.db, tenantID)
	if err != nil {
		return nil, err
	}
	date := strings.TrimSpace(input.Date)
	if !ValidPlanningDate(date) {
		return nil, newValidationError(invalidPlanningDate)
	}
	now := s.planningNow()
	today := planningToday(now, data.location)
	if date < today {
		return nil, newValidationError(planPastDateMessage)
	}
	if input.Replan && date != today {
		return nil, newValidationError(planReplanTodayMessage)
	}

	stamp := nowStamp()
	id, err := newPlanningID("plan")
	if err != nil {
		return nil, err
	}
	plan := domain.ProductionPlan{
		ID: id, Date: date, Status: domain.PlanStatusDraft,
		GeneratedAt: stamp, GeneratedBy: username, UpdatedAt: stamp, UpdatedBy: username,
	}

	if start, working := planStart(data.hours, data.location, date, input.Replan, now); working {
		var pinned []domain.PlanAssignment
		if input.Replan {
			published, err := loadPlan(ctx, s.db, tenantID, date, domain.PlanStatusPublished)
			if err != nil {
				return nil, err
			}
			if published != nil {
				for _, assignment := range published.Assignments {
					if assignment.Locked {
						pinned = append(pinned, assignment)
					}
				}
			}
		}
		// Before the plan date the day's sign-ins do not exist yet, so a future
		// date counts everyone present unless overridden.
		workers, err := data.workers(ctx, s.db, tenantID, date, date == today)
		if err != nil {
			return nil, err
		}
		orders, err := loadPlanningOrders(ctx, s.db, tenantID, nil)
		if err != nil {
			return nil, err
		}
		in := data.input(date, start, workers, orders)
		in.Pinned = pinned
		result, err := planner.Plan(in)
		if err != nil {
			return nil, newValidationError("Plan nije moguće napraviti: radno vreme nije ispravno.")
		}
		fillPlanFromResult(&plan, result, pinned)
	}
	normalizePlan(&plan)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin generate plan: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(
		ctx, `DELETE FROM production_plans WHERE tenant_id = ? AND date = ? AND status = ?`,
		tenantID, date, string(domain.PlanStatusDraft),
	); err != nil {
		return nil, fmt.Errorf("replace draft plan: %w", err)
	}
	if err := insertPlan(ctx, tx, tenantID, plan); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit generate plan: %w", err)
	}
	return &plan, nil
}

// fillPlanFromResult keeps what belongs to the plan date: its blocks (plus any
// pinned block the planner did not echo back), the issues of steps placed that
// day and every unplaceable-step issue, and the orders forecast late.
func fillPlanFromResult(plan *domain.ProductionPlan, result planner.Result, pinned []domain.PlanAssignment) {
	type stepKey struct{ order, step string }
	placed := map[stepKey]bool{}
	have := map[string]bool{}
	for _, assignment := range result.Assignments {
		if !strings.HasPrefix(assignment.Start, plan.Date) {
			continue
		}
		plan.Assignments = append(plan.Assignments, assignment)
		have[assignment.ID] = true
		placed[stepKey{assignment.WorkOrderID, assignment.StepNodeID}] = true
	}
	for _, assignment := range pinned {
		if !have[assignment.ID] {
			plan.Assignments = append(plan.Assignments, assignment)
			placed[stepKey{assignment.WorkOrderID, assignment.StepNodeID}] = true
		}
	}
	sort.SliceStable(plan.Assignments, func(i, j int) bool {
		if plan.Assignments[i].Start != plan.Assignments[j].Start {
			return plan.Assignments[i].Start < plan.Assignments[j].Start
		}
		return plan.Assignments[i].ID < plan.Assignments[j].ID
	})
	for _, issue := range result.Issues {
		if unplaceableIssues[issue.Code] || placed[stepKey{issue.WorkOrderID, issue.StepNodeID}] {
			plan.Issues = append(plan.Issues, issue)
		}
	}
	for _, forecast := range result.Forecast {
		if forecast.Late {
			plan.LateOrders = append(plan.LateOrders, forecast)
		}
	}
}

// ---- draft ----

// SavePlanDraft replaces the draft's blocks and recomputes its issues with
// planner.CheckDraft. It returns ErrPlanDraftNotFound when there is no draft.
func (s *SQLiteStore) SavePlanDraft(ctx context.Context, input domain.PlanDraftInput, username string) (*domain.ProductionPlan, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	date := strings.TrimSpace(input.Date)
	if !ValidPlanningDate(date) {
		return nil, newValidationError(invalidPlanningDate)
	}
	if len(input.Assignments) > domain.MaxPlanAssignments {
		return nil, newValidationError(fmt.Sprintf(planTooManyBlocksFormat, domain.MaxPlanAssignments))
	}
	draft, err := loadPlan(ctx, s.db, tenantID, date, domain.PlanStatusDraft)
	if err != nil {
		return nil, err
	}
	if draft == nil {
		return nil, ErrPlanDraftNotFound
	}
	data, err := loadPlanningData(ctx, s.db, tenantID)
	if err != nil {
		return nil, err
	}
	assignments := make([]domain.PlanAssignment, len(input.Assignments))
	include := map[string]bool{}
	for i, assignment := range input.Assignments {
		if assignment.ID == "" {
			assignment.ID = fmt.Sprintf("%s:%s:%d", assignment.WorkOrderID, assignment.StepNodeID, max(assignment.Part, 1))
		}
		assignments[i] = assignment
		include[assignment.WorkOrderID] = true
	}
	workers, err := data.workers(ctx, s.db, tenantID, date, date == planningToday(s.planningNow(), data.location))
	if err != nil {
		return nil, err
	}
	orders, err := loadPlanningOrders(ctx, s.db, tenantID, include)
	if err != nil {
		return nil, err
	}
	start, _ := clockOn(date, "00:00", data.location)
	if shiftStart, working := planStart(data.hours, data.location, date, false, s.planningNow()); working {
		start = shiftStart
	}
	draft.Assignments = assignments
	draft.Issues = planner.CheckDraft(data.input(date, start, workers, orders), assignments)
	draft.UpdatedAt, draft.UpdatedBy = nowStamp(), username
	normalizePlan(draft)
	raw, err := encodePlanData(*draft)
	if err != nil {
		return nil, err
	}
	if _, err := s.db.ExecContext(
		ctx,
		`UPDATE production_plans SET data = ?, updated_at = ?, updated_by = ? WHERE id = ? AND tenant_id = ?`,
		raw, draft.UpdatedAt, draft.UpdatedBy, draft.ID, tenantID,
	); err != nil {
		return nil, fmt.Errorf("save draft plan: %w", err)
	}
	return draft, nil
}

// DiscardPlanDraft removes the draft of a date; having none is not an error.
func (s *SQLiteStore) DiscardPlanDraft(ctx context.Context, date string) error {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	hours, err := readWorkingHours(ctx, s.db, tenantID)
	if err != nil {
		return err
	}
	date, err = s.resolvePlanDate(date, planningLocation(hours))
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(
		ctx, `DELETE FROM production_plans WHERE tenant_id = ? AND date = ? AND status = ?`,
		tenantID, date, string(domain.PlanStatusDraft),
	); err != nil {
		return fmt.Errorf("discard draft plan: %w", err)
	}
	return nil
}

// PublishPlan turns the draft of a date into its published plan, replacing the
// previous one. It returns ErrPlanDraftNotFound when there is no draft.
func (s *SQLiteStore) PublishPlan(ctx context.Context, input domain.PlanPublishInput, username string) (*domain.ProductionPlan, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	date := strings.TrimSpace(input.Date)
	if !ValidPlanningDate(date) {
		return nil, newValidationError(invalidPlanningDate)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin publish plan: %w", err)
	}
	defer tx.Rollback()
	draft, err := loadPlan(ctx, tx, tenantID, date, domain.PlanStatusDraft)
	if err != nil {
		return nil, err
	}
	if draft == nil {
		return nil, ErrPlanDraftNotFound
	}
	if _, err := tx.ExecContext(
		ctx, `DELETE FROM production_plans WHERE tenant_id = ? AND date = ? AND status = ?`,
		tenantID, date, string(domain.PlanStatusPublished),
	); err != nil {
		return nil, fmt.Errorf("replace published plan: %w", err)
	}
	stamp := nowStamp()
	draft.Status = domain.PlanStatusPublished
	draft.UpdatedAt, draft.UpdatedBy = stamp, username
	draft.PublishedAt, draft.PublishedBy = &stamp, &username
	if _, err := tx.ExecContext(
		ctx,
		`UPDATE production_plans SET status = ?, updated_at = ?, updated_by = ?, published_at = ?, published_by = ?
		 WHERE id = ? AND tenant_id = ?`,
		string(draft.Status), stamp, username, stamp, username, draft.ID, tenantID,
	); err != nil {
		return nil, fmt.Errorf("publish plan: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit publish plan: %w", err)
	}
	return draft, nil
}

// ---- my queue ----

func (s *SQLiteStore) MyQueue(ctx context.Context, userID, date string) (domain.MyQueue, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.MyQueue{}, err
	}
	hours, err := readWorkingHours(ctx, s.db, tenantID)
	if err != nil {
		return domain.MyQueue{}, err
	}
	date, err = s.resolvePlanDate(date, planningLocation(hours))
	if err != nil {
		return domain.MyQueue{}, err
	}
	queue := domain.MyQueue{Date: date, Items: []domain.MyQueueItem{}}
	plan, err := loadPlan(ctx, s.db, tenantID, date, domain.PlanStatusPublished)
	if err != nil || plan == nil {
		return queue, err
	}
	queue.PublishedAt = plan.PublishedAt
	statuses := map[string]map[string]domain.ProcessStepStatus{}
	for _, assignment := range plan.Assignments {
		isCrew := false
		for _, id := range assignment.UserIDs {
			if id == userID {
				isCrew = true
			}
		}
		if !isCrew && assignment.LeadUserID != userID {
			continue
		}
		steps, loaded := statuses[assignment.WorkOrderID]
		if !loaded {
			steps = map[string]domain.ProcessStepStatus{}
			process, err := getWorkOrderProcess(ctx, s.db, tenantID, assignment.WorkOrderID)
			if err != nil {
				return queue, err
			}
			if process != nil {
				for _, node := range process.Graph.Nodes {
					if node.Kind == domain.ProcessNodeStep {
						steps[node.ID] = node.Status
					}
				}
			}
			statuses[assignment.WorkOrderID] = steps
		}
		status := steps[assignment.StepNodeID]
		if status == "" {
			status = domain.ProcessStepPending
		}
		queue.Items = append(queue.Items, domain.MyQueueItem{
			PlanAssignment: assignment, StepStatus: status, IsLead: assignment.LeadUserID == userID,
		})
	}
	sort.SliceStable(queue.Items, func(i, j int) bool {
		if queue.Items[i].Start != queue.Items[j].Start {
			return queue.Items[i].Start < queue.Items[j].Start
		}
		return queue.Items[i].ID < queue.Items[j].ID
	})
	return queue, nil
}

// ---- forecast ----

// Forecast runs the planner from now over the horizon and returns one entry per
// open order with a process, earliest estimated finish first, unplannable last,
// then by order number. Nothing is stored. Everyone counts as present except
// where an admin marked an absence: sign-ins say nothing about future days.
func (s *SQLiteStore) Forecast(ctx context.Context) ([]domain.OrderForecast, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	data, err := loadPlanningData(ctx, s.db, tenantID)
	if err != nil {
		return nil, err
	}
	now := s.planningNow().In(data.location)
	today := planningToday(now, data.location)
	start := now
	if shiftStart, working := planStart(data.hours, data.location, today, true, now); working {
		start = shiftStart
	}
	workers, err := data.workers(ctx, s.db, tenantID, today, false)
	if err != nil {
		return nil, err
	}
	orders, err := loadPlanningOrders(ctx, s.db, tenantID, nil)
	if err != nil {
		return nil, err
	}
	if len(orders) == 0 {
		return []domain.OrderForecast{}, nil
	}
	result, err := planner.Plan(data.input(today, start, workers, orders))
	if err != nil {
		return nil, newValidationError("Prognozu nije moguće izračunati: radno vreme nije ispravno.")
	}
	forecast := append([]domain.OrderForecast{}, result.Forecast...)
	sort.SliceStable(forecast, func(i, j int) bool {
		a, b := forecast[i], forecast[j]
		if (a.EstimatedFinish == nil) != (b.EstimatedFinish == nil) {
			return a.EstimatedFinish != nil
		}
		if a.EstimatedFinish != nil && *a.EstimatedFinish != *b.EstimatedFinish {
			return *a.EstimatedFinish < *b.EstimatedFinish
		}
		return a.OrderNumber < b.OrderNumber
	})
	return forecast, nil
}
