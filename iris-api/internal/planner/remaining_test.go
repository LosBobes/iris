package planner

import (
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Remaining minutes of in-progress steps (D-028): a re-plan places a started
// step only for the working time it still needs.

// startedChain is one order: an in-progress offset step of firstMinutes that
// started at startedAt (RFC 3339), then a 30-minute cutting step.
func startedChain(firstMinutes float64, startedAt string) Order {
	first := stepNode("s1", "Štampa", typeOffset, firstMinutes, 1)
	first.Status = domain.ProcessStepInProgress
	first.StartedAt = startedAt
	return newOrder("o1", "2026-0001", linearGraph(first, stepNode("s2", "Sečenje", typeCut, 30, 1)))
}

func TestInProgressPlacedForRemainingMinutesAcrossBreak(t *testing.T) {
	// 5 h step started at 09:30 (07:30Z, CEST); re-planned at 12:00. Worked:
	// 09:30-11:00 and 11:30-12:00 = 2 h (the 11:00-11:30 break excluded), so 3 h
	// are left: 12:00-15:00.
	in := baseInput()
	in.Start = at("2026-10-19T12:00")
	in.Orders = []Order{startedChain(300, "2026-10-19T07:30:00Z")}
	res := mustPlan(t, in)
	block := one(t, res, "o1", "s1")
	expectSpan(t, block, "2026-10-19T12:00", "2026-10-19T15:00", 180)
	if !block.Locked {
		t.Fatalf("an in-progress block must stay locked: %+v", block)
	}
	expectSpan(t, one(t, res, "o1", "s2"), "2026-10-20T07:00", "2026-10-20T07:30", 30)
	if _, found := issueFor(res, "o1", "s1"); found {
		t.Fatalf("no issue expected: %+v", res.Issues)
	}
}

func TestInProgressStartedYesterday(t *testing.T) {
	// Started Monday 14:00 (12:00Z); re-planned Tuesday 08:00. Worked: Monday
	// 14:00-15:00 plus Tuesday 07:00-08:00 = 2 h of 5 h, the night excluded.
	in := baseInput()
	in.Date = "2026-10-20"
	in.Start = at("2026-10-20T08:00")
	in.Orders = []Order{startedChain(300, "2026-10-19T12:00:00Z")}
	res := mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "s1"), "2026-10-20T08:00", "2026-10-20T11:00", 180)

	// Started the Friday before: the weekend counts for nothing.
	in = baseInput()
	in.Orders = []Order{startedChain(300, "2026-10-16T11:00:00Z")} // Friday 13:00
	res = mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "s1"), "2026-10-19T07:00", "2026-10-19T10:00", 180)
}

func TestInProgressWithoutStartedAtKeepsFullDuration(t *testing.T) {
	in := baseInput()
	in.Start = at("2026-10-19T12:00")
	in.Orders = []Order{startedChain(120, "")}
	res := mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "s1"), "2026-10-19T12:00", "2026-10-19T14:00", 120)

	// A start after Start (clock skew) counts as no work done yet.
	in.Orders = []Order{startedChain(120, "2026-10-19T11:00:00Z")} // 13:00 local
	res = mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "s1"), "2026-10-19T12:00", "2026-10-19T14:00", 120)
}

func TestInProgressOverrun(t *testing.T) {
	// A 60-minute step started at 07:00 (05:00Z) and still running at 09:00:
	// nothing is left, so it gets a visible 1-minute block, its successor may
	// start at 09:00, and an overrun issue reports 120 of 60 minutes.
	in := baseInput()
	in.Start = at("2026-10-19T09:00")
	in.Orders = []Order{startedChain(60, "2026-10-19T05:00:00Z")}
	res := mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "s1"), "2026-10-19T09:00", "2026-10-19T09:01", 1)
	expectSpan(t, one(t, res, "o1", "s2"), "2026-10-19T09:00", "2026-10-19T09:30", 30)
	issue := expectIssue(t, res, "o1", "s1", domain.PlanIssueOverrun)
	if !strings.Contains(issue.Message, "120 min") || !strings.Contains(issue.Message, "60 min") {
		t.Fatalf("overrun message: %q", issue.Message)
	}
	if f := forecastFor(t, res, "o1"); f.Unplannable || f.EstimatedFinish == nil {
		t.Fatalf("an overrun must not make the order unplannable: %+v", f)
	}

	// Exactly on time is not an overrun.
	in.Orders = []Order{startedChain(120, "2026-10-19T05:00:00Z")}
	res = mustPlan(t, in)
	if _, found := issueFor(res, "o1", "s1"); found {
		t.Fatalf("no overrun expected at exactly the duration: %+v", res.Issues)
	}
}

func TestInProgressOverrunReportedForPinnedBlock(t *testing.T) {
	// A re-plan keeps the published locked block, but the overrun is still
	// reported.
	in := baseInput()
	in.Start = at("2026-10-19T09:00")
	in.Orders = []Order{startedChain(60, "2026-10-19T05:00:00Z")}
	machine := "m-off-1"
	in.Pinned = []domain.PlanAssignment{{
		ID: "o1:s1:1", WorkOrderID: "o1", OrderNumber: "2026-0001", StepNodeID: "s1", StepLabel: "Štampa",
		MachineID: &machine, MachineName: "Heidelberg #1", LeadUserID: "u-ana", UserIDs: []string{"u-ana"},
		Start: "2026-10-19T07:00", End: "2026-10-19T08:00", Minutes: 60, Part: 1, Parts: 1, Locked: true,
	}}
	res := mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "s1"), "2026-10-19T07:00", "2026-10-19T08:00", 60)
	expectIssue(t, res, "o1", "s1", domain.PlanIssueOverrun)
}

func TestWorkingBetween(t *testing.T) {
	cal, err := newCalendar(domain.DefaultWorkingHours())
	if err != nil {
		t.Fatal(err)
	}
	minute := func(s string) int64 { return at(s).Unix() / 60 }
	cases := []struct {
		from, to string
		want     int64
	}{
		{"2026-10-19T07:00", "2026-10-19T15:00", 450},
		{"2026-10-19T10:30", "2026-10-19T12:00", 60},
		{"2026-10-19T11:10", "2026-10-19T11:20", 0},
		{"2026-10-16T14:00", "2026-10-19T08:00", 120},
		{"2026-10-19T09:00", "2026-10-19T08:00", 0},
	}
	for _, tc := range cases {
		if got := cal.workingBetween(minute(tc.from), minute(tc.to)); got != tc.want {
			t.Errorf("workingBetween(%s, %s) = %d, want %d", tc.from, tc.to, got, tc.want)
		}
	}
}
