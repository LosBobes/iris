package domain

import (
	"errors"
	"testing"
	"time"
)

func stepTimesGraph() ProcessGraph {
	return ProcessGraph{
		Nodes: []ProcessNode{
			node("paper", ProcessNodeInput), node("print", ProcessNodeStep), node("cut", ProcessNodeStep),
			node("prints", ProcessNodeProduct),
		},
		Edges: []ProcessEdge{edge("e1", "paper", "print"), edge("e2", "print", "cut"), edge("e3", "cut", "prints")},
	}
}

func stepByID(graph ProcessGraph, id string) ProcessNode {
	for _, node := range graph.Nodes {
		if node.ID == id {
			return node
		}
	}
	return ProcessNode{}
}

func withStep(graph ProcessGraph, id string, mutate func(*ProcessNode)) ProcessGraph {
	out := CloneProcessGraph(graph)
	for i := range out.Nodes {
		if out.Nodes[i].ID == id {
			mutate(&out.Nodes[i])
		}
	}
	return out
}

func TestNormalizeProcessGraphStepTimes(t *testing.T) {
	g := stepTimesGraph()
	g.Nodes[1].StartedAt = " 2026-10-19T08:00:00+02:00 "
	g.Nodes[1].FinishedAt = "2026-10-19T09:30:15.250Z"
	g.Nodes[0].StartedAt, g.Nodes[0].FinishedAt = "2026-10-19T08:00:00Z", "2026-10-19T08:00:00Z"
	got, err := NormalizeProcessGraph(g)
	if err != nil {
		t.Fatal(err)
	}
	if got.Nodes[1].StartedAt != "2026-10-19T06:00:00Z" || got.Nodes[1].FinishedAt != "2026-10-19T09:30:15Z" {
		t.Fatalf("step times = %q / %q, want UTC RFC 3339", got.Nodes[1].StartedAt, got.Nodes[1].FinishedAt)
	}
	if got.Nodes[0].StartedAt != "" || got.Nodes[0].FinishedAt != "" {
		t.Fatalf("item node kept step times: %+v", got.Nodes[0])
	}

	bad := stepTimesGraph()
	bad.Nodes[1].StartedAt = "19.10.2026 08:00"
	var graphErr *ProcessGraphError
	if _, err := NormalizeProcessGraph(bad); !errors.As(err, &graphErr) || graphErr.Message != StepTimeInvalidMessage {
		t.Fatalf("invalid time error = %v", err)
	}
	bad = stepTimesGraph()
	bad.Nodes[1].StartedAt, bad.Nodes[1].FinishedAt = "2026-10-19T09:00:00Z", "2026-10-19T08:59:59Z"
	if _, err := NormalizeProcessGraph(bad); !errors.As(err, &graphErr) || graphErr.Message != StepTimeOrderMessage {
		t.Fatalf("order error = %v", err)
	}

	// Templates and fresh copies never carry step times.
	template, err := PrepareTemplateGraph(g)
	if err != nil {
		t.Fatal(err)
	}
	if template.Nodes[1].StartedAt != "" || template.Nodes[1].FinishedAt != "" {
		t.Fatalf("template kept step times: %+v", template.Nodes[1])
	}
	if copy := InstantiateProcessGraph(got); copy.Nodes[1].StartedAt != "" || copy.Nodes[1].FinishedAt != "" {
		t.Fatalf("instantiated copy kept step times: %+v", copy.Nodes[1])
	}

	// Step times are state, not structure.
	base, _ := PrepareWorkOrderGraph(stepTimesGraph())
	timed := withStep(base, "print", func(n *ProcessNode) { n.StartedAt, n.FinishedAt = "2026-10-19T06:00:00Z", "2026-10-19T07:00:00Z" })
	if ProcessStructureChanged(base, timed) {
		t.Fatal("step times reported as structural")
	}
}

func TestApplyStepTimestamps(t *testing.T) {
	now := time.Date(2026, 10, 19, 10, 0, 0, 0, time.UTC)
	later := now.Add(45 * time.Minute)
	current, err := PrepareWorkOrderGraph(stepTimesGraph())
	if err != nil {
		t.Fatal(err)
	}

	// pending -> in_progress fills startedAt only.
	started, err := ApplyStepTimestamps(current, withStep(current, "print", func(n *ProcessNode) { n.Status = ProcessStepInProgress }), now)
	if err != nil {
		t.Fatal(err)
	}
	if print := stepByID(started, "print"); print.StartedAt != "2026-10-19T10:00:00Z" || print.FinishedAt != "" {
		t.Fatalf("after start = %+v", print)
	}
	if cut := stepByID(started, "cut"); cut.StartedAt != "" || cut.FinishedAt != "" {
		t.Fatalf("untouched step changed: %+v", cut)
	}

	// in_progress -> done fills finishedAt and keeps startedAt.
	done, err := ApplyStepTimestamps(started, withStep(started, "print", func(n *ProcessNode) { n.Status = ProcessStepDone }), later)
	if err != nil {
		t.Fatal(err)
	}
	if print := stepByID(done, "print"); print.StartedAt != "2026-10-19T10:00:00Z" || print.FinishedAt != "2026-10-19T10:45:00Z" {
		t.Fatalf("after done = %+v", print)
	}

	// The same status again changes nothing; a later request keeps the times.
	again, _ := ApplyStepTimestamps(done, done, later.Add(time.Hour))
	if stepByID(again, "print") != stepByID(done, "print") {
		t.Fatalf("unchanged status rewrote times: %+v", stepByID(again, "print"))
	}

	// done -> in_progress reopens: finishedAt is cleared, startedAt kept.
	reopened, _ := ApplyStepTimestamps(done, withStep(done, "print", func(n *ProcessNode) { n.Status = ProcessStepInProgress }), later.Add(time.Hour))
	if print := stepByID(reopened, "print"); print.StartedAt != "2026-10-19T10:00:00Z" || print.FinishedAt != "" {
		t.Fatalf("after reopen = %+v", print)
	}

	// Back to pending clears both.
	reset, _ := ApplyStepTimestamps(done, withStep(done, "print", func(n *ProcessNode) { n.Status = ProcessStepPending }), later)
	if print := stepByID(reset, "print"); print.StartedAt != "" || print.FinishedAt != "" {
		t.Fatalf("after reset = %+v", print)
	}

	// pending -> skipped fills finishedAt only; pending -> done likewise.
	skipped, _ := ApplyStepTimestamps(current, withStep(current, "cut", func(n *ProcessNode) { n.Status = ProcessStepSkipped }), now)
	if cut := stepByID(skipped, "cut"); cut.StartedAt != "" || cut.FinishedAt != "2026-10-19T10:00:00Z" {
		t.Fatalf("after skip = %+v", cut)
	}

	// Explicit values sent with the transition win over the clock.
	explicit, err := ApplyStepTimestamps(current, withStep(current, "print", func(n *ProcessNode) {
		n.Status = ProcessStepDone
		n.StartedAt, n.FinishedAt = "2026-10-19T07:00:00Z", "2026-10-19T08:00:00Z"
	}), now)
	if err != nil {
		t.Fatal(err)
	}
	if print := stepByID(explicit, "print"); print.StartedAt != "2026-10-19T07:00:00Z" || print.FinishedAt != "2026-10-19T08:00:00Z" {
		t.Fatalf("explicit times = %+v", print)
	}
	// A correction without a status change is kept as sent.
	corrected, _ := ApplyStepTimestamps(done, withStep(done, "print", func(n *ProcessNode) { n.StartedAt = "2026-10-19T09:50:00Z" }), later)
	if print := stepByID(corrected, "print"); print.StartedAt != "2026-10-19T09:50:00Z" || print.FinishedAt != "2026-10-19T10:45:00Z" {
		t.Fatalf("corrected = %+v", print)
	}

	// An explicit start after the automatic finish is rejected.
	var graphErr *ProcessGraphError
	_, err = ApplyStepTimestamps(current, withStep(current, "print", func(n *ProcessNode) {
		n.Status = ProcessStepDone
		n.StartedAt = "2026-10-19T12:00:00Z"
	}), now)
	if !errors.As(err, &graphErr) || graphErr.Message != StepTimeOrderMessage {
		t.Fatalf("start after finish = %v", err)
	}
}

func TestPlannedQuantityFactor(t *testing.T) {
	three, zero := 3, 0
	cases := []struct {
		name     string
		quantity *int
		perOrder bool
		want     float64
	}{
		{"per unit, quantity 3", &three, false, 3},
		{"per unit, no quantity", nil, false, 1},
		{"per unit, zero quantity", &zero, false, 1},
		{"legacy per-order copy", &three, true, 1},
	}
	for _, tc := range cases {
		if got := PlannedQuantityFactor(tc.quantity, tc.perOrder); got != tc.want {
			t.Errorf("%s: factor = %v, want %v", tc.name, got, tc.want)
		}
	}
	order := &WorkOrder{JobDetails: &JobDetails{Quantity: &three}}
	if got := WorkOrderQuantityFactor(order, false); got != 3 {
		t.Errorf("work order factor = %v, want 3", got)
	}
	if got := WorkOrderQuantityFactor(&WorkOrder{}, false); got != 1 {
		t.Errorf("work order without details factor = %v, want 1", got)
	}
	if got := ScalePlannedQuantity(1100.0/3000.0, 3000); got != 1100 {
		t.Errorf("scaled = %v, want 1100 (rounded to 3 decimals)", got)
	}
	if got := ScalePlannedQuantity(0.13, 5000); got != 650 {
		t.Errorf("scaled = %v, want 650", got)
	}
}
