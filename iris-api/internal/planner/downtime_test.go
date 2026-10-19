package planner

import (
	"reflect"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Machine downtime windows and working-hours exception dates (D-028).

func downtime(id, machine, from, to string) domain.MachineDowntime {
	return domain.MachineDowntime{ID: id, MachineID: machine, From: from, To: to, Note: "servis"}
}

func TestPlanSkipsDowntimeWindow(t *testing.T) {
	// With one offset machine down 08:00-10:00, a 60-minute step placed at
	// 07:00 fits before the window; a second one must wait until it ends.
	in := oneOffsetMachine(baseInput())
	in.Downtimes = []domain.MachineDowntime{downtime("d1", "m-off-1", "2026-10-19T08:00", "2026-10-19T10:00")}
	in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 60), singleStepOrder("o2", "2", typeOffset, 60)}
	res := mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "s1"), "2026-10-19T07:00", "2026-10-19T08:00", 60)
	expectSpan(t, one(t, res, "o2", "s1"), "2026-10-19T10:00", "2026-10-19T11:00", 60)
	if len(res.Issues) != 0 {
		t.Fatalf("downtime alone is no issue: %+v", res.Issues)
	}
	if got := CheckDraft(in, res.Assignments); len(got) != 0 {
		t.Fatalf("planner output must be conflict-free: %+v", got)
	}

	// A step that would run into the window moves after it (no splitting); it
	// then spans the 11:00-11:30 break.
	in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 90)}
	res = mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "s1"), "2026-10-19T10:00", "2026-10-19T12:00", 90)

	// With a second unit free, the step goes there instead.
	in = baseInput()
	in.Downtimes = []domain.MachineDowntime{downtime("d1", "m-off-1", "2026-10-19T07:00", "2026-10-19T15:00")}
	in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 60)}
	s1 := one(t, mustPlan(t, in), "o1", "s1")
	if *s1.MachineID != "m-off-2" || s1.Start != "2026-10-19T07:00" {
		t.Fatalf("expected the free unit: %+v", s1)
	}

	// A multi-day window pushes work to the day after it ends.
	in = oneOffsetMachine(baseInput())
	in.Downtimes = []domain.MachineDowntime{downtime("d1", "m-off-1", "2026-10-19T07:00", "2026-10-20T12:00")}
	in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 60)}
	expectSpan(t, one(t, mustPlan(t, in), "o1", "s1"), "2026-10-20T12:00", "2026-10-20T13:00", 60)

	// Malformed or unknown-machine windows are ignored.
	in.Downtimes = []domain.MachineDowntime{downtime("d1", "m-off-1", "nope", "2026-10-20T12:00"), downtime("d2", "ghost", "2026-10-19T07:00", "2026-10-19T15:00")}
	expectSpan(t, one(t, mustPlan(t, in), "o1", "s1"), "2026-10-19T07:00", "2026-10-19T08:00", 60)
}

func TestPinnedBlockInDowntimeIsReported(t *testing.T) {
	in := baseInput()
	in.Start = at("2026-10-19T09:00")
	in.Downtimes = []domain.MachineDowntime{downtime("d1", "m-off-1", "2026-10-19T09:30", "2026-10-19T11:00")}
	in.Orders = []Order{newOrder("o1", "2026-0001", linearGraph(
		stepNode("s1", "Štampa", typeOffset, 120, 1), stepNode("s2", "Sečenje", typeCut, 30, 1),
	))}
	pinned := domain.PlanAssignment{
		ID: "o1:s1:1", WorkOrderID: "o1", OrderNumber: "2026-0001", StepNodeID: "s1", StepLabel: "Štampa",
		MachineID: sp("m-off-1"), MachineName: "Heidelberg #1", LeadUserID: "u-ana", UserIDs: []string{"u-ana"},
		Start: "2026-10-19T08:00", End: "2026-10-19T10:00", Minutes: 120, Part: 1, Parts: 1, Locked: true,
	}
	in.Pinned = []domain.PlanAssignment{pinned}
	res := mustPlan(t, in)
	// The block is kept as it is and the successor follows it.
	expectSpan(t, one(t, res, "o1", "s1"), "2026-10-19T08:00", "2026-10-19T10:00", 120)
	expectSpan(t, one(t, res, "o1", "s2"), "2026-10-19T10:00", "2026-10-19T10:30", 30)
	is := expectIssue(t, res, "o1", "s1", domain.PlanIssueMachineDown)
	if !strings.Contains(is.Message, "Nalog 2026-0001, korak „Štampa“: mašina „Heidelberg #1“ je van pogona 19.10.2026 09:30 – 19.10.2026 11:00") {
		t.Fatalf("message: %s", is.Message)
	}
	if forecastFor(t, res, "o1").Unplannable {
		t.Fatal("a machine_down issue must not make the order unplannable")
	}
	// CheckDraft flags the same block as a conflict.
	got := CheckDraft(in, res.Assignments)
	if !containsIssue(got, "mašina „Heidelberg #1“ je van pogona 19.10.2026 09:30 – 19.10.2026 11:00") {
		t.Fatalf("draft conflict missing: %+v", got)
	}
	for _, issue := range got {
		if issue.Code != domain.PlanIssueConflict {
			t.Fatalf("CheckDraft codes are conflicts only: %+v", issue)
		}
	}
	// A block touching the window is fine.
	in.Downtimes[0].From = "2026-10-19T10:00"
	if got := CheckDraft(in, []domain.PlanAssignment{pinned}); len(got) != 0 {
		t.Fatalf("touching window flagged: %+v", got)
	}
}

func TestDriftReportsDowntime(t *testing.T) {
	block := driftBlock("b", "2026-10-19T09:00", "2026-10-19T11:00")
	block.MachineID, block.MachineName = sp("m-off-1"), "Heidelberg #1"
	plan := driftPlan(block)
	down := []domain.MachineDowntime{downtime("d1", "m-off-1", "2026-10-19T10:00", "2026-10-19T12:00")}
	got := Drift(plan, []Order{driftOrder(domain.ProcessStepInProgress)}, down, at("2026-10-19T09:30"))
	want := "Nalog 2026-0012, korak „Štampa“: mašina „Heidelberg #1“ je van pogona 19.10.2026 10:00 – 19.10.2026 12:00, a korak je planiran na njoj."
	if !got.Suggested || len(got.Reasons) != 1 || got.Reasons[0] != want {
		t.Fatalf("drift = %+v", got)
	}
	if got := Drift(plan, []Order{driftOrder(domain.ProcessStepDone)}, down, at("2026-10-19T09:30")); got.Suggested {
		t.Fatalf("a finished step does not care about the downtime: %+v", got)
	}
	other := []domain.MachineDowntime{downtime("d1", "m-off-2", "2026-10-19T10:00", "2026-10-19T12:00")}
	if got := Drift(plan, []Order{driftOrder(domain.ProcessStepInProgress)}, other, at("2026-10-19T09:30")); got.Suggested {
		t.Fatalf("another machine's downtime is irrelevant: %+v", got)
	}
}

func exceptionInput() Input {
	in := baseInput()
	in.Hours.Exceptions = []domain.WorkingHoursException{
		{Date: "2026-10-20", Off: true},
		{Date: "2026-10-24", Start: "08:00", End: "12:00", Breaks: []domain.WorkingBreak{}},
	}
	return in
}

func TestPlanRespectsExceptionDates(t *testing.T) {
	// Tuesday is a day off: a step carrying over Monday continues Wednesday.
	in := exceptionInput()
	in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 500)}
	res := mustPlan(t, in)
	bs := blocks(res, "o1", "s1")
	if len(bs) != 2 || bs[0].Start != "2026-10-19T07:00" || bs[1].Start != "2026-10-21T07:00" || bs[1].Minutes != 50 {
		t.Fatalf("carry-over across the day off: %s", debugAssignments(bs))
	}
	if f := forecastFor(t, res, "o1"); f.EstimatedFinish == nil || *f.EstimatedFinish != "2026-10-21" {
		t.Fatalf("forecast: %+v", f)
	}

	// Saturday has one-off hours 08:00-12:00: work planned from Saturday
	// starts there, and a 300-minute step spills into Monday.
	in.Date, in.Start = "2026-10-24", at("2026-10-24T06:00")
	in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 300)}
	res = mustPlan(t, in)
	bs = blocks(res, "o1", "s1")
	if len(bs) != 2 {
		t.Fatalf("saturday: %s", debugAssignments(bs))
	}
	expectSpan(t, bs[0], "2026-10-24T08:00", "2026-10-24T12:00", 240)
	expectSpan(t, bs[1], "2026-10-26T07:00", "2026-10-26T08:00", 60)

	// Planning on the day off itself yields nothing that day.
	in.Date, in.Start = "2026-10-20", at("2026-10-20T07:00")
	in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 60)}
	expectSpan(t, one(t, mustPlan(t, in), "o1", "s1"), "2026-10-21T07:00", "2026-10-21T08:00", 60)

	// CheckDraft: a block on the exception day off, or outside the one-off hours.
	in = exceptionInput()
	in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 60)}
	got := CheckDraft(in, []domain.PlanAssignment{{
		ID: "o1:s1:1", WorkOrderID: "o1", OrderNumber: "1", StepNodeID: "s1", StepLabel: "Štampa",
		MachineID: sp("m-off-1"), MachineName: "Heidelberg #1", LeadUserID: "u-ana", UserIDs: []string{"u-ana"},
		Start: "2026-10-20T08:00", End: "2026-10-20T09:00", Minutes: 60, Part: 1, Parts: 1,
	}})
	if !containsIssue(got, "neradnom danu") {
		t.Fatalf("day off not enforced: %+v", got)
	}
	got = CheckDraft(in, []domain.PlanAssignment{{
		ID: "o1:s1:1", WorkOrderID: "o1", OrderNumber: "1", StepNodeID: "s1", StepLabel: "Štampa",
		MachineID: sp("m-off-1"), MachineName: "Heidelberg #1", LeadUserID: "u-ana", UserIDs: []string{"u-ana"},
		Start: "2026-10-24T11:00", End: "2026-10-24T13:00", Minutes: 120, Part: 1, Parts: 1,
	}})
	if !containsIssue(got, "van radnog vremena") {
		t.Fatalf("one-off hours not enforced: %+v", got)
	}
}

func TestExceptionValidation(t *testing.T) {
	cases := map[string][]domain.WorkingHoursException{
		"bad date":      {{Date: "2026-13-01", Off: true}},
		"short date":    {{Date: "2026-1-1", Off: true}},
		"duplicate":     {{Date: "2026-10-20", Off: true}, {Date: "2026-10-20", Start: "08:00", End: "12:00"}},
		"reversed":      {{Date: "2026-10-20", Start: "12:00", End: "08:00"}},
		"bad clock":     {{Date: "2026-10-20", Start: "8:00", End: "12:00"}},
		"break outside": {{Date: "2026-10-20", Start: "08:00", End: "12:00", Breaks: []domain.WorkingBreak{{Start: "12:00", End: "12:30"}}}},
	}
	for name, exceptions := range cases {
		hours := domain.DefaultWorkingHours()
		hours.Exceptions = exceptions
		if msg := ValidateWorkingHours(hours); msg == "" {
			t.Errorf("%s: expected a validation message", name)
		}
	}
	hours := domain.DefaultWorkingHours()
	for i := 0; i <= domain.MaxWorkingHoursExceptions; i++ {
		hours.Exceptions = append(hours.Exceptions, domain.WorkingHoursException{Date: at("2027-01-01T00:00").AddDate(0, 0, i).Format(layoutDate), Off: true})
	}
	if msg := ValidateWorkingHours(hours); !strings.Contains(msg, "najviše") {
		t.Fatalf("too many exceptions: %q", msg)
	}
	hours.Exceptions = hours.Exceptions[:domain.MaxWorkingHoursExceptions]
	if msg := ValidateWorkingHours(hours); msg != "" {
		t.Fatalf("max exceptions must be valid: %q", msg)
	}
	// A day-off exception ignores whatever shift fields it carries.
	hours.Exceptions = []domain.WorkingHoursException{{Date: "2026-10-20", Off: true, Start: "zz"}}
	if msg := ValidateWorkingHours(hours); msg != "" {
		t.Fatalf("day off with junk shift: %q", msg)
	}
}

func TestDowntimesAndExceptionsAreDeterministic(t *testing.T) {
	in := genInput(5, 30, 6, 6, 7)
	in.Pinned = nil
	in.Hours.TransferMinutes = 15
	in.Hours.Exceptions = []domain.WorkingHoursException{
		{Date: "2026-10-21", Off: true},
		{Date: "2026-10-24", Start: "08:00", End: "13:00", Breaks: []domain.WorkingBreak{{Start: "10:00", End: "10:15"}}},
	}
	for i := 0; i < 6; i++ {
		in.Downtimes = append(in.Downtimes, downtime("d", "m0"+string(rune('0'+i)), "2026-10-20T09:00", "2026-10-20T13:00"))
	}
	first := mustPlan(t, in)
	for i := 0; i < 3; i++ {
		// The downtime order must not matter.
		in.Downtimes[0], in.Downtimes[len(in.Downtimes)-1] = in.Downtimes[len(in.Downtimes)-1], in.Downtimes[0]
		if again := mustPlan(t, in); !reflect.DeepEqual(first, again) {
			t.Fatalf("run %d differs", i)
		}
	}
	if got := CheckDraft(in, first.Assignments); len(got) != 0 {
		t.Fatalf("planner output must be conflict-free: %+v", got)
	}
	for _, a := range first.Assignments {
		if strings.HasPrefix(a.Start, "2026-10-21") {
			t.Fatalf("block on the day off: %+v", a)
		}
	}
}
