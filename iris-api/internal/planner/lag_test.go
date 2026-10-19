package planner

import (
	"reflect"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Inter-operation time (D-028): the planner inserts Hours.TransferMinutes of
// working time between a step's end and any successor's start.

func lagInput(lag int) Input {
	in := baseInput()
	in.Hours.TransferMinutes = lag
	return in
}

func chainOrder(firstMinutes float64) Order {
	return newOrder("o1", "2026-0001", linearGraph(
		stepNode("s1", "Štampa", typeOffset, firstMinutes, 1),
		stepNode("s2", "Sečenje", typeCut, 30, 1),
	))
}

func TestLagInsideShift(t *testing.T) {
	in := lagInput(30)
	in.Orders = []Order{chainOrder(60)}
	res := mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "s1"), "2026-10-19T07:00", "2026-10-19T08:00", 60)
	expectSpan(t, one(t, res, "o1", "s2"), "2026-10-19T08:30", "2026-10-19T09:00", 30)
	if got := CheckDraft(in, res.Assignments); len(got) != 0 {
		t.Fatalf("planner output with a lag must be conflict-free: %+v", got)
	}
}

func TestLagCrossesBreak(t *testing.T) {
	// s1 ends exactly when the 11:00-11:30 break starts; a 30-minute lag runs
	// on after the break, so s2 starts at 12:00.
	in := lagInput(30)
	in.Orders = []Order{chainOrder(240)}
	res := mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "s1"), "2026-10-19T07:00", "2026-10-19T11:00", 240)
	expectSpan(t, one(t, res, "o1", "s2"), "2026-10-19T12:00", "2026-10-19T12:30", 30)

	// A lag starting mid-segment that reaches into the break continues after it.
	in.Orders = []Order{chainOrder(230)}
	res = mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "s1"), "2026-10-19T07:00", "2026-10-19T10:50", 230)
	expectSpan(t, one(t, res, "o1", "s2"), "2026-10-19T11:50", "2026-10-19T12:20", 30)
}

func TestLagCrossesEndOfDay(t *testing.T) {
	// The default shift has 450 working minutes; s1 fills Monday and the
	// 60-minute lag spills into Tuesday, so s2 starts Tuesday 08:00.
	in := lagInput(60)
	in.Orders = []Order{chainOrder(450)}
	res := mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "s1"), "2026-10-19T07:00", "2026-10-19T15:00", 450)
	expectSpan(t, one(t, res, "o1", "s2"), "2026-10-20T08:00", "2026-10-20T08:30", 30)
	f := forecastFor(t, res, "o1")
	if f.EstimatedFinish == nil || *f.EstimatedFinish != "2026-10-20" {
		t.Fatalf("forecast: %+v", f)
	}

	// Friday evening: the lag crosses the weekend onto Monday.
	in.Date = "2026-10-23"
	in.Start = at("2026-10-23T07:00")
	res = mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "s2"), "2026-10-26T08:00", "2026-10-26T08:30", 30)
}

func TestLagZeroReproducesChaining(t *testing.T) {
	in := genInput(7, 24, 5, 6, 6)
	want := mustPlan(t, in)
	in.Hours.TransferMinutes = 0
	got := mustPlan(t, in)
	if !reflect.DeepEqual(want, got) {
		t.Fatal("an explicit 0 lag must plan exactly like the default")
	}
}

func TestLagIsDeterministic(t *testing.T) {
	in := genInput(11, 30, 6, 6, 7)
	in.Hours.TransferMinutes = 45
	in.Pinned = nil // genInput pins a block of an order outside Orders
	first := mustPlan(t, in)
	for i := 0; i < 3; i++ {
		again := mustPlan(t, in)
		if !reflect.DeepEqual(first, again) {
			t.Fatalf("run %d differs", i)
		}
	}
	if got := CheckDraft(in, first.Assignments); len(got) != 0 {
		t.Fatalf("planner output with a lag must be conflict-free: %+v", got)
	}
	// Every successor starts at least the lag after its upstream end.
	gaps := 0
	for _, o := range in.Orders {
		gi := indexGraph(o.Graph)
		for _, id := range gi.stepIDs {
			bs := blocks(first, o.ID, id)
			if len(bs) == 0 {
				continue
			}
			for _, anc := range gi.ancestors(id) {
				ab := blocks(first, o.ID, anc)
				if len(ab) == 0 {
					continue
				}
				if bs[0].Start < ab[len(ab)-1].End {
					t.Fatalf("%s/%s starts before %s ends", o.ID, id, anc)
				}
				gaps++
			}
		}
	}
	if gaps == 0 {
		t.Fatal("test input has no chained steps")
	}
}

func TestLagDoesNotShiftLockedOrPinned(t *testing.T) {
	// A pinned block stays where it is; its successor waits for its end plus
	// the lag. An in-progress step is placed at Start regardless of the lag.
	in := lagInput(30)
	in.Start = at("2026-10-19T09:00")
	in.Orders = []Order{chainOrder(60)}
	in.Pinned = []domain.PlanAssignment{{
		ID: "o1:s1:1", WorkOrderID: "o1", OrderNumber: "2026-0001", StepNodeID: "s1", StepLabel: "Štampa",
		MachineID: sp("m-off-1"), MachineName: "Heidelberg #1", LeadUserID: "u-ana", UserIDs: []string{"u-ana"},
		Start: "2026-10-19T08:00", End: "2026-10-19T09:15", Minutes: 75, Part: 1, Parts: 1, Locked: true,
	}}
	res := mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "s1"), "2026-10-19T08:00", "2026-10-19T09:15", 75)
	expectSpan(t, one(t, res, "o1", "s2"), "2026-10-19T09:45", "2026-10-19T10:15", 30)

	// A pinned block that ended before Start: the lag already (partly) elapsed.
	in.Pinned[0].End = "2026-10-19T08:50"
	res = mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "s2"), "2026-10-19T09:20", "2026-10-19T09:50", 30)

	in.Pinned = nil
	g := chainOrder(60)
	g.Graph.Nodes[0].Status = domain.ProcessStepInProgress
	in.Orders = []Order{g}
	res = mustPlan(t, in)
	s1 := one(t, res, "o1", "s1")
	expectSpan(t, s1, "2026-10-19T09:00", "2026-10-19T10:00", 60)
	if !s1.Locked {
		t.Fatalf("in-progress step must be locked: %+v", s1)
	}
	expectSpan(t, one(t, res, "o1", "s2"), "2026-10-19T10:30", "2026-10-19T11:00", 30)
}

func TestLagValidation(t *testing.T) {
	for _, lag := range []int{-1, domain.MaxTransferMinutes + 1} {
		hours := domain.DefaultWorkingHours()
		hours.TransferMinutes = lag
		msg := ValidateWorkingHours(hours)
		if !strings.Contains(msg, "Međuoperacijsko vreme") {
			t.Fatalf("lag %d: %q", lag, msg)
		}
	}
	hours := domain.DefaultWorkingHours()
	hours.TransferMinutes = domain.MaxTransferMinutes
	if msg := ValidateWorkingHours(hours); msg != "" {
		t.Fatalf("max lag must be valid: %q", msg)
	}
}

func TestCheckDraftLag(t *testing.T) {
	in := checkInput()
	in.Hours.TransferMinutes = 30
	draft := []domain.PlanAssignment{
		blk("o1", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana"}, "2026-10-19T07:00", "2026-10-19T08:00"),
		blk("o1", "s2", "Sečenje", "m-cut-1", "u-cedo", []string{"u-cedo"}, "2026-10-19T08:15", "2026-10-19T08:45"),
	}
	got := CheckDraft(in, draft)
	if !containsIssue(got, "počinje pre isteka međuoperacijskog vremena (30 min) posle koraka „Štampa“") {
		t.Fatalf("missing lag conflict in %+v", got)
	}
	if containsIssue(got, "pre nego što se završi") {
		t.Fatalf("the plain upstream message belongs to an overlap only: %+v", got)
	}
	draft[1].Start, draft[1].End = "2026-10-19T08:30", "2026-10-19T09:00"
	if got := CheckDraft(in, draft); len(got) != 0 {
		t.Fatalf("a block exactly at the lag end is fine: %+v", got)
	}
	// The lag crosses the break: s1 ends at 11:00, s2 may start at 12:00.
	draft[0].Start, draft[0].End = "2026-10-19T07:00", "2026-10-19T11:00"
	draft[1].Start, draft[1].End = "2026-10-19T11:45", "2026-10-19T12:15"
	if got := CheckDraft(in, draft); !containsIssue(got, "međuoperacijskog vremena") {
		t.Fatalf("lag across the break not enforced: %+v", got)
	}
}
