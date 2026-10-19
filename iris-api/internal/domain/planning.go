package domain

import "time"

// Production planning ("Planiranje", D-026): machines, worker qualifications,
// attendance, working hours and day plans produced by internal/planner. The
// whole feature sits behind the "planning" organization module (off by
// default; requires "processes"). Step nodes of process graphs carry the
// planning fields (MachineTypeID, CrewSize, SetupMinutes, MinutesPerUnit; see
// ProcessNode).

// Planning limits.
const (
	MaxMachineNameLength    = 120
	MaxMachineNoteLength    = 500
	MaxCrewSize             = 50
	MaxStepMinutes          = 100000 // per setup and per unit
	PlanningForecastDays    = 14     // working days the forecast looks ahead
	MaxPlanAssignments      = 2000
	DefaultPlanningTimeZone = "Europe/Belgrade"
	// MaxTransferMinutes caps the inter-operation time (D-028): 8 hours.
	MaxTransferMinutes = 480
	// MaxWorkingHoursExceptions caps the exception-date list (D-028).
	MaxWorkingHoursExceptions = 400
	// PlanningLocalLayout is the local "YYYY-MM-DDTHH:MM" of plan blocks and
	// machine downtimes (no zone: the working-hours time zone applies).
	PlanningLocalLayout = "2006-01-02T15:04"
)

// MachineType groups interchangeable machine units ("Offset štampa B2").
// Process steps and worker qualifications reference a type, never a unit.
type MachineType struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// MachineTypeInput creates or renames a machine type.
type MachineTypeInput struct {
	Name string `json:"name"`
}

// Machine is one physical unit ("Heidelberg SM52 #1") of a machine type. Units
// out of service are never planned.
type Machine struct {
	ID            string `json:"id"`
	MachineTypeID string `json:"machineTypeId"`
	Name          string `json:"name"`
	InService     bool   `json:"inService"`
	Note          string `json:"note,omitempty"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
}

// MachineInput creates or updates a machine unit.
type MachineInput struct {
	MachineTypeID string `json:"machineTypeId"`
	Name          string `json:"name"`
	InService     bool   `json:"inService"`
	Note          string `json:"note,omitempty"`
}

// MachineDowntime is a dated window (D-028) in which a machine unit is not
// available: planned maintenance or a breakdown with a known end. From/To are
// local "YYYY-MM-DDTHH:MM" in the working-hours time zone, From < To. The
// planner treats the window as busy; a locked block overlapping it is reported
// as PlanIssueMachineDown and a hand-edited one as a conflict.
type MachineDowntime struct {
	ID        string `json:"id"`
	MachineID string `json:"machineId"`
	From      string `json:"from"`
	To        string `json:"to"`
	Note      string `json:"note,omitempty"`
	CreatedAt string `json:"createdAt"`
}

// MachineDowntimeInput creates a downtime window.
type MachineDowntimeInput struct {
	From string `json:"from"`
	To   string `json:"to"`
	Note string `json:"note,omitempty"`
}

// WorkerQualifications lists the machine types one organization user may run.
// Every user of the organization is a worker; a user with no qualifications
// can still help on a crew but never lead a step that needs a machine.
type WorkerQualifications struct {
	UserID         string   `json:"userId"`
	Username       string   `json:"username"`
	MachineTypeIDs []string `json:"machineTypeIds"`
}

// WorkerQualificationsInput replaces one user's qualifications.
type WorkerQualificationsInput struct {
	MachineTypeIDs []string `json:"machineTypeIds"`
}

// AttendanceEntry is one user's presence on a date. SignedIn is true when the
// user signed in that day (login_events, impersonation excluded); Override is
// the admin's explicit choice (nil = none); Present is the effective value
// (Override when set, else SignedIn).
type AttendanceEntry struct {
	UserID   string `json:"userId"`
	Username string `json:"username"`
	Date     string `json:"date"`
	SignedIn bool   `json:"signedIn"`
	Override *bool  `json:"override"`
	Present  bool   `json:"present"`
}

// AttendanceInput sets (Present true/false) or clears (Present nil) the
// override of one user on one date.
type AttendanceInput struct {
	Date    string `json:"date"`
	Present *bool  `json:"present"`
}

// WorkingBreak is a pause inside a working day, "HH:MM" local time.
type WorkingBreak struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// WorkingDay is one weekday's shift. Weekday is ISO: 1 = Monday … 7 = Sunday.
// Start/End are "HH:MM" local time with Start < End (no shift crosses
// midnight); breaks lie inside the shift and do not overlap.
type WorkingDay struct {
	Weekday int            `json:"weekday"`
	Start   string         `json:"start"`
	End     string         `json:"end"`
	Breaks  []WorkingBreak `json:"breaks"`
}

// WorkingHoursException overrides the weekly pattern on one civil date
// ("YYYY-MM-DD", D-028): with Off the date is a day off (a holiday) whatever
// its weekday; otherwise Start/End/Breaks are that date's one-off shift (the
// same rules as WorkingDay). The calendar consults exceptions before the
// weekday pattern.
type WorkingHoursException struct {
	Date   string         `json:"date"`
	Off    bool           `json:"off"`
	Start  string         `json:"start,omitempty"`
	End    string         `json:"end,omitempty"`
	Breaks []WorkingBreak `json:"breaks"`
}

// WorkingHours is the organization-wide shift calendar, stored in
// app_settings under "working_hours". Weekdays not listed are days off;
// Exceptions (at most MaxWorkingHoursExceptions) override single dates.
// TimeZone is an IANA name; plans, attendance dates and "now" use it.
//
// TransferMinutes is the inter-operation time ("međuoperacijsko vreme",
// D-028): one organization-wide average of the waiting and transfer time
// between two consecutive steps. The planner starts a step no earlier than
// that many minutes of working time after every upstream step ends (a lag
// pauses for breaks and the end of the shift, and may cross a day boundary).
// 0 (the default) chains steps back to back, as before D-028.
type WorkingHours struct {
	TimeZone        string                  `json:"timeZone"`
	Days            []WorkingDay            `json:"days"`
	TransferMinutes int                     `json:"transferMinutes"`
	Exceptions      []WorkingHoursException `json:"exceptions"`
}

// ShiftOn is the shift of a civil date: its exception when one exists (ok
// false for a day off), else the weekday's pattern (ok false when unlisted or
// the date is malformed).
func (h WorkingHours) ShiftOn(date string) (WorkingDay, bool) {
	for _, exception := range h.Exceptions {
		if exception.Date != date {
			continue
		}
		if exception.Off {
			return WorkingDay{}, false
		}
		return WorkingDay{Start: exception.Start, End: exception.End, Breaks: exception.Breaks}, true
	}
	parsed, err := time.Parse("2006-01-02", date)
	if err != nil {
		return WorkingDay{}, false
	}
	weekday := int(parsed.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	for _, day := range h.Days {
		if day.Weekday == weekday {
			return day, true
		}
	}
	return WorkingDay{}, false
}

// DefaultWorkingHours is Monday to Friday 07:00–15:00 with a 30-minute break
// at 11:00, in Europe/Belgrade.
func DefaultWorkingHours() WorkingHours {
	days := make([]WorkingDay, 0, 5)
	for weekday := 1; weekday <= 5; weekday++ {
		days = append(days, WorkingDay{
			Weekday: weekday, Start: "07:00", End: "15:00",
			Breaks: []WorkingBreak{{Start: "11:00", End: "11:30"}},
		})
	}
	return WorkingHours{TimeZone: DefaultPlanningTimeZone, Days: days, Exceptions: []WorkingHoursException{}}
}

// PlanStatus is the lifecycle of a day plan: a draft the admin edits, then the
// published plan operators follow. A date has at most one of each.
type PlanStatus string

const (
	PlanStatusDraft     PlanStatus = "draft"
	PlanStatusPublished PlanStatus = "published"
)

// PlanAssignment is one scheduled block of a step on one day. A step that
// carries over to the next working day is split into one block per day, with
// Part numbering them (1-based) out of Parts. Start/End are local
// "YYYY-MM-DDTHH:MM"; Minutes is working time inside the block (breaks
// excluded). LeadUserID is the qualified worker; UserIDs is the whole crew
// (lead first). MachineID is nil for a step without a machine type. Locked
// marks a step already in progress or done when the plan was made: re-planning
// keeps it where it is.
type PlanAssignment struct {
	ID          string   `json:"id"`
	WorkOrderID string   `json:"workOrderId"`
	OrderNumber string   `json:"orderNumber"`
	ClientName  string   `json:"clientName"`
	StepNodeID  string   `json:"stepNodeId"`
	StepLabel   string   `json:"stepLabel"`
	MachineID   *string  `json:"machineId"`
	MachineName string   `json:"machineName"`
	LeadUserID  string   `json:"leadUserId"`
	UserIDs     []string `json:"userIds"`
	Start       string   `json:"start"`
	End         string   `json:"end"`
	Minutes     int      `json:"minutes"`
	Part        int      `json:"part"`
	Parts       int      `json:"parts"`
	Locked      bool     `json:"locked"`
}

// PlanIssueCode explains why a step could not be planned (or a plan entry
// conflicts).
type PlanIssueCode string

const (
	// The step's machine type no longer exists.
	PlanIssueUnknownMachineType PlanIssueCode = "unknown_machine_type"
	// No machine unit of the type is in service.
	PlanIssueNoMachine PlanIssueCode = "no_machine"
	// Nobody present is qualified for the machine type, or the crew is larger
	// than the people present.
	PlanIssueNoWorkers PlanIssueCode = "no_workers"
	// The step does not fit within the planning horizon.
	PlanIssueNoCapacity PlanIssueCode = "no_capacity"
	// The step has no duration (no setup and no per-unit time); it is planned
	// as zero minutes and reported so the admin fills the times in.
	PlanIssueMissingDuration PlanIssueCode = "missing_duration"
	// Manual edit conflicts: the same machine or person is booked twice, a step
	// starts before its predecessor ends, or a block lies outside working hours.
	PlanIssueConflict PlanIssueCode = "conflict"
	// A locked (kept) block lies in a downtime window of its machine (D-028):
	// the machine is not available while the step is planned on it.
	PlanIssueMachineDown PlanIssueCode = "machine_down"
)

// PlanIssue is a step the plan could not place, or a conflict in an edited
// draft. Message is user-facing Serbian.
type PlanIssue struct {
	Code        PlanIssueCode `json:"code"`
	WorkOrderID string        `json:"workOrderId"`
	OrderNumber string        `json:"orderNumber"`
	StepNodeID  string        `json:"stepNodeId,omitempty"`
	StepLabel   string        `json:"stepLabel,omitempty"`
	Message     string        `json:"message"`
}

// OrderForecast is the planner's estimate for one open work order with a
// process: the local date its last step finishes (nil when some step cannot be
// planned within the horizon) and whether that is after its due date.
type OrderForecast struct {
	WorkOrderID     string  `json:"workOrderId"`
	OrderNumber     string  `json:"orderNumber"`
	ClientName      string  `json:"clientName"`
	DueDate         *string `json:"dueDate"`
	Priority        string  `json:"priority"`
	EstimatedFinish *string `json:"estimatedFinish"`
	Late            bool    `json:"late"`
	Unplannable     bool    `json:"unplannable"`
}

// ProductionPlan is a day plan (draft or published). The stored plan keeps
// every block its planner run produced over the whole horizon (Date through
// HorizonEnd; D-028), but the plan date is what is published and shown: the
// plan endpoints return only the Date's blocks, and GET /planning/plan/horizon
// the rest, grouped by day.
type ProductionPlan struct {
	ID     string     `json:"id"`
	Date   string     `json:"date"`
	Status PlanStatus `json:"status"`
	// HorizonEnd is the last working day the run could place steps on
	// (PlanningForecastDays working days from Date; Date itself for a day off).
	HorizonEnd  string           `json:"horizonEnd"`
	GeneratedAt string           `json:"generatedAt"`
	GeneratedBy string           `json:"generatedBy"`
	UpdatedAt   string           `json:"updatedAt"`
	UpdatedBy   string           `json:"updatedBy"`
	PublishedAt *string          `json:"publishedAt"`
	PublishedBy *string          `json:"publishedBy"`
	Assignments []PlanAssignment `json:"assignments"`
	Issues      []PlanIssue      `json:"issues"`
	// LateOrders are the orders this plan's run forecasts past their due date.
	LateOrders []OrderForecast `json:"lateOrders"`
}

// PlanHorizonDay is one day's blocks of a plan's kept horizon, sorted by
// start.
type PlanHorizonDay struct {
	Date        string           `json:"date"`
	Assignments []PlanAssignment `json:"assignments"`
}

// PlanHorizon is every block a plan's run produced, grouped by day from the
// plan date to HorizonEnd (days without a block are left out), with the run's
// issues. Hand edits only ever touch the plan date's blocks.
type PlanHorizon struct {
	PlanID      string           `json:"planId"`
	Status      PlanStatus       `json:"status"`
	Date        string           `json:"date"`
	HorizonEnd  string           `json:"horizonEnd"`
	GeneratedAt string           `json:"generatedAt"`
	UpdatedAt   string           `json:"updatedAt"`
	Days        []PlanHorizonDay `json:"days"`
	Issues      []PlanIssue      `json:"issues"`
}

// PlanDayHorizon is the answer of GET /planning/plan/horizon (admins): the
// kept horizon of the date's draft and published plan (nil when absent).
type PlanDayHorizon struct {
	Date      string       `json:"date"`
	Draft     *PlanHorizon `json:"draft"`
	Published *PlanHorizon `json:"published"`
}

// PlanDrift reports, for the published plan of today, why a re-plan is
// suggested: a planned block should have started or ended by now but its step
// is not in progress / done, or a step is in progress without being planned
// now. Empty Reasons means the day is on track.
type PlanDrift struct {
	Suggested bool     `json:"suggested"`
	Reasons   []string `json:"reasons"`
}

// PlanDay is everything about one date: the draft (admins only; nil for
// operators), the published plan, and drift (only for today's published plan).
type PlanDay struct {
	Date      string          `json:"date"`
	Draft     *ProductionPlan `json:"draft"`
	Published *ProductionPlan `json:"published"`
	Drift     *PlanDrift      `json:"drift"`
}

// PlanGenerateInput asks for a new draft for Date. With Replan the planner
// starts at the current time (Date must be today) and keeps locked blocks;
// otherwise it plans the whole working day.
type PlanGenerateInput struct {
	Date   string `json:"date"`
	Replan bool   `json:"replan"`
}

// PlanDraftInput replaces a draft's assignments after manual edits. The server
// recomputes Issues (conflict checks); it does not move anything.
type PlanDraftInput struct {
	Date        string           `json:"date"`
	Assignments []PlanAssignment `json:"assignments"`
}

// PlanPublishInput publishes the draft of Date (it replaces the published plan
// of that date and the draft is removed).
type PlanPublishInput struct {
	Date string `json:"date"`
}

// MyQueue is the signed-in user's blocks of the published plan for Date,
// ordered by start, each with the step's current status.
type MyQueue struct {
	Date        string        `json:"date"`
	PublishedAt *string       `json:"publishedAt"`
	Items       []MyQueueItem `json:"items"`
}

// MyQueueItem is one block of the user's queue.
type MyQueueItem struct {
	PlanAssignment
	StepStatus ProcessStepStatus `json:"stepStatus"`
	IsLead     bool              `json:"isLead"`
}
