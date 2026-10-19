package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/planner"
)

// Workstation load ("Zauzetost", D-028): planned against available minutes per
// machine type, unit and person and day, read from the published plans' kept
// horizons. The counting is pure (planner.Load); this file picks the plans and
// the presence.

const (
	loadRangeOrderMessage = "Datum „do“ ne može biti pre datuma „od“."
	loadDraftTodayMessage = "Nacrt plana može da se prikaže samo kad opseg počinje danas."
	loadHoursMessage      = "Zauzetost nije moguće izračunati: radno vreme nije ispravno."
)

var loadRangeTooLongMessage = fmt.Sprintf("Opseg može imati najviše %d dana.", domain.MaxLoadDays)

// loadLookbackDays bounds how far before `from` a published plan can still
// project blocks into the range: a run covers PlanningForecastDays working
// days, which the planner looks for within 14*7+14 calendar days.
const loadLookbackDays = domain.PlanningForecastDays*7 + 14

// LoadQuery asks for the load of From..To (local dates; "" From = today, ""
// To = the end of the kept horizon of the plan that speaks for From, at most
// MaxLoadDays days, or From when there is none). Draft (admins) uses today's
// draft in place of today's published plan; From must then be today.
type LoadQuery struct {
	From  string
	To    string
	Draft bool
}

// PlanningLoadStore is the workstation-load side of the planning store. Like
// PlanningStore only the SQL store has it.
type PlanningLoadStore interface {
	// PlanningLoad returns a validation error for a reversed or too long range
	// and for Draft with From not today, and ErrPlanDraftNotFound for Draft
	// without a draft of today.
	PlanningLoad(ctx context.Context, query LoadQuery) (domain.WorkstationLoad, error)
}

var _ PlanningLoadStore = (*SQLiteStore)(nil)

// addPlanningDays shifts a valid "YYYY-MM-DD" by n days.
func addPlanningDays(date string, n int) string {
	parsed, err := time.Parse(planningDateLayout, date)
	if err != nil {
		return date
	}
	return parsed.AddDate(0, 0, n).Format(planningDateLayout)
}

func (s *SQLiteStore) PlanningLoad(ctx context.Context, query LoadQuery) (domain.WorkstationLoad, error) {
	tenantID, err := tenantFromContext(ctx)
	if err != nil {
		return domain.WorkstationLoad{}, err
	}
	data, err := loadPlanningData(ctx, s.db, tenantID)
	if err != nil {
		return domain.WorkstationLoad{}, err
	}
	today := planningToday(s.planningNow(), data.location)
	from := strings.TrimSpace(query.From)
	if from == "" {
		from = today
	}
	to := strings.TrimSpace(query.To)
	if !ValidPlanningDate(from) || (to != "" && !ValidPlanningDate(to)) {
		return domain.WorkstationLoad{}, newValidationError(invalidPlanningDate)
	}
	if query.Draft && from != today {
		return domain.WorkstationLoad{}, newValidationError(loadDraftTodayMessage)
	}
	last := addPlanningDays(from, domain.MaxLoadDays-1)
	if to != "" {
		if to < from {
			return domain.WorkstationLoad{}, newValidationError(loadRangeOrderMessage)
		}
		if to > last {
			return domain.WorkstationLoad{}, newValidationError(loadRangeTooLongMessage)
		}
	}

	// Every plan that can speak for a date of the range, the draft of today in
	// place of today's published plan when asked.
	until := to
	if until == "" {
		until = last
	}
	plans, err := loadPublishedPlans(ctx, s.db, tenantID, addPlanningDays(from, -loadLookbackDays), addPlanningDays(until, 1))
	if err != nil {
		return domain.WorkstationLoad{}, err
	}
	source := domain.LoadSourcePublished
	if query.Draft {
		draft, err := loadPlan(ctx, s.db, tenantID, today, domain.PlanStatusDraft)
		if err != nil {
			return domain.WorkstationLoad{}, err
		}
		if draft == nil {
			return domain.WorkstationLoad{}, ErrPlanDraftNotFound
		}
		kept := plans[:0]
		for _, plan := range plans {
			if plan.Date != today {
				kept = append(kept, plan)
			}
		}
		plans = append(kept, *draft)
		source = domain.LoadSourceDraft
	}
	if to == "" {
		to = defaultLoadTo(plans, from, last)
	}

	workers, err := s.loadWorkers(ctx, data, tenantID, from, to, today)
	if err != nil {
		return domain.WorkstationLoad{}, err
	}
	load, err := planner.Load(planner.LoadInput{
		Hours: data.hours, From: from, To: to, MachineTypes: data.types, Machines: data.machines,
		Downtimes: data.downtimes, Workers: workers, Blocks: planner.LoadBlocks(plans, from, to), Source: source,
	})
	if errors.Is(err, planner.ErrInvalidHours) {
		return domain.WorkstationLoad{}, newValidationError(loadHoursMessage)
	}
	return load, err
}

// defaultLoadTo is the end of the kept horizon of the plan that speaks for
// from (its own plan, else the most recent earlier plan covering it), capped
// at last; from itself when no plan covers it.
func defaultLoadTo(plans []domain.ProductionPlan, from, last string) string {
	to := from
	var best *domain.ProductionPlan
	for i := range plans {
		plan := &plans[i]
		if plan.Date > from || (plan.Date < from && plan.HorizonEnd < from) {
			continue
		}
		if best == nil || plan.Date > best.Date {
			best = plan
		}
	}
	if best != nil && best.HorizonEnd > to {
		to = best.HorizonEnd
	}
	if to > last {
		to = last
	}
	return to
}

// loadWorkers gives every user their presence on each date of from..to by the
// attendance rules: an admin override wins; otherwise a date up to today
// counts the day's sign-in, and a later date counts as present (sign-ins say
// nothing about the future; the planner assumes the same).
func (s *SQLiteStore) loadWorkers(
	ctx context.Context, data planningData, tenantID, from, to, today string,
) ([]planner.Worker, error) {
	overrides, err := attendanceOverrides(ctx, s.db, tenantID, from)
	if err != nil {
		return nil, err
	}
	signIns := map[string]map[string]bool{}
	for date := from; date <= to && date <= today; date = addPlanningDays(date, 1) {
		if signIns[date], err = signedInUsers(ctx, s.db, tenantID, date, data.location); err != nil {
			return nil, err
		}
	}
	workers := make([]planner.Worker, 0, len(data.users))
	for _, user := range data.users {
		presence := map[string]bool{}
		for date := from; date <= to; date = addPlanningDays(date, 1) {
			if present, ok := overrides[user.id][date]; ok {
				presence[date] = present
			} else if date <= today {
				presence[date] = signIns[date][user.id]
			}
		}
		workers = append(workers, planner.Worker{UserID: user.id, Username: user.username, Presence: presence})
	}
	return workers, nil
}
