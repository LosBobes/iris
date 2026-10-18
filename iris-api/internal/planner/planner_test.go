package planner

import (
	"errors"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func singleStepOrder(id, number, machineType string, minutes float64) Order {
	return newOrder(id, number, linearGraph(stepNode("s1", "Štampa", machineType, minutes, 1)))
}

func TestPlanLinearChainThroughItem(t *testing.T) {
	in := baseInput()
	g := domain.ProcessGraph{
		Nodes: []domain.ProcessNode{
			stepNode("s1", "Štampa", typeOffset, 60, 1),
			itemNode("i1"),
			stepNode("s2", "Sečenje", typeCut, 30, 1),
		},
		Edges: []domain.ProcessEdge{edge("s1", "i1"), edge("i1", "s2")},
	}
	in.Orders = []Order{newOrder("o1", "2026-0001", g)}
	res := mustPlan(t, in)

	s1 := one(t, res, "o1", "s1")
	expectSpan(t, s1, "2026-10-19T07:00", "2026-10-19T08:00", 60)
	if s1.MachineName != "Heidelberg #1" || s1.MachineID == nil || *s1.MachineID != "m-off-1" {
		t.Fatalf("s1 machine: %+v", s1)
	}
	if s1.LeadUserID != "u-ana" || len(s1.UserIDs) != 1 || s1.ID != "o1:s1:1" || s1.Part != 1 || s1.Parts != 1 || s1.Locked {
		t.Fatalf("s1: %+v", s1)
	}
	s2 := one(t, res, "o1", "s2")
	expectSpan(t, s2, "2026-10-19T08:00", "2026-10-19T08:30", 30)
	if s2.LeadUserID != "u-cedo" {
		t.Fatalf("s2 lead should be the least-loaded qualified worker, got %s", s2.LeadUserID)
	}
	if s1.OrderNumber != "2026-0001" || s1.ClientName != "Klijent" || s1.StepLabel != "Štampa" {
		t.Fatalf("denormalized fields: %+v", s1)
	}
	f := forecastFor(t, res, "o1")
	if f.EstimatedFinish == nil || *f.EstimatedFinish != "2026-10-19" || f.Late || f.Unplannable || f.Priority != "normal" {
		t.Fatalf("forecast: %+v", f)
	}
}

func TestPlanDurationUsesQuantity(t *testing.T) {
	in := baseInput()
	n := stepNode("s1", "Štampa", typeOffset, 10, 1)
	n.MinutesPerUnit = fl(0.5)
	o := newOrder("o1", "1", linearGraph(n))
	o.Quantity = 100
	in.Orders = []Order{o}
	res := mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "s1"), "2026-10-19T07:00", "2026-10-19T08:00", 60)
}

func TestPlanParallelBranches(t *testing.T) {
	g := domain.ProcessGraph{Nodes: []domain.ProcessNode{
		stepNode("a", "A", typeOffset, 60, 1),
		stepNode("b", "B", typeOffset, 60, 1),
	}}
	in := baseInput()
	in.Orders = []Order{newOrder("o1", "1", g)}
	res := mustPlan(t, in)
	a, b := one(t, res, "o1", "a"), one(t, res, "o1", "b")
	expectSpan(t, a, "2026-10-19T07:00", "2026-10-19T08:00", 60)
	expectSpan(t, b, "2026-10-19T07:00", "2026-10-19T08:00", 60)
	if a.MachineName == b.MachineName || a.LeadUserID == b.LeadUserID {
		t.Fatalf("parallel steps must use different machines and people: %+v %+v", a, b)
	}

	one1 := oneOffsetMachine(in)
	res = mustPlan(t, one1)
	expectSpan(t, one(t, res, "o1", "a"), "2026-10-19T07:00", "2026-10-19T08:00", 60)
	expectSpan(t, one(t, res, "o1", "b"), "2026-10-19T08:00", "2026-10-19T09:00", 60)
}

func TestPlanJoinWaitsForAllBranches(t *testing.T) {
	g := domain.ProcessGraph{
		Nodes: []domain.ProcessNode{
			stepNode("a", "A", typeOffset, 60, 1),
			stepNode("b", "B", typeOffset, 120, 1),
			stepNode("c", "C", typeCut, 30, 1),
		},
		Edges: []domain.ProcessEdge{edge("a", "c"), edge("b", "c")},
	}
	in := baseInput()
	in.Orders = []Order{newOrder("o1", "1", g)}
	res := mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "c"), "2026-10-19T09:00", "2026-10-19T09:30", 30)
}

func TestPlanUpstreamThroughStepsAndItems(t *testing.T) {
	// c depends on a only through b and an item; done b must not hide a.
	g := domain.ProcessGraph{
		Nodes: []domain.ProcessNode{
			stepNode("a", "A", typeOffset, 60, 1),
			stepNode("b", "B", typeOffset, 30, 1),
			itemNode("i"),
			stepNode("c", "C", typeCut, 30, 1),
		},
		Edges: []domain.ProcessEdge{edge("a", "b"), edge("b", "i"), edge("i", "c")},
	}
	g.Nodes[1].Status = domain.ProcessStepDone
	in := baseInput()
	in.Orders = []Order{newOrder("o1", "1", g)}
	res := mustPlan(t, in)
	if len(blocks(res, "o1", "b")) != 0 {
		t.Fatal("done step must not be planned")
	}
	expectSpan(t, one(t, res, "o1", "c"), "2026-10-19T08:00", "2026-10-19T08:30", 30)
}

func TestPlanCrewAndLead(t *testing.T) {
	t.Run("crew larger than people", func(t *testing.T) {
		in := baseInput()
		in.Orders = []Order{newOrder("o1", "2026-0001", linearGraph(stepNode("s1", "Štampa", typeOffset, 60, 5)))}
		res := mustPlan(t, in)
		is := expectIssue(t, res, "o1", "s1", domain.PlanIssueNoWorkers)
		if !containsIssue([]domain.PlanIssue{is}, "Nalog 2026-0001, korak „Štampa“: potrebno je 5 ljudi") {
			t.Fatalf("message: %s", is.Message)
		}
		if len(res.Assignments) != 0 || !forecastFor(t, res, "o1").Unplannable {
			t.Fatalf("expected nothing planned: %+v", res)
		}
	})
	t.Run("crew larger than people present any day", func(t *testing.T) {
		in := baseInput()
		for i := range in.Workers {
			if in.Workers[i].UserID == "u-ana" {
				continue
			}
			in.Workers[i].Presence = map[string]bool{}
			for d := time.Date(2026, 10, 19, 0, 0, 0, 0, time.UTC); d.Before(time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)); d = d.AddDate(0, 0, 1) {
				in.Workers[i].Presence[d.Format(layoutDate)] = false
			}
		}
		in.Orders = []Order{newOrder("o1", "1", linearGraph(stepNode("s1", "Štampa", typeOffset, 60, 2)))}
		res := mustPlan(t, in)
		expectIssue(t, res, "o1", "s1", domain.PlanIssueNoWorkers)
	})
	t.Run("lead must be qualified, helpers anyone", func(t *testing.T) {
		in := baseInput()
		in.Workers = []Worker{
			{UserID: "u-a", Username: "aaa"},
			{UserID: "u-z", Username: "zed", MachineTypeIDs: []string{typeOffset}},
		}
		in.Orders = []Order{newOrder("o1", "1", linearGraph(stepNode("s1", "Štampa", typeOffset, 60, 2)))}
		res := mustPlan(t, in)
		s1 := one(t, res, "o1", "s1")
		if s1.LeadUserID != "u-z" || len(s1.UserIDs) != 2 || s1.UserIDs[0] != "u-z" || s1.UserIDs[1] != "u-a" {
			t.Fatalf("crew: %+v", s1)
		}
	})
	t.Run("nobody qualified", func(t *testing.T) {
		in := baseInput()
		in.Workers = []Worker{{UserID: "u-a", Username: "aaa"}}
		in.Orders = []Order{newOrder("o1", "2026-0001", linearGraph(stepNode("s1", "Štampa", typeOffset, 60, 1)))}
		res := mustPlan(t, in)
		is := expectIssue(t, res, "o1", "s1", domain.PlanIssueNoWorkers)
		if !containsIssue([]domain.PlanIssue{is}, "osposobljenog za tip mašine „Offset B2“") {
			t.Fatalf("message: %s", is.Message)
		}
	})
	t.Run("qualified worker busy is not borrowed", func(t *testing.T) {
		in := oneOffsetMachine(baseInput())
		in.Workers = []Worker{{UserID: "u-a", Username: "aaa", MachineTypeIDs: []string{typeOffset}}}
		in.Orders = []Order{
			singleStepOrder("o1", "1", typeOffset, 60),
			singleStepOrder("o2", "2", typeOffset, 60),
		}
		res := mustPlan(t, in)
		expectSpan(t, one(t, res, "o2", "s1"), "2026-10-19T08:00", "2026-10-19T09:00", 60)
	})
	t.Run("step without machine type needs only a crew", func(t *testing.T) {
		in := baseInput()
		in.Orders = []Order{newOrder("o1", "1", linearGraph(stepNode("s1", "Pakovanje", "", 45, 2)))}
		res := mustPlan(t, in)
		s1 := one(t, res, "o1", "s1")
		if s1.MachineID != nil || s1.MachineName != "" || s1.LeadUserID != "u-ana" || len(s1.UserIDs) != 2 || s1.UserIDs[1] != "u-boris" {
			t.Fatalf("s1: %+v", s1)
		}
		expectSpan(t, s1, "2026-10-19T07:00", "2026-10-19T07:45", 45)
	})
}

func TestPlanAbsentTodayPresentTomorrow(t *testing.T) {
	in := baseInput()
	in.Workers = []Worker{{UserID: "u-ana", Username: "ana", MachineTypeIDs: []string{typeOffset}, Presence: map[string]bool{"2026-10-19": false}}}
	in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 60)}
	res := mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "s1"), "2026-10-20T07:00", "2026-10-20T08:00", 60)
}

func TestPlanCarryOver(t *testing.T) {
	t.Run("across a break is one block", func(t *testing.T) {
		in := baseInput()
		in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 300)}
		res := mustPlan(t, in)
		s1 := one(t, res, "o1", "s1")
		expectSpan(t, s1, "2026-10-19T07:00", "2026-10-19T12:30", 300)
		if s1.Parts != 1 {
			t.Fatalf("parts: %d", s1.Parts)
		}
	})
	t.Run("across shift end", func(t *testing.T) {
		in := baseInput()
		in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 600)}
		res := mustPlan(t, in)
		b := blocks(res, "o1", "s1")
		if len(b) != 2 {
			t.Fatalf("blocks: %s", debugAssignments(res.Assignments))
		}
		expectSpan(t, b[0], "2026-10-19T07:00", "2026-10-19T15:00", 450)
		expectSpan(t, b[1], "2026-10-20T07:00", "2026-10-20T09:30", 150)
		if b[0].ID != "o1:s1:1" || b[1].ID != "o1:s1:2" || b[0].Part != 1 || b[1].Part != 2 || b[0].Parts != 2 || b[1].Parts != 2 {
			t.Fatalf("numbering: %+v %+v", b[0], b[1])
		}
		if b[0].MachineName != b[1].MachineName || b[0].LeadUserID != b[1].LeadUserID {
			t.Fatalf("parts must keep machine and crew")
		}
	})
	t.Run("across the weekend", func(t *testing.T) {
		in := baseInput()
		in.Date = "2026-10-23"
		in.Start = at("2026-10-23T07:00")
		in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 600)}
		res := mustPlan(t, in)
		b := blocks(res, "o1", "s1")
		if len(b) != 2 {
			t.Fatalf("blocks: %s", debugAssignments(res.Assignments))
		}
		expectSpan(t, b[0], "2026-10-23T07:00", "2026-10-23T15:00", 450)
		expectSpan(t, b[1], "2026-10-26T07:00", "2026-10-26T09:30", 150)
		if f := forecastFor(t, res, "o1"); *f.EstimatedFinish != "2026-10-26" {
			t.Fatalf("finish: %v", *f.EstimatedFinish)
		}
	})
	t.Run("nothing is interleaved on the machine", func(t *testing.T) {
		in := oneOffsetMachine(baseInput())
		a := singleStepOrder("oa", "1", typeOffset, 600)
		a.DueDate = sp("2026-10-20")
		b := singleStepOrder("ob", "2", typeOffset, 60)
		in.Orders = []Order{a, b}
		res := mustPlan(t, in)
		expectSpan(t, one(t, res, "ob", "s1"), "2026-10-20T09:30", "2026-10-20T10:30", 60)
	})
	t.Run("crew member absent the next day", func(t *testing.T) {
		in := oneOffsetMachine(baseInput())
		in.Workers = []Worker{
			{UserID: "u-ana", Username: "ana", MachineTypeIDs: []string{typeOffset}, Presence: map[string]bool{"2026-10-20": false}},
			{UserID: "u-boris", Username: "boris", MachineTypeIDs: []string{typeOffset}},
		}
		in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 600)}
		res := mustPlan(t, in)
		b := blocks(res, "o1", "s1")
		if len(b) != 2 || b[0].LeadUserID != "u-boris" || b[1].LeadUserID != "u-boris" {
			t.Fatalf("expected boris for both parts: %s", debugAssignments(res.Assignments))
		}
		expectSpan(t, b[0], "2026-10-19T07:00", "2026-10-19T15:00", 450)
	})
	t.Run("machine unavailable the next day moves the start", func(t *testing.T) {
		in := oneOffsetMachine(baseInput())
		in.Pinned = []domain.PlanAssignment{{
			ID: "pin", WorkOrderID: "other", OrderNumber: "9", StepNodeID: "x", StepLabel: "X",
			MachineID: sp("m-off-1"), MachineName: "Heidelberg #1", LeadUserID: "u-dana", UserIDs: []string{"u-dana"},
			Start: "2026-10-20T07:00", End: "2026-10-20T09:00", Minutes: 120, Part: 1, Parts: 1, Locked: true,
		}}
		in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 600)}
		res := mustPlan(t, in)
		b := blocks(res, "o1", "s1")
		if len(b) != 2 {
			t.Fatalf("blocks: %s", debugAssignments(res.Assignments))
		}
		expectSpan(t, b[0], "2026-10-20T09:00", "2026-10-20T15:00", 330)
		expectSpan(t, b[1], "2026-10-21T07:00", "2026-10-21T12:00", 270)
	})
}

func TestPlanUrgencyOrder(t *testing.T) {
	two := func(a, b Order) Result {
		in := oneOffsetMachine(baseInput())
		in.Orders = []Order{a, b}
		return mustPlan(t, in)
	}
	t.Run("earlier due date first", func(t *testing.T) {
		a := singleStepOrder("oa", "1", typeOffset, 60)
		a.DueDate = sp("2026-10-23")
		b := singleStepOrder("ob", "2", typeOffset, 60)
		b.DueDate = sp("2026-10-20")
		res := two(a, b)
		expectSpan(t, one(t, res, "ob", "s1"), "2026-10-19T07:00", "2026-10-19T08:00", 60)
		expectSpan(t, one(t, res, "oa", "s1"), "2026-10-19T08:00", "2026-10-19T09:00", 60)
	})
	t.Run("less slack first even with a later number", func(t *testing.T) {
		x := singleStepOrder("ox", "1", typeOffset, 60)
		x.DueDate = sp("2026-10-20")
		y := singleStepOrder("oy", "2", typeOffset, 600)
		y.DueDate = sp("2026-10-20")
		res := two(x, y)
		if b := blocks(res, "oy", "s1"); len(b) != 2 || b[0].Start != "2026-10-19T07:00" {
			t.Fatalf("oy should start first: %s", debugAssignments(res.Assignments))
		}
		expectSpan(t, one(t, res, "ox", "s1"), "2026-10-20T09:30", "2026-10-20T10:30", 60)
	})
	t.Run("priority breaks equal slack", func(t *testing.T) {
		low := singleStepOrder("olow", "1", typeOffset, 60)
		low.Priority = domain.WorkOrderPriorityLow
		urgent := singleStepOrder("ourg", "2", typeOffset, 60)
		urgent.Priority = domain.WorkOrderPriorityUrgent
		res := two(low, urgent)
		expectSpan(t, one(t, res, "ourg", "s1"), "2026-10-19T07:00", "2026-10-19T08:00", 60)
		expectSpan(t, one(t, res, "olow", "s1"), "2026-10-19T08:00", "2026-10-19T09:00", 60)

		high := singleStepOrder("ohigh", "2", typeOffset, 60)
		high.Priority = domain.WorkOrderPriorityHigh
		normal := singleStepOrder("onorm", "1", typeOffset, 60)
		res = two(normal, high)
		expectSpan(t, one(t, res, "ohigh", "s1"), "2026-10-19T07:00", "2026-10-19T08:00", 60)
	})
	t.Run("older order, then number", func(t *testing.T) {
		newer := singleStepOrder("on", "1", typeOffset, 60)
		newer.CreatedAt = "2026-10-05T08:00:00Z"
		older := singleStepOrder("oo", "2", typeOffset, 60)
		older.CreatedAt = "2026-10-01T08:00:00Z"
		res := two(newer, older)
		expectSpan(t, one(t, res, "oo", "s1"), "2026-10-19T07:00", "2026-10-19T08:00", 60)

		first := singleStepOrder("zz", "2026-0001", typeOffset, 60)
		second := singleStepOrder("aa", "2026-0002", typeOffset, 60)
		res = two(second, first)
		expectSpan(t, one(t, res, "zz", "s1"), "2026-10-19T07:00", "2026-10-19T08:00", 60)
	})
	t.Run("overdue before due", func(t *testing.T) {
		late := singleStepOrder("olate", "2", typeOffset, 60)
		late.DueDate = sp("2026-10-16")
		fine := singleStepOrder("ofine", "1", typeOffset, 60)
		fine.DueDate = sp("2026-10-19")
		res := two(fine, late)
		expectSpan(t, one(t, res, "olate", "s1"), "2026-10-19T07:00", "2026-10-19T08:00", 60)
	})
}

func TestPlanForecast(t *testing.T) {
	in := baseInput()
	late := singleStepOrder("olate", "1", typeOffset, 600)
	late.DueDate = sp("2026-10-19")
	ok := singleStepOrder("ook", "2", typeOffset, 60)
	ok.DueDate = sp("2026-10-23")
	ok.Priority = domain.WorkOrderPriorityHigh
	bad := newOrder("obad", "3", linearGraph(stepNode("s1", "Štampa", "t-gone", 60, 1)))
	bad.DueDate = sp("2026-10-23")
	in.Orders = []Order{bad, ok, late}
	res := mustPlan(t, in)

	if len(res.Forecast) != 3 || res.Forecast[0].OrderNumber != "1" || res.Forecast[2].OrderNumber != "3" {
		t.Fatalf("forecast order: %+v", res.Forecast)
	}
	l := forecastFor(t, res, "olate")
	if !l.Late || l.Unplannable || l.EstimatedFinish == nil || *l.EstimatedFinish != "2026-10-20" {
		t.Fatalf("late: %+v", l)
	}
	o := forecastFor(t, res, "ook")
	if o.Late || *o.EstimatedFinish != "2026-10-19" || o.Priority != "high" || o.DueDate == nil {
		t.Fatalf("ok: %+v", o)
	}
	b := forecastFor(t, res, "obad")
	if !b.Unplannable || b.EstimatedFinish != nil || b.Late {
		t.Fatalf("bad: %+v", b)
	}
}

func TestPlanNoCapacityBlocksDownstream(t *testing.T) {
	in := baseInput()
	in.HorizonDays = 1
	g := linearGraph(stepNode("s1", "Štampa", typeOffset, 600, 1), stepNode("s2", "Sečenje", typeCut, 30, 1))
	in.Orders = []Order{newOrder("o1", "1", g), singleStepOrder("o2", "2", typeOffset, 60)}
	res := mustPlan(t, in)
	expectIssue(t, res, "o1", "s1", domain.PlanIssueNoCapacity)
	down := expectIssue(t, res, "o1", "s2", domain.PlanIssueNoCapacity)
	if !containsIssue([]domain.PlanIssue{down}, "Nalog 1, korak „Sečenje“") {
		t.Fatalf("message: %s", down.Message)
	}
	if len(res.Assignments) != 1 || res.Assignments[0].WorkOrderID != "o2" {
		t.Fatalf("assignments: %s", debugAssignments(res.Assignments))
	}
	if f := forecastFor(t, res, "o1"); !f.Unplannable || f.EstimatedFinish != nil {
		t.Fatalf("forecast: %+v", f)
	}
	if f := forecastFor(t, res, "o2"); f.Unplannable || *f.EstimatedFinish != "2026-10-19" {
		t.Fatalf("forecast: %+v", f)
	}
}

func TestPlanHorizonDays(t *testing.T) {
	in := baseInput()
	in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 7000)}
	res := mustPlan(t, in)
	expectIssue(t, res, "o1", "s1", domain.PlanIssueNoCapacity) // default 14 working days = 6300 min

	in.HorizonDays = 20
	res = mustPlan(t, in)
	if _, bad := issueFor(res, "o1", "s1"); bad {
		t.Fatalf("should fit in 20 working days: %+v", res.Issues)
	}
	if len(blocks(res, "o1", "s1")) != 16 {
		t.Fatalf("parts: %d", len(blocks(res, "o1", "s1")))
	}
}

func TestPlanPinnedBlocks(t *testing.T) {
	in := baseInput()
	in.Orders = []Order{
		newOrder("o1", "1", linearGraph(stepNode("s1", "Štampa", typeOffset, 60, 1), stepNode("s2", "Sečenje", typeCut, 30, 1))),
		singleStepOrder("o2", "2", typeOffset, 60),
	}
	pin := domain.PlanAssignment{
		ID: "o1:s1:1", WorkOrderID: "o1", OrderNumber: "1", ClientName: "Klijent", StepNodeID: "s1", StepLabel: "Štampa",
		MachineID: sp("m-off-1"), MachineName: "Heidelberg #1", LeadUserID: "u-ana", UserIDs: []string{"u-ana"},
		Start: "2026-10-19T07:00", End: "2026-10-19T09:00", Minutes: 120, Part: 1, Parts: 1, Locked: true,
	}
	in.Pinned = []domain.PlanAssignment{pin}
	res := mustPlan(t, in)

	got := one(t, res, "o1", "s1")
	if got.Start != pin.Start || got.End != pin.End || got.Minutes != 120 || !got.Locked || got.LeadUserID != "u-ana" {
		t.Fatalf("pinned changed: %+v", got)
	}
	expectSpan(t, one(t, res, "o1", "s2"), "2026-10-19T09:00", "2026-10-19T09:30", 30)
	o2 := one(t, res, "o2", "s1")
	if o2.MachineName != "Heidelberg #2" {
		t.Fatalf("o2 should avoid the pinned machine: %+v", o2)
	}
	expectSpan(t, o2, "2026-10-19T07:00", "2026-10-19T08:00", 60)
	if o2.LeadUserID == "u-ana" {
		t.Fatalf("pinned person must be busy")
	}
}

func TestPlanLockedInProgressFirst(t *testing.T) {
	in := oneOffsetMachine(baseInput())
	running := singleStepOrder("orun", "9", typeOffset, 60)
	running.Priority = domain.WorkOrderPriorityLow
	running.Graph.Nodes[0].Status = domain.ProcessStepInProgress
	urgent := singleStepOrder("ourg", "1", typeOffset, 60)
	urgent.Priority = domain.WorkOrderPriorityUrgent
	urgent.DueDate = sp("2026-10-19")
	in.Orders = []Order{urgent, running}
	res := mustPlan(t, in)
	r := one(t, res, "orun", "s1")
	expectSpan(t, r, "2026-10-19T07:00", "2026-10-19T08:00", 60)
	if !r.Locked {
		t.Fatal("in-progress step must be locked")
	}
	u := one(t, res, "ourg", "s1")
	expectSpan(t, u, "2026-10-19T08:00", "2026-10-19T09:00", 60)
	if u.Locked {
		t.Fatal("pending step must not be locked")
	}
}

func TestPlanDoneAndSkippedAreExcluded(t *testing.T) {
	g := linearGraph(
		stepNode("d1", "Dizajn", typeOffset, 60, 1),
		stepNode("k1", "Prepress", typeOffset, 60, 1),
		stepNode("p1", "Štampa", typeOffset, 60, 1),
	)
	g.Nodes[0].Status = domain.ProcessStepDone
	g.Nodes[1].Status = domain.ProcessStepSkipped
	in := baseInput()
	in.Orders = []Order{newOrder("o1", "1", g)}
	res := mustPlan(t, in)
	if len(res.Assignments) != 1 {
		t.Fatalf("assignments: %s", debugAssignments(res.Assignments))
	}
	expectSpan(t, one(t, res, "o1", "p1"), "2026-10-19T07:00", "2026-10-19T08:00", 60)

	// A fully finished order has nothing left: finish is the start date.
	g.Nodes[2].Status = domain.ProcessStepDone
	in.Orders = []Order{newOrder("o1", "1", g)}
	res = mustPlan(t, in)
	f := forecastFor(t, res, "o1")
	if len(res.Assignments) != 0 || f.EstimatedFinish == nil || *f.EstimatedFinish != "2026-10-19" || f.Unplannable {
		t.Fatalf("finished order: %+v %+v", res, f)
	}
}

func TestPlanMissingDuration(t *testing.T) {
	first := stepNode("s1", "Štampa", typeOffset, 0, 1)
	first.SetupMinutes = nil
	g := linearGraph(first, stepNode("s2", "Sečenje", typeCut, 30, 1))
	in := baseInput()
	in.Orders = []Order{newOrder("o1", "2026-0001", g)}
	res := mustPlan(t, in)
	s1 := one(t, res, "o1", "s1")
	expectSpan(t, s1, "2026-10-19T07:00", "2026-10-19T07:00", 0)
	if s1.Parts != 1 || s1.Part != 1 || s1.MachineID == nil || s1.LeadUserID == "" {
		t.Fatalf("s1: %+v", s1)
	}
	expectSpan(t, one(t, res, "o1", "s2"), "2026-10-19T07:00", "2026-10-19T07:30", 30)
	is := expectIssue(t, res, "o1", "s1", domain.PlanIssueMissingDuration)
	if !containsIssue([]domain.PlanIssue{is}, "Nalog 2026-0001, korak „Štampa“") {
		t.Fatalf("message: %s", is.Message)
	}
	if f := forecastFor(t, res, "o1"); f.Unplannable || f.EstimatedFinish == nil {
		t.Fatalf("missing duration must not make an order unplannable: %+v", f)
	}
}

func TestPlanMachineProblems(t *testing.T) {
	t.Run("unknown type", func(t *testing.T) {
		in := baseInput()
		in.Orders = []Order{newOrder("o1", "1", linearGraph(stepNode("s1", "Štampa", "t-gone", 60, 1), stepNode("s2", "Sečenje", typeCut, 30, 1)))}
		res := mustPlan(t, in)
		expectIssue(t, res, "o1", "s1", domain.PlanIssueUnknownMachineType)
		expectIssue(t, res, "o1", "s2", domain.PlanIssueNoCapacity)
		if len(res.Assignments) != 0 {
			t.Fatal("nothing should be placed")
		}
	})
	t.Run("no machine in service", func(t *testing.T) {
		in := baseInput()
		in.Machines[0].InService = false
		in.Machines[1].InService = false
		in.Orders = []Order{newOrder("o1", "2026-0012", linearGraph(stepNode("s1", "Štampa", typeOffset, 60, 1)))}
		res := mustPlan(t, in)
		is := expectIssue(t, res, "o1", "s1", domain.PlanIssueNoMachine)
		if is.Message != "Nalog 2026-0012, korak „Štampa“: nema ispravne mašine tipa „Offset B2“." {
			t.Fatalf("message: %q", is.Message)
		}
	})
	t.Run("out of service unit is ignored", func(t *testing.T) {
		in := baseInput()
		in.Machines[0].InService = false
		in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 60), singleStepOrder("o2", "2", typeOffset, 60)}
		res := mustPlan(t, in)
		expectSpan(t, one(t, res, "o1", "s1"), "2026-10-19T07:00", "2026-10-19T08:00", 60)
		expectSpan(t, one(t, res, "o2", "s1"), "2026-10-19T08:00", "2026-10-19T09:00", 60)
		for _, a := range res.Assignments {
			if *a.MachineID != "m-off-2" {
				t.Fatalf("used out-of-service machine: %+v", a)
			}
		}
	})
}

func TestPlanReplanStart(t *testing.T) {
	plan := func(start string, horizon int) Result {
		in := baseInput()
		in.Start = at(start)
		in.HorizonDays = horizon
		in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 60)}
		return mustPlan(t, in)
	}
	expectSpan(t, one(t, plan("2026-10-19T09:30", 0), "o1", "s1"), "2026-10-19T09:30", "2026-10-19T10:30", 60)
	expectSpan(t, one(t, plan("2026-10-19T11:10", 0), "o1", "s1"), "2026-10-19T11:30", "2026-10-19T12:30", 60)
	expectSpan(t, one(t, plan("2026-10-19T16:00", 0), "o1", "s1"), "2026-10-20T07:00", "2026-10-20T08:00", 60)
	res := plan("2026-10-19T16:00", 1)
	expectIssue(t, res, "o1", "s1", domain.PlanIssueNoCapacity)

	res = plan("2026-10-19T06:00", 0)
	expectSpan(t, one(t, res, "o1", "s1"), "2026-10-19T07:00", "2026-10-19T08:00", 60)
}

func TestPlanDateOnDayOff(t *testing.T) {
	in := baseInput()
	in.Date = "2026-10-24" // Saturday
	in.Start = time.Time{}
	in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 60)}
	res := mustPlan(t, in)
	expectSpan(t, one(t, res, "o1", "s1"), "2026-10-26T07:00", "2026-10-26T08:00", 60)
}

func dstHours() domain.WorkingHours {
	return domain.WorkingHours{TimeZone: "Europe/Belgrade", Days: []domain.WorkingDay{
		{Weekday: 7, Start: "00:00", End: "06:00", Breaks: []domain.WorkingBreak{}},
		{Weekday: 1, Start: "07:00", End: "15:00", Breaks: []domain.WorkingBreak{}},
	}}
}

func TestPlanDST(t *testing.T) {
	t.Run("spring forward loses an hour", func(t *testing.T) {
		in := baseInput()
		in.Hours = dstHours()
		in.Date = "2026-03-29"
		in.Start = time.Time{}
		in.Orders = []Order{newOrder("o1", "1", linearGraph(stepNode("s1", "Pakovanje", "", 400, 1)))}
		res := mustPlan(t, in)
		b := blocks(res, "o1", "s1")
		if len(b) != 2 {
			t.Fatalf("blocks: %s", debugAssignments(res.Assignments))
		}
		expectSpan(t, b[0], "2026-03-29T00:00", "2026-03-29T06:00", 300)
		expectSpan(t, b[1], "2026-03-30T07:00", "2026-03-30T08:40", 100)
	})
	t.Run("fall back gains an hour", func(t *testing.T) {
		in := baseInput()
		in.Hours = dstHours()
		in.Date = "2026-10-25"
		in.Start = time.Time{}
		in.Orders = []Order{newOrder("o1", "1", linearGraph(stepNode("s1", "Pakovanje", "", 400, 1)))}
		res := mustPlan(t, in)
		b := blocks(res, "o1", "s1")
		if len(b) != 1 {
			t.Fatalf("blocks: %s", debugAssignments(res.Assignments))
		}
		expectSpan(t, b[0], "2026-10-25T00:00", "2026-10-25T05:40", 400)
	})
}

func TestPlanErrors(t *testing.T) {
	in := baseInput()
	in.Hours.TimeZone = "Mars/Olympus"
	if _, err := Plan(in); !errors.Is(err, ErrInvalidHours) {
		t.Fatalf("unknown zone: %v", err)
	}
	in = baseInput()
	in.Hours.Days[0].Start = "25:00"
	if _, err := Plan(in); !errors.Is(err, ErrInvalidHours) {
		t.Fatalf("bad shift: %v", err)
	}
	in = baseInput()
	in.Date = "not-a-date"
	if _, err := Plan(in); err == nil {
		t.Fatal("bad date should fail")
	}
	in = baseInput()
	in.Pinned = []domain.PlanAssignment{{ID: "x", Start: "nope", End: "nope"}}
	if _, err := Plan(in); err == nil {
		t.Fatal("bad pinned time should fail")
	}
}

func TestPlanEmptyInput(t *testing.T) {
	res := mustPlan(t, baseInput())
	if len(res.Assignments) != 0 || len(res.Issues) != 0 || len(res.Forecast) != 0 {
		t.Fatalf("unexpected: %+v", res)
	}
	in := baseInput()
	in.Hours.Days = nil
	in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 60)}
	res = mustPlan(t, in)
	expectIssue(t, res, "o1", "s1", domain.PlanIssueNoCapacity)
}
