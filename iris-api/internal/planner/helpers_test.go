package planner

import (
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

var belgrade = func() *time.Location {
	loc, err := time.LoadLocation("Europe/Belgrade")
	if err != nil {
		panic(err)
	}
	return loc
}()

// at parses a local Belgrade "YYYY-MM-DDTHH:MM".
func at(s string) time.Time {
	t, err := time.ParseInLocation(layoutDateTime, s, belgrade)
	if err != nil {
		panic(err)
	}
	return t
}

func fl(v float64) *float64 { return &v }
func sp(s string) *string   { return &s }

func stepNode(id, label, machineType string, minutes float64, crew int) domain.ProcessNode {
	n := domain.ProcessNode{
		ID: id, Kind: domain.ProcessNodeStep, Label: label, MachineTypeID: machineType,
		SetupMinutes: fl(minutes), Status: domain.ProcessStepPending,
	}
	if crew > 0 {
		c := crew
		n.CrewSize = &c
	}
	return n
}

func itemNode(id string) domain.ProcessNode {
	return domain.ProcessNode{ID: id, Kind: domain.ProcessNodeProduct, Label: id}
}

func edge(from, to string) domain.ProcessEdge {
	return domain.ProcessEdge{ID: from + ">" + to, Source: from, Target: to}
}

// linearGraph connects the nodes in order with one edge each.
func linearGraph(nodes ...domain.ProcessNode) domain.ProcessGraph {
	g := domain.ProcessGraph{Nodes: nodes}
	for i := 1; i < len(nodes); i++ {
		g.Edges = append(g.Edges, edge(nodes[i-1].ID, nodes[i].ID))
	}
	return g
}

func newOrder(id, number string, g domain.ProcessGraph) Order {
	return Order{
		ID: id, Number: number, ClientName: "Klijent", Priority: domain.WorkOrderPriorityNormal,
		Quantity: 1, Graph: g, CreatedAt: "2026-10-01T08:00:00Z",
	}
}

const (
	typeOffset = "t-off"
	typeCut    = "t-cut"
)

// baseInput is Monday 2026-10-19, default hours (07:00-15:00, break
// 11:00-11:30), two offset machines, one cutter and four workers.
func baseInput() Input {
	return Input{
		Hours: domain.DefaultWorkingHours(),
		Date:  "2026-10-19",
		Start: at("2026-10-19T07:00"),
		MachineTypes: []domain.MachineType{
			{ID: typeOffset, Name: "Offset B2"},
			{ID: typeCut, Name: "Sečenje"},
		},
		Machines: []domain.Machine{
			{ID: "m-off-1", MachineTypeID: typeOffset, Name: "Heidelberg #1", InService: true},
			{ID: "m-off-2", MachineTypeID: typeOffset, Name: "Heidelberg #2", InService: true},
			{ID: "m-cut-1", MachineTypeID: typeCut, Name: "Sekač", InService: true},
		},
		Workers: []Worker{
			{UserID: "u-ana", Username: "ana", MachineTypeIDs: []string{typeOffset, typeCut}},
			{UserID: "u-boris", Username: "boris", MachineTypeIDs: []string{typeOffset}},
			{UserID: "u-cedo", Username: "cedo", MachineTypeIDs: []string{typeCut}},
			{UserID: "u-dana", Username: "dana"},
		},
	}
}

func oneOffsetMachine(in Input) Input {
	in.Machines = in.Machines[:1]
	return in
}

func mustPlan(t *testing.T, in Input) Result {
	t.Helper()
	res, err := Plan(in)
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}
	if res.Assignments == nil || res.Issues == nil || res.Forecast == nil {
		t.Fatalf("Plan returned nil slices: %+v", res)
	}
	for _, a := range res.Assignments {
		if a.UserIDs == nil {
			t.Fatalf("nil UserIDs in %+v", a)
		}
	}
	assertNoOverlap(t, res.Assignments)
	return res
}

// blocks returns the assignments of one step ordered by part.
func blocks(res Result, orderID, stepID string) []domain.PlanAssignment {
	var out []domain.PlanAssignment
	for _, a := range res.Assignments {
		if a.WorkOrderID == orderID && a.StepNodeID == stepID {
			out = append(out, a)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Part < out[j].Part })
	return out
}

func one(t *testing.T, res Result, orderID, stepID string) domain.PlanAssignment {
	t.Helper()
	b := blocks(res, orderID, stepID)
	if len(b) != 1 {
		t.Fatalf("%s/%s: want 1 block, got %d (%+v)", orderID, stepID, len(b), res.Assignments)
	}
	return b[0]
}

func expectSpan(t *testing.T, a domain.PlanAssignment, start, end string, minutes int) {
	t.Helper()
	if a.Start != start || a.End != end || a.Minutes != minutes {
		t.Fatalf("%s: got %s-%s (%d min), want %s-%s (%d min)", a.ID, a.Start, a.End, a.Minutes, start, end, minutes)
	}
}

func issueFor(res Result, orderID, stepID string) (domain.PlanIssue, bool) {
	for _, is := range res.Issues {
		if is.WorkOrderID == orderID && is.StepNodeID == stepID {
			return is, true
		}
	}
	return domain.PlanIssue{}, false
}

func expectIssue(t *testing.T, res Result, orderID, stepID string, code domain.PlanIssueCode) domain.PlanIssue {
	t.Helper()
	for _, is := range res.Issues {
		if is.WorkOrderID == orderID && is.StepNodeID == stepID && is.Code == code {
			return is
		}
	}
	t.Fatalf("%s/%s: no %s issue in %+v", orderID, stepID, code, res.Issues)
	return domain.PlanIssue{}
}

func forecastFor(t *testing.T, res Result, orderID string) domain.OrderForecast {
	t.Helper()
	for _, f := range res.Forecast {
		if f.WorkOrderID == orderID {
			return f
		}
	}
	t.Fatalf("no forecast for %s", orderID)
	return domain.OrderForecast{}
}

// assertNoOverlap fails when a machine or person is in two blocks at once.
func assertNoOverlap(t *testing.T, as []domain.PlanAssignment) {
	t.Helper()
	type iv struct {
		s, e string
		id   string
	}
	by := map[string][]iv{}
	for _, a := range as {
		if a.Start == a.End {
			continue
		}
		if a.MachineID != nil {
			by["m:"+*a.MachineID] = append(by["m:"+*a.MachineID], iv{a.Start, a.End, a.ID})
		}
		for _, u := range a.UserIDs {
			by["u:"+u] = append(by["u:"+u], iv{a.Start, a.End, a.ID})
		}
	}
	for key, list := range by {
		sort.Slice(list, func(i, j int) bool { return list[i].s < list[j].s })
		for i := 1; i < len(list); i++ {
			if list[i].s < list[i-1].e {
				t.Fatalf("%s double-booked: %v and %v", key, list[i-1], list[i])
			}
		}
	}
}

func containsIssue(issues []domain.PlanIssue, sub string) bool {
	for _, is := range issues {
		if strings.Contains(is.Message, sub) {
			return true
		}
	}
	return false
}

func debugAssignments(as []domain.PlanAssignment) string {
	var b strings.Builder
	for _, a := range as {
		fmt.Fprintf(&b, "%s %s-%s %dmin %s %v\n", a.ID, a.Start, a.End, a.Minutes, a.MachineName, a.UserIDs)
	}
	return b.String()
}
