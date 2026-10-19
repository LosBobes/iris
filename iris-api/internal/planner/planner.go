// Package planner schedules work-order process steps onto machines and people
// over working hours (D-026, the "Planiranje" module). It is pure: no I/O, no
// clock reads (the caller passes Start / now), and deterministic — the same
// Input always yields the same Result.
package planner

import (
	"errors"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Worker is one organization user as the planner sees them.
type Worker struct {
	UserID   string
	Username string
	// MachineTypeIDs the worker may run (lead a step on).
	MachineTypeIDs []string
	// Presence by local date ("YYYY-MM-DD"). A date that is missing counts as
	// present: the caller fills in the plan date (attendance) and any known
	// overrides on later dates.
	Presence map[string]bool
}

// Order is one open work order that has a process.
type Order struct {
	ID         string
	Number     string
	ClientName string
	// DueDate is "YYYY-MM-DD" (nil = no deadline).
	DueDate  *string
	Priority domain.WorkOrderPriority
	// Quantity multiplies MinutesPerUnit; below 1 counts as 1.
	Quantity int
	// Graph is the order's process with per-order step statuses. Done and
	// skipped steps are finished; in-progress steps are locked.
	Graph domain.ProcessGraph
	// CreatedAt breaks ties between otherwise equal orders (older first).
	CreatedAt string
}

// Input is everything one planning run needs.
type Input struct {
	Hours domain.WorkingHours
	// Date is the plan's day ("YYYY-MM-DD", local to Hours.TimeZone).
	Date string
	// Start is when planning begins: the start of Date's shift for a full plan,
	// or the current time for a re-plan (nothing is placed before it).
	Start time.Time
	// HorizonDays is how many working days (Date included) may be used; steps
	// that do not fit get PlanIssueNoCapacity. Zero means
	// domain.PlanningForecastDays.
	HorizonDays  int
	MachineTypes []domain.MachineType
	Machines     []domain.Machine
	// Downtimes are the machines' unavailability windows (D-028): busy time
	// on the unit, like a booking nothing can be placed over.
	Downtimes []domain.MachineDowntime
	Workers   []Worker
	Orders    []Order
	// Pinned are blocks kept exactly as they are (locked steps of the published
	// plan when re-planning). Their machine and people are busy for that time.
	Pinned []domain.PlanAssignment
}

// Result is the outcome of a run over the whole horizon.
type Result struct {
	// Assignments of every day in the horizon, sorted by Start, then machine
	// name, then order number. The caller keeps the plan date's blocks for the
	// ProductionPlan.
	Assignments []domain.PlanAssignment
	// Issues are steps that could not be placed (plus missing durations).
	Issues []domain.PlanIssue
	// Forecast has one entry per order in Input.Orders.
	Forecast []domain.OrderForecast
}

// ErrInvalidHours is returned for an unknown time zone or malformed shifts.
var ErrInvalidHours = errors.New("planner: invalid working hours")

// Plan schedules the open steps of Input.Orders.
//
// Rules (D-026):
//   - A step may start only after every step upstream of it (through any
//     items, as in the web's predecessorSteps) has finished, plus the
//     inter-operation time Hours.TransferMinutes (D-028) counted in working
//     time after the latest upstream end: a lag pauses for breaks and the end
//     of the shift and may cross a day boundary. With 0 steps chain back to
//     back. Done and skipped steps are already finished; in-progress steps not
//     in Pinned are placed first, at Start, and marked Locked (never shifted
//     by a lag, nor are Pinned blocks); their successors get the lag.
//   - Duration is domain.StepDurationMinutes(step, order.Quantity). A step
//     with no times set is placed with 0 minutes and gets a
//     PlanIssueMissingDuration issue.
//   - A step with a MachineTypeID needs one in-service machine unit of that
//     type and a crew of domain.StepCrewSize(step) present people, at least
//     one of them (the lead) qualified for the type; the other helpers can be
//     anyone present. A step without a machine type needs only the crew (lead =
//     first crew member). The machine and every crew member are busy for the
//     whole block. A machine is also busy during its Downtimes (D-028); a
//     Pinned block that overlaps a downtime of its machine is kept but
//     reported as PlanIssueMachineDown.
//   - Work happens only inside shifts, pausing for breaks; an exception date
//     in Hours (a day off or one-off hours, D-028) replaces that date's
//     weekday pattern. A step that does not finish by the end of a shift
//     carries over to the start of the next working day on the same machine
//     with the same crew, and nothing else is
//     put between its parts; each day is a separate PlanAssignment (Part /
//     Parts). If the same machine or crew is unavailable the next day
//     (absence), the whole step must be placed elsewhere.
//   - Order of placement: most urgent first. Urgency is the slack between the
//     order's due date (end of that day's shift; no due date = after the
//     horizon) and the remaining work on its longest chain of steps; priority
//     "urgent" and "high" go before "normal" and "low" at equal slack; ties go
//     to the older order, then the order number. The goal is to meet due
//     dates first and then finish as many orders as possible.
//   - Each step is placed at the earliest time its machine and crew are all
//     free; among equal options prefer the machine and people with the least
//     planned time so far, then the lowest name.
//   - Assignment IDs are deterministic: "<workOrderID>:<stepNodeID>:<part>".
//
// Forecast: EstimatedFinish is the local date of the order's last block
// (or of Start's date when nothing is left to do); Late when that is after
// DueDate; Unplannable (and EstimatedFinish nil) when any of its steps has an
// issue other than PlanIssueMissingDuration.
func Plan(in Input) (Result, error) {
	return plan(in)
}

// CheckDraft returns the conflicts in hand-edited assignments of one day:
// a machine or person booked twice at the same time, a block outside working
// hours or overlapping a break, a lead not qualified for the machine's type,
// a machine out of service, of the wrong type or in a downtime window, a crew
// smaller than the step's crew size, or a step starting before an upstream
// step's block ends (or before the inter-operation time after it has elapsed).
// Each conflict is a domain.PlanIssueConflict with a Serbian message.
func CheckDraft(in Input, assignments []domain.PlanAssignment) []domain.PlanIssue {
	return checkDraft(in, assignments)
}

// Drift compares today's published plan with the orders' current step
// statuses at now (local time) and suggests a re-plan when: a block whose
// start is more than 15 minutes in the past belongs to a step still pending,
// a block whose end is in the past belongs to a step not done/skipped, a
// step is in progress without any block of today covering now, or a block of
// an unfinished step lies in a downtime window of its machine (D-028).
// Reasons are short Serbian sentences naming the order number and step.
func Drift(plan domain.ProductionPlan, orders []Order, downtimes []domain.MachineDowntime, now time.Time) domain.PlanDrift {
	return drift(plan, orders, downtimes, now)
}
