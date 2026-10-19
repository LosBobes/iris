package planner

import (
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Latest start (D-028): a backward pass from the end of the due date's shift
// over the remaining chain (durations + transferMinutes, working time only).
// baseInput plans from Monday 2026-10-19; shifts are Mon-Fri 07:00-15:00 with
// a 11:00-11:30 break (450 working minutes a day).

func latestOrder(due *string, first, second float64) Order {
	o := newOrder("o1", "2026-0001", linearGraph(
		stepNode("s1", "Štampa", typeOffset, first, 1),
		stepNode("s2", "Sečenje", typeCut, second, 1),
	))
	o.DueDate = due
	return o
}

func expectLatestStart(t *testing.T, f domain.OrderForecast, want string, passed bool) {
	t.Helper()
	if f.LatestStart == nil || *f.LatestStart != want || f.LatestStartPassed != passed {
		got := "<nil>"
		if f.LatestStart != nil {
			got = *f.LatestStart
		}
		t.Fatalf("latestStart = %s (passed %v), want %s (passed %v)", got, f.LatestStartPassed, want, passed)
	}
}

func TestSubWorkingMirrorsAddWorking(t *testing.T) {
	cal, err := newCalendar(domain.DefaultWorkingHours())
	if err != nil {
		t.Fatal(err)
	}
	minutes := func(s string) int64 { return at(s).Unix() / 60 }
	cases := []struct {
		from    string
		minutes int
		want    string
	}{
		{"2026-10-19T15:00", 240, "2026-10-19T10:30"}, // across the break
		{"2026-10-26T07:00", 60, "2026-10-23T14:00"},  // across the weekend
		{"2026-10-24T12:00", 30, "2026-10-23T14:30"},  // from a day off
		{"2026-10-19T11:15", 15, "2026-10-19T10:45"},  // from inside a break
		{"2026-10-19T09:00", 0, "2026-10-19T09:00"},
	}
	for _, c := range cases {
		got, ok := cal.subWorking(minutes(c.from), c.minutes)
		if !ok || cal.format(got) != c.want {
			t.Errorf("subWorking(%s, %d) = %s, %v; want %s", c.from, c.minutes, cal.format(got), ok, c.want)
		}
	}
	// Forward again lands back on the starting moment.
	back, _ := cal.subWorking(minutes("2026-10-26T08:00"), 500)
	if fwd, ok := cal.addWorking(back, 500); !ok || cal.format(fwd) != "2026-10-26T08:00" {
		t.Fatalf("addWorking(subWorking(x)) = %s, want 2026-10-26T08:00", cal.format(fwd))
	}

	// No working day at all: the window runs out.
	empty := domain.DefaultWorkingHours()
	empty.Days = nil
	cal, err = newCalendar(empty)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := cal.subWorking(minutes("2026-10-19T12:00"), 10); ok {
		t.Fatal("subWorking without working days must fail")
	}
}

func TestLatestStartTwoStepsAcrossWeekendWithLag(t *testing.T) {
	// s2 (a full day) must start Monday 26th at 07:00; the 60-minute lag goes
	// back to Friday 14:00, and s1 (60) to Friday 13:00.
	in := lagInput(60)
	in.Orders = []Order{latestOrder(sp("2026-10-26"), 60, 450)}
	expectLatestStart(t, forecastFor(t, mustPlan(t, in), "o1"), "2026-10-23", false)

	// Without the lag, s2 of 451 minutes takes all of Monday plus Friday's
	// last minute, so s1 must start Friday at 13:59.
	in = lagInput(0)
	in.Orders = []Order{latestOrder(sp("2026-10-26"), 60, 451)}
	expectLatestStart(t, forecastFor(t, mustPlan(t, in), "o1"), "2026-10-23", false)
}

func TestLatestStartDueOnDayOff(t *testing.T) {
	// Due on Saturday: the end of Friday's shift counts.
	in := lagInput(60)
	in.Orders = []Order{latestOrder(sp("2026-10-24"), 60, 450)}
	expectLatestStart(t, forecastFor(t, mustPlan(t, in), "o1"), "2026-10-22", false)

	// Due on an exception day off (Friday): Thursday's shift end counts.
	in.Hours.Exceptions = []domain.WorkingHoursException{{Date: "2026-10-23", Off: true}}
	in.Orders = []Order{latestOrder(sp("2026-10-23"), 60, 450)}
	expectLatestStart(t, forecastFor(t, mustPlan(t, in), "o1"), "2026-10-21", false)
}

func TestLatestStartPassed(t *testing.T) {
	// Two full days due Tuesday with a 60-minute lag: s2 starts Tuesday 07:00,
	// s1 must finish by Monday 14:00 and start the Friday before.
	in := lagInput(60)
	in.Orders = []Order{latestOrder(sp("2026-10-20"), 450, 450)}
	expectLatestStart(t, forecastFor(t, mustPlan(t, in), "o1"), "2026-10-16", true)

	// Without the lag the latest start is the plan date itself: not passed.
	in = lagInput(0)
	in.Orders = []Order{latestOrder(sp("2026-10-20"), 450, 450)}
	expectLatestStart(t, forecastFor(t, mustPlan(t, in), "o1"), "2026-10-19", false)
}

func TestLatestStartFollowsLongestBranch(t *testing.T) {
	// s1 (60) and s3 (900) both feed item p, which feeds s2 (60). Due Friday
	// 23rd: s2 starts Friday 14:00; s3 needs Friday's 390 minutes before
	// that, all of Thursday and Wednesday's last 60 minutes.
	g := domain.ProcessGraph{
		Nodes: []domain.ProcessNode{
			stepNode("s1", "Štampa", typeOffset, 60, 1),
			stepNode("s3", "Lakiranje", typeOffset, 900, 1),
			itemNode("p"),
			stepNode("s2", "Sečenje", typeCut, 60, 1),
		},
		Edges: []domain.ProcessEdge{edge("s1", "p"), edge("s3", "p"), edge("p", "s2")},
	}
	o := newOrder("o1", "2026-0001", g)
	o.DueDate = sp("2026-10-23")
	in := baseInput()
	in.Orders = []Order{o}
	expectLatestStart(t, forecastFor(t, mustPlan(t, in), "o1"), "2026-10-21", false)
}

func TestLatestStartSkipsFinishedSteps(t *testing.T) {
	in := lagInput(60)
	o := latestOrder(sp("2026-10-26"), 60, 450)
	o.Graph.Nodes[0].Status = domain.ProcessStepDone
	in.Orders = []Order{o}
	expectLatestStart(t, forecastFor(t, mustPlan(t, in), "o1"), "2026-10-26", false)

	// In-progress steps still count (full duration).
	o = latestOrder(sp("2026-10-26"), 60, 450)
	o.Graph.Nodes[0].Status = domain.ProcessStepInProgress
	in.Orders = []Order{o}
	expectLatestStart(t, forecastFor(t, mustPlan(t, in), "o1"), "2026-10-23", false)
}

func TestLatestStartOmitted(t *testing.T) {
	cases := map[string]func() Order{
		"no due date": func() Order { return latestOrder(nil, 60, 60) },
		"missing duration": func() Order {
			o := latestOrder(sp("2026-10-26"), 60, 60)
			o.Graph.Nodes[1].SetupMinutes = nil
			return o
		},
		"nothing left": func() Order {
			o := latestOrder(sp("2026-10-26"), 60, 60)
			o.Graph.Nodes[0].Status = domain.ProcessStepDone
			o.Graph.Nodes[1].Status = domain.ProcessStepSkipped
			return o
		},
	}
	for name, build := range cases {
		in := baseInput()
		in.Orders = []Order{build()}
		f := forecastFor(t, mustPlan(t, in), "o1")
		if f.LatestStart != nil || f.LatestStartPassed {
			t.Errorf("%s: latestStart = %v (passed %v), want none", name, f.LatestStart, f.LatestStartPassed)
		}
	}

	// A missing duration on a finished step does not matter.
	in := baseInput()
	o := latestOrder(sp("2026-10-26"), 60, 60)
	o.Graph.Nodes[0].SetupMinutes = nil
	o.Graph.Nodes[0].Status = domain.ProcessStepDone
	in.Orders = []Order{o}
	expectLatestStart(t, forecastFor(t, mustPlan(t, in), "o1"), "2026-10-26", false)
}
