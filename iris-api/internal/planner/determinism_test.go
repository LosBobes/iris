package planner

import (
	"fmt"
	"math/rand"
	"reflect"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// genInput builds a deterministic pseudo-random shop: orders chains with an
// occasional parallel branch, machines of four types, workers qualified for two.
func genInput(seed int64, orders, stepsPerOrder, machines, workers int) Input {
	rng := rand.New(rand.NewSource(seed))
	in := Input{
		Hours: domain.DefaultWorkingHours(),
		Date:  "2026-10-19",
		Start: at("2026-10-19T07:00"),
	}
	const types = 4
	for i := 0; i < types; i++ {
		in.MachineTypes = append(in.MachineTypes, domain.MachineType{ID: fmt.Sprintf("t%d", i), Name: fmt.Sprintf("Tip %d", i)})
	}
	for i := 0; i < machines; i++ {
		in.Machines = append(in.Machines, domain.Machine{
			ID: fmt.Sprintf("m%02d", i), MachineTypeID: fmt.Sprintf("t%d", i%types), Name: fmt.Sprintf("Mašina %02d", i), InService: i%11 != 10,
		})
	}
	for i := 0; i < workers; i++ {
		w := Worker{
			UserID: fmt.Sprintf("u%02d", i), Username: fmt.Sprintf("radnik%02d", i),
			MachineTypeIDs: []string{fmt.Sprintf("t%d", i%types), fmt.Sprintf("t%d", (i+1)%types)},
		}
		if i%7 == 3 {
			w.Presence = map[string]bool{"2026-10-19": false, "2026-10-21": false}
		}
		in.Workers = append(in.Workers, w)
	}
	for o := 0; o < orders; o++ {
		g := domain.ProcessGraph{}
		for s := 0; s < stepsPerOrder; s++ {
			crew := 1
			if rng.Intn(6) == 0 {
				crew = 2
			}
			id := fmt.Sprintf("s%02d", s)
			g.Nodes = append(g.Nodes, stepNode(id, "Korak "+id, fmt.Sprintf("t%d", rng.Intn(types)), float64(20+rng.Intn(100)), crew))
			if s > 0 {
				from := fmt.Sprintf("s%02d", s-1)
				if s > 2 && rng.Intn(4) == 0 {
					from = fmt.Sprintf("s%02d", s-2)
				}
				g.Edges = append(g.Edges, edge(from, id))
			}
		}
		ord := newOrder(fmt.Sprintf("o%03d", o), fmt.Sprintf("2026-%04d", o+1), g)
		ord.CreatedAt = fmt.Sprintf("2026-09-%02dT08:00:00Z", 1+rng.Intn(28))
		ord.Priority = []domain.WorkOrderPriority{domain.WorkOrderPriorityLow, domain.WorkOrderPriorityNormal, domain.WorkOrderPriorityHigh, domain.WorkOrderPriorityUrgent}[rng.Intn(4)]
		if rng.Intn(3) != 0 {
			due := time.Date(2026, 10, 19+rng.Intn(20), 0, 0, 0, 0, time.UTC).Format(layoutDate)
			ord.DueDate = &due
		}
		if o%9 == 0 && stepsPerOrder > 3 {
			ord.Graph.Nodes[0].Status = domain.ProcessStepDone
			ord.Graph.Nodes[1].Status = domain.ProcessStepInProgress
		}
		in.Orders = append(in.Orders, ord)
	}
	if orders > 4 {
		in.Pinned = []domain.PlanAssignment{{
			ID: "pin1", WorkOrderID: "ext", OrderNumber: "EXT", StepNodeID: "x", StepLabel: "X",
			MachineID: sp("m00"), MachineName: "Mašina 00", LeadUserID: "u00", UserIDs: []string{"u00"},
			Start: "2026-10-19T07:00", End: "2026-10-19T10:00", Minutes: 180, Part: 1, Parts: 1, Locked: true,
		}}
	}
	return in
}

func shuffled(in Input, seed int64) Input {
	rng := rand.New(rand.NewSource(seed))
	out := in
	out.MachineTypes = append([]domain.MachineType(nil), in.MachineTypes...)
	out.Machines = append([]domain.Machine(nil), in.Machines...)
	out.Workers = append([]Worker(nil), in.Workers...)
	out.Orders = append([]Order(nil), in.Orders...)
	out.Pinned = append([]domain.PlanAssignment(nil), in.Pinned...)
	rng.Shuffle(len(out.MachineTypes), func(i, j int) { out.MachineTypes[i], out.MachineTypes[j] = out.MachineTypes[j], out.MachineTypes[i] })
	rng.Shuffle(len(out.Machines), func(i, j int) { out.Machines[i], out.Machines[j] = out.Machines[j], out.Machines[i] })
	rng.Shuffle(len(out.Workers), func(i, j int) { out.Workers[i], out.Workers[j] = out.Workers[j], out.Workers[i] })
	rng.Shuffle(len(out.Orders), func(i, j int) { out.Orders[i], out.Orders[j] = out.Orders[j], out.Orders[i] })
	for i := range out.Orders {
		g := domain.CloneProcessGraph(out.Orders[i].Graph)
		rng.Shuffle(len(g.Nodes), func(a, b int) { g.Nodes[a], g.Nodes[b] = g.Nodes[b], g.Nodes[a] })
		rng.Shuffle(len(g.Edges), func(a, b int) { g.Edges[a], g.Edges[b] = g.Edges[b], g.Edges[a] })
		out.Orders[i].Graph = g
	}
	return out
}

func TestPlanDeterministic(t *testing.T) {
	in := genInput(42, 40, 6, 12, 14)
	base, err := Plan(in)
	if err != nil {
		t.Fatal(err)
	}
	if len(base.Assignments) < 100 {
		t.Fatalf("generator too small: %d assignments", len(base.Assignments))
	}
	assertNoOverlap(t, base.Assignments)
	for i := 0; i < 3; i++ {
		again, err := Plan(in)
		if err != nil || !reflect.DeepEqual(base, again) {
			t.Fatalf("repeat run %d differs (err %v)", i, err)
		}
	}
	for seed := int64(1); seed <= 8; seed++ {
		got, err := Plan(shuffled(in, seed))
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(base, got) {
			t.Fatalf("shuffled input (seed %d) changed the result", seed)
		}
	}
}

func TestPlanSortedOutput(t *testing.T) {
	res, err := Plan(genInput(7, 30, 6, 12, 14))
	if err != nil {
		t.Fatal(err)
	}
	for i := 1; i < len(res.Assignments); i++ {
		a, b := res.Assignments[i-1], res.Assignments[i]
		if a.Start > b.Start || (a.Start == b.Start && a.MachineName > b.MachineName) {
			t.Fatalf("assignments not sorted at %d: %+v / %+v", i, a, b)
		}
	}
	for i := 1; i < len(res.Forecast); i++ {
		if res.Forecast[i-1].OrderNumber > res.Forecast[i].OrderNumber {
			t.Fatal("forecast not sorted")
		}
	}
	// Every step of every order is accounted for exactly once per part, in order.
	for _, o := range genInput(7, 30, 6, 12, 14).Orders {
		ends := map[string]string{}
		for _, a := range res.Assignments {
			if a.WorkOrderID == o.ID && a.End > ends[a.StepNodeID] {
				ends[a.StepNodeID] = a.End
			}
		}
		for _, e := range o.Graph.Edges {
			for _, a := range res.Assignments {
				if a.WorkOrderID == o.ID && a.StepNodeID == e.Target && ends[e.Source] != "" && a.Start < ends[e.Source] && a.Part == 1 && !a.Locked {
					t.Fatalf("%s: %s starts %s before %s ends %s", o.ID, e.Target, a.Start, e.Source, ends[e.Source])
				}
			}
		}
	}
}

func TestPlanSizeUnderTwoSeconds(t *testing.T) {
	in := genInput(1, 100, 10, 20, 30)
	started := time.Now()
	res, err := Plan(in)
	elapsed := time.Since(started)
	if err != nil {
		t.Fatal(err)
	}
	if elapsed > 2*time.Second {
		t.Fatalf("planning took %s", elapsed)
	}
	if len(res.Assignments) < 900 || len(res.Forecast) != 100 {
		t.Fatalf("unexpectedly small result: %d assignments, %d forecasts", len(res.Assignments), len(res.Forecast))
	}
	assertNoOverlap(t, res.Assignments)
	t.Logf("planned %d blocks, %d issues in %s", len(res.Assignments), len(res.Issues), elapsed)
}

func BenchmarkPlan(b *testing.B) {
	in := genInput(1, 100, 10, 20, 30)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := Plan(in); err != nil {
			b.Fatal(err)
		}
	}
}
