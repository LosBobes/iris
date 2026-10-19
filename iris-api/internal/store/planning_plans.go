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
//
// A plan row keeps every block its run produced over the whole horizon (plan
// date through HorizonEnd; D-028). The plan date remains what is published and
// shown: PlanDay, GeneratePlan, SavePlanDraft, PublishPlan and MyQueue answer
// with the plan date's blocks only (planForDate), PlanHorizon with all of them
// grouped by day. Hand edits apply to the plan date's blocks only.

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
	// HorizonEnd is absent from documents written before D-028; they hold
	// only the plan date's blocks, so the plan date stands in on read.
	HorizonEnd string `json:"horizonEnd,omitempty"`
}

// planDateMax is past every plan date (an open upper bound for date ranges).
const planDateMax = "9999-12-31"

// planStepKey identifies a step of one work order.
type planStepKey struct{ order, step string }

// blockDate is the local date a block starts on.
func blockDate(assignment domain.PlanAssignment) string {
	if len(assignment.Start) < len(planningDateLayout) {
		return assignment.Start
	}
	return assignment.Start[:len(planningDateLayout)]
}

func sortAssignments(assignments []domain.PlanAssignment) {
	sort.SliceStable(assignments, func(i, j int) bool {
		if assignments[i].Start != assignments[j].Start {
			return assignments[i].Start < assignments[j].Start
		}
		return assignments[i].ID < assignments[j].ID
	})
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
	plan.HorizonEnd = document.HorizonEnd
	if plan.HorizonEnd == "" {
		plan.HorizonEnd = plan.Date
	}
	normalizePlan(&plan)
	return plan, nil
}

// planForDate narrows a stored plan to what the plan endpoints show: the
// blocks of date, and the issues that concern that day (every unplaceable-step
// issue, hand-edit conflicts, and the issues of steps with a block that day).
// The rest of the horizon stays in the row for PlanHorizon.
func planForDate(plan domain.ProductionPlan, date string) domain.ProductionPlan {
	view := plan
	view.Assignments = make([]domain.PlanAssignment, 0, len(plan.Assignments))
	placed := map[planStepKey]bool{}
	for _, assignment := range plan.Assignments {
		if blockDate(assignment) != date {
			continue
		}
		view.Assignments = append(view.Assignments, assignment)
		placed[planStepKey{assignment.WorkOrderID, assignment.StepNodeID}] = true
	}
	view.Issues = make([]domain.PlanIssue, 0, len(plan.Issues))
	for _, issue := range plan.Issues {
		if unplaceableIssues[issue.Code] || issue.Code == domain.PlanIssueConflict ||
			placed[planStepKey{issue.WorkOrderID, issue.StepNodeID}] {
			view.Issues = append(view.Issues, issue)
		}
	}
	normalizePlan(&view)
	return view
}

// planHorizon groups a stored plan's blocks by day, plan date first.
func planHorizon(plan domain.ProductionPlan) domain.PlanHorizon {
	horizon := domain.PlanHorizon{
		PlanID: plan.ID, Status: plan.Status, Date: plan.Date, HorizonEnd: plan.HorizonEnd,
		GeneratedAt: plan.GeneratedAt, UpdatedAt: plan.UpdatedAt,
		Days: []domain.PlanHorizonDay{}, Issues: append([]domain.PlanIssue{}, plan.Issues...),
	}
	assignments := append([]domain.PlanAssignment(nil), plan.Assignments...)
	sortAssignments(assignments)
	for _, assignment := range assignments {
		date := blockDate(assignment)
		if n := len(horizon.Days); n == 0 || horizon.Days[n-1].Date != date {
			horizon.Days = append(horizon.Days, domain.PlanHorizonDay{Date: date, Assignments: []domain.PlanAssignment{}})
		}
		day := &horizon.Days[len(horizon.Days)-1]
		day.Assignments = append(day.Assignments, assignment)
	}
	return horizon
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

// loadPlanView loads a plan narrowed to its date's blocks; nil when absent.
func loadPlanView(ctx context.Context, q dbExecQuerier, tenantID, date string, status domain.PlanStatus) (*domain.ProductionPlan, error) {
	plan, err := loadPlan(ctx, q, tenantID, date, status)
	if err != nil || plan == nil {
		return nil, err
	}
	view := planForDate(*plan, date)
	return &view, nil
}

// loadPublishedPlans returns the published plans dated from (inclusive) up to
// before (exclusive), oldest first.
func loadPublishedPlans(ctx context.Context, q dbExecQuerier, tenantID, from, before string) ([]domain.ProductionPlan, error) {
	rows, err := q.QueryContext(
		ctx,
		`SELECT `+planColumns+` FROM production_plans
		 WHERE tenant_id = ? AND status = ? AND date >= ? AND date < ?
		 ORDER BY date`,
		tenantID, string(domain.PlanStatusPublished), from, before,
	)
	if err != nil {
		return nil, fmt.Errorf("load published plans: %w", err)
	}
	defer rows.Close()
	plans := make([]domain.ProductionPlan, 0)
	for rows.Next() {
		plan, err := scanPlan(rows)
		if err != nil {
			return nil, fmt.Errorf("load published plans: %w", err)
		}
		plans = append(plans, plan)
	}
	return plans, rows.Err()
}

func encodePlanData(plan domain.ProductionPlan) (string, error) {
	raw, err := json.Marshal(planData{
		Assignments: plan.Assignments, Issues: plan.Issues, LateOrders: plan.LateOrders, HorizonEnd: plan.HorizonEnd,
	})
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
		if day.Draft, err = loadPlanView(ctx, s.db, tenantID, date, domain.PlanStatusDraft); err != nil {
			return day, err
		}
	}
	if day.Published, err = loadPlanView(ctx, s.db, tenantID, date, domain.PlanStatusPublished); err != nil {
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
		ID: id, Date: date, Status: domain.PlanStatusDraft, HorizonEnd: date,
		GeneratedAt: stamp, GeneratedBy: username, UpdatedAt: stamp, UpdatedBy: username,
	}

	if start, working := planStart(data.hours, data.location, date, input.Replan, now); working {
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
		pinned, err := pinsForGenerate(ctx, s.db, tenantID, date, today, input.Replan, orders)
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
	view := planForDate(plan, date)
	return &view, nil
}

// openSteps lists the steps of the planner's orders that are neither done nor
// skipped (closed orders are not among the planner's orders at all).
func openSteps(orders []planner.Order) map[planStepKey]bool {
	open := map[planStepKey]bool{}
	for _, order := range orders {
		for _, node := range order.Graph.Nodes {
			if node.Kind != domain.ProcessNodeStep ||
				node.Status == domain.ProcessStepDone || node.Status == domain.ProcessStepSkipped {
				continue
			}
			open[planStepKey{order.ID, node.ID}] = true
		}
	}
	return open
}

// publishedStepBlocks returns, from one published plan, every block of the
// open steps that the plan anchors on its own date (a step's first part is on
// the plan date; carry-over parts on later days come along). Blocks of later
// days that the run merely projected belong to those days' own plans.
func publishedStepBlocks(plan domain.ProductionPlan, open map[planStepKey]bool) []domain.PlanAssignment {
	anchored := map[planStepKey]bool{}
	for _, assignment := range plan.Assignments {
		key := planStepKey{assignment.WorkOrderID, assignment.StepNodeID}
		if blockDate(assignment) == plan.Date && open[key] {
			anchored[key] = true
		}
	}
	blocks := make([]domain.PlanAssignment, 0)
	for _, assignment := range plan.Assignments {
		if anchored[planStepKey{assignment.WorkOrderID, assignment.StepNodeID}] {
			blocks = append(blocks, assignment)
		}
	}
	return blocks
}

// pinsForGenerate collects the published blocks a new plan for date keeps as
// they are: with replan, the locked blocks of the date's published plan (the
// step was under way when it was published); and, for a date after today, the
// still-open steps the published plans of today up to the day before anchor
// on their own dates (D-028), so consecutive days never book the same work or
// the same machine twice. Finished steps and closed orders are history and
// are re-planned from the orders' current state like everything else.
func pinsForGenerate(
	ctx context.Context, q dbExecQuerier, tenantID, date, today string, replan bool, orders []planner.Order,
) ([]domain.PlanAssignment, error) {
	pinned := make([]domain.PlanAssignment, 0)
	seen := map[string]bool{}
	add := func(assignment domain.PlanAssignment) {
		if !seen[assignment.ID] {
			seen[assignment.ID] = true
			pinned = append(pinned, assignment)
		}
	}
	if replan {
		published, err := loadPlan(ctx, q, tenantID, date, domain.PlanStatusPublished)
		if err != nil {
			return nil, err
		}
		if published != nil {
			for _, assignment := range published.Assignments {
				if assignment.Locked {
					add(assignment)
				}
			}
		}
	}
	if date > today {
		plans, err := loadPublishedPlans(ctx, q, tenantID, today, date)
		if err != nil {
			return nil, err
		}
		open := openSteps(orders)
		for _, plan := range plans {
			for _, assignment := range publishedStepBlocks(plan, open) {
				add(assignment)
			}
		}
	}
	return pinned, nil
}

// pinsForForecast keeps the forecast from contradicting what is published
// (D-028): every published plan from today on contributes the open steps it
// anchors on its own date, except blocks already over at now — a locked block
// still under way and a block not yet started stay where the plan put them,
// while an unfinished step whose block has passed is placed again from now.
func pinsForForecast(
	ctx context.Context, q dbExecQuerier, tenantID, today string, now time.Time, orders []planner.Order,
) ([]domain.PlanAssignment, error) {
	plans, err := loadPublishedPlans(ctx, q, tenantID, today, planDateMax)
	if err != nil {
		return nil, err
	}
	open := openSteps(orders)
	nowLocal := now.Format(planningDateLayout + "T15:04")
	pinned := make([]domain.PlanAssignment, 0)
	seen := map[string]bool{}
	for _, plan := range plans {
		for _, assignment := range publishedStepBlocks(plan, open) {
			if assignment.End <= nowLocal || seen[assignment.ID] {
				continue
			}
			seen[assignment.ID] = true
			pinned = append(pinned, assignment)
		}
	}
	return pinned, nil
}

// fillPlanFromResult stores a run: every block from the plan date to the end
// of the horizon (pinned blocks the planner did not echo back included; pinned
// context from earlier dates left out), the run's issues and the orders
// forecast late.
func fillPlanFromResult(plan *domain.ProductionPlan, result planner.Result, pinned []domain.PlanAssignment) {
	plan.HorizonEnd = result.HorizonEnd
	if plan.HorizonEnd < plan.Date {
		plan.HorizonEnd = plan.Date
	}
	have := map[string]bool{}
	for _, assignment := range result.Assignments {
		if blockDate(assignment) < plan.Date {
			continue
		}
		plan.Assignments = append(plan.Assignments, assignment)
		have[assignment.ID] = true
	}
	for _, assignment := range pinned {
		if !have[assignment.ID] && blockDate(assignment) >= plan.Date {
			plan.Assignments = append(plan.Assignments, assignment)
		}
	}
	sortAssignments(plan.Assignments)
	plan.Issues = append(plan.Issues, result.Issues...)
	for _, forecast := range result.Forecast {
		if forecast.Late {
			plan.LateOrders = append(plan.LateOrders, forecast)
		}
	}
}

// ---- draft ----

// SavePlanDraft replaces the draft's blocks of the plan date (the rest of the
// kept horizon stays) and recomputes its issues with planner.CheckDraft. It
// returns ErrPlanDraftNotFound when there is no draft.
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
	draft.Issues = planner.CheckDraft(data.input(date, start, workers, orders), assignments)
	for _, assignment := range draft.Assignments {
		if blockDate(assignment) != date {
			assignments = append(assignments, assignment)
		}
	}
	sortAssignments(assignments)
	draft.Assignments = assignments
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
	view := planForDate(*draft, date)
	return &view, nil
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
	view := planForDate(*draft, date)
	return &view, nil
}

// ---- horizon ----

// PlanHorizon returns every block of the date's draft and published plan over
// the whole kept horizon, grouped by day (admins).
func (s *SQLiteStore) PlanHorizon(ctx context.Context, date string) (domain.PlanDayHorizon, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.PlanDayHorizon{}, err
	}
	hours, err := readWorkingHours(ctx, s.db, tenantID)
	if err != nil {
		return domain.PlanDayHorizon{}, err
	}
	date, err = s.resolvePlanDate(date, planningLocation(hours))
	if err != nil {
		return domain.PlanDayHorizon{}, err
	}
	out := domain.PlanDayHorizon{Date: date}
	for _, status := range []domain.PlanStatus{domain.PlanStatusDraft, domain.PlanStatusPublished} {
		plan, err := loadPlan(ctx, s.db, tenantID, date, status)
		if err != nil {
			return out, err
		}
		if plan == nil {
			continue
		}
		horizon := planHorizon(*plan)
		if status == domain.PlanStatusDraft {
			out.Draft = &horizon
		} else {
			out.Published = &horizon
		}
	}
	return out, nil
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
		if blockDate(assignment) != date {
			continue
		}
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
// Published plans from today on are pinned first (pinsForForecast), so the
// forecast never contradicts them.
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
	in := data.input(today, start, workers, orders)
	if in.Pinned, err = pinsForForecast(ctx, s.db, tenantID, today, now, orders); err != nil {
		return nil, err
	}
	result, err := planner.Plan(in)
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
