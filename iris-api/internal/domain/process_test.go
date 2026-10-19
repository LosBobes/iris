package domain

import (
	"strings"
	"testing"
)

func f(v float64) *float64 { return &v }

func node(id string, kind ProcessNodeKind) ProcessNode {
	return ProcessNode{ID: id, Kind: kind, Label: id}
}

func edge(id, source, target string) ProcessEdge {
	return ProcessEdge{ID: id, Source: source, Target: target}
}

func validGraph() ProcessGraph {
	return ProcessGraph{
		Nodes: []ProcessNode{
			node("paper", ProcessNodeInput), node("print", ProcessNodeStep), node("cut", ProcessNodeStep),
			node("prints", ProcessNodeProduct), node("waste", ProcessNodeByproduct),
		},
		Edges: []ProcessEdge{
			edge("e1", "paper", "print"), edge("e2", "print", "cut"),
			edge("e3", "cut", "prints"), edge("e4", "cut", "waste"),
		},
	}
}

func TestNormalizeProcessGraphAcceptsValidGraph(t *testing.T) {
	got, err := NormalizeProcessGraph(validGraph())
	if err != nil {
		t.Fatalf("error = %v", err)
	}
	if len(got.Nodes) != 5 || len(got.Edges) != 4 {
		t.Fatalf("graph = %+v", got)
	}
}

func TestNormalizeProcessGraphRejects(t *testing.T) {
	tooManyNodes := ProcessGraph{}
	for i := 0; i <= MaxProcessNodes; i++ {
		tooManyNodes.Nodes = append(tooManyNodes.Nodes, node(strings.Repeat("n", 3)+string(rune('a'+i%26))+string(rune('a'+i/26)), ProcessNodeStep))
	}
	tooManyEdges := ProcessGraph{Nodes: []ProcessNode{node("a", ProcessNodeStep), node("b", ProcessNodeStep)}}
	for i := 0; i <= MaxProcessEdges; i++ {
		tooManyEdges.Edges = append(tooManyEdges.Edges, edge(strings.Repeat("e", i+1), "a", "b"))
	}

	cases := map[string]func(g *ProcessGraph){
		"no nodes":          func(g *ProcessGraph) { g.Nodes, g.Edges = nil, nil },
		"no step":           func(g *ProcessGraph) { g.Nodes, g.Edges = []ProcessNode{node("a", ProcessNodeInput)}, nil },
		"empty node id":     func(g *ProcessGraph) { g.Nodes[0].ID = " " },
		"long node id":      func(g *ProcessGraph) { g.Nodes[0].ID = strings.Repeat("x", 65) },
		"duplicate node id": func(g *ProcessGraph) { g.Nodes[1].ID = g.Nodes[0].ID },
		"bad kind":          func(g *ProcessGraph) { g.Nodes[0].Kind = "gadget" },
		"empty label":       func(g *ProcessGraph) { g.Nodes[0].Label = "  " },
		"long label":        func(g *ProcessGraph) { g.Nodes[0].Label = strings.Repeat("š", 121) },
		"long note":         func(g *ProcessGraph) { g.Nodes[0].Note = strings.Repeat("n", 501) },
		"long unit":         func(g *ProcessGraph) { g.Nodes[0].Unit = strings.Repeat("u", 21) },
		"negative quantity": func(g *ProcessGraph) { g.Nodes[0].Quantity = f(-1) },
		"negative actual":   func(g *ProcessGraph) { g.Nodes[0].ActualQuantity = f(-0.5) },
		"bad status":        func(g *ProcessGraph) { g.Nodes[1].Status = "stuck" },
		"duplicate edge id": func(g *ProcessGraph) { g.Edges[1].ID = g.Edges[0].ID },
		"empty edge id":     func(g *ProcessGraph) { g.Edges[0].ID = "" },
		"unknown source":    func(g *ProcessGraph) { g.Edges[0].Source = "ghost" },
		"unknown target":    func(g *ProcessGraph) { g.Edges[0].Target = "ghost" },
		"self loop":         func(g *ProcessGraph) { g.Edges[1].Target = "print" },
		"duplicate pair": func(g *ProcessGraph) {
			g.Edges = append(g.Edges, edge("dup", "paper", "print"))
		},
		"long edge label": func(g *ProcessGraph) { g.Edges[0].Label = strings.Repeat("l", 61) },
		"into input":      func(g *ProcessGraph) { g.Edges[0] = edge("e1", "print", "paper") },
		"item to item": func(g *ProcessGraph) {
			g.Edges = append(g.Edges, edge("ii", "prints", "waste"))
		},
		"input to product": func(g *ProcessGraph) {
			g.Edges = append(g.Edges, edge("ip", "paper", "prints"))
		},
		"step to input": func(g *ProcessGraph) {
			g.Edges = append(g.Edges, edge("si", "cut", "paper"))
		},
		"cycle": func(g *ProcessGraph) {
			g.Edges = append(g.Edges, edge("back", "cut", "print"))
		},
		"longer cycle": func(g *ProcessGraph) {
			g.Nodes = append(g.Nodes, node("third", ProcessNodeStep))
			g.Edges = append(g.Edges, edge("x1", "cut", "third"), edge("x2", "third", "print"))
		},
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			g := CloneProcessGraph(validGraph())
			mutate(&g)
			if _, err := NormalizeProcessGraph(g); err == nil {
				t.Fatal("expected an error")
			} else if _, ok := err.(*ProcessGraphError); !ok {
				t.Fatalf("error type = %T", err)
			}
		})
	}
	t.Run("too many nodes", func(t *testing.T) {
		if _, err := NormalizeProcessGraph(tooManyNodes); err == nil {
			t.Fatal("expected an error")
		}
	})
	t.Run("too many edges", func(t *testing.T) {
		if _, err := NormalizeProcessGraph(tooManyEdges); err == nil {
			t.Fatal("expected an error")
		}
	})
}

func TestNormalizeProcessGraphLimitBoundaries(t *testing.T) {
	g := ProcessGraph{}
	for i := 0; i < MaxProcessNodes; i++ {
		g.Nodes = append(g.Nodes, ProcessNode{ID: strings.Repeat("a", 1+i%60) + string(rune('A'+i/60)) + strings.Repeat("-", i%3), Kind: ProcessNodeStep, Label: strings.Repeat("š", 120)})
	}
	// Chain the first nodes: a DAG, within limits.
	for i := 0; i+1 < 100; i++ {
		g.Edges = append(g.Edges, edge("e"+g.Nodes[i].ID, g.Nodes[i].ID, g.Nodes[i+1].ID))
	}
	if _, err := NormalizeProcessGraph(g); err != nil {
		t.Fatalf("200 nodes / 120-rune labels rejected: %v", err)
	}
}

func TestNormalizeProcessGraphCleansNodes(t *testing.T) {
	g := ProcessGraph{Nodes: []ProcessNode{
		{ID: "s", Kind: ProcessNodeStep, Label: "  Štampa  ", Quantity: f(3), Unit: "kg", CatalogItemID: "c1", ActualQuantity: f(2), Status: ProcessStepDone},
		{ID: "p", Kind: ProcessNodeProduct, Label: "Otisci", Status: ProcessStepDone, Quantity: f(0), ActualQuantity: f(4)},
	}}
	got, err := NormalizeProcessGraph(g)
	if err != nil {
		t.Fatal(err)
	}
	step, item := got.Nodes[0], got.Nodes[1]
	if step.Label != "Štampa" || step.Quantity != nil || step.Unit != "" || step.CatalogItemID != "" || step.ActualQuantity != nil || step.Status != ProcessStepDone {
		t.Fatalf("step = %+v", step)
	}
	if item.Status != "" || item.Quantity == nil || *item.Quantity != 0 || item.ActualQuantity == nil || *item.ActualQuantity != 4 {
		t.Fatalf("item = %+v", item)
	}
	if got.Edges == nil {
		t.Fatal("edges must be non-nil")
	}
	// The input is untouched.
	if g.Nodes[0].Quantity == nil || g.Nodes[0].Label != "  Štampa  " {
		t.Fatal("input mutated")
	}
}

func TestPrepareTemplateGraphStripsState(t *testing.T) {
	g := validGraph()
	g.Nodes[1].Status = ProcessStepDone
	g.Nodes[0].ActualQuantity = f(5)
	g.Nodes[2].Status = "garbage" // stripped before validation, so it is not an error
	got, err := PrepareTemplateGraph(g)
	if err != nil {
		t.Fatal(err)
	}
	for _, n := range got.Nodes {
		if n.Status != "" || n.ActualQuantity != nil {
			t.Fatalf("state survived: %+v", n)
		}
	}
	if g.Nodes[1].Status != ProcessStepDone || g.Nodes[0].ActualQuantity == nil {
		t.Fatal("input mutated")
	}
}

func TestPrepareWorkOrderGraphDefaultsStatus(t *testing.T) {
	g := validGraph()
	g.Nodes[2].Status = ProcessStepInProgress
	got, err := PrepareWorkOrderGraph(g)
	if err != nil {
		t.Fatal(err)
	}
	if got.Nodes[1].Status != ProcessStepPending || got.Nodes[2].Status != ProcessStepInProgress {
		t.Fatalf("steps = %+v %+v", got.Nodes[1], got.Nodes[2])
	}
	if got.Nodes[0].Status != "" {
		t.Fatalf("input got a status: %+v", got.Nodes[0])
	}
}

func TestInstantiateProcessGraph(t *testing.T) {
	g := validGraph()
	g.Nodes[1].Status = ProcessStepDone
	g.Nodes[3].ActualQuantity = f(9)
	got := InstantiateProcessGraph(g)
	if got.Nodes[1].Status != ProcessStepPending || got.Nodes[2].Status != ProcessStepPending {
		t.Fatalf("steps not pending: %+v", got.Nodes)
	}
	if got.Nodes[3].ActualQuantity != nil {
		t.Fatal("actual quantity survived")
	}
}

func TestProcessStructureChanged(t *testing.T) {
	base, err := PrepareWorkOrderGraph(validGraph())
	if err != nil {
		t.Fatal(err)
	}
	base.Nodes[0].Quantity = f(10)

	free := map[string]func(g *ProcessGraph){
		"identical":       func(g *ProcessGraph) {},
		"status":          func(g *ProcessGraph) { g.Nodes[1].Status = ProcessStepDone },
		"actual quantity": func(g *ProcessGraph) { g.Nodes[0].ActualQuantity = f(7) },
		"note":            func(g *ProcessGraph) { g.Nodes[1].Note = "pažnja" },
		"position":        func(g *ProcessGraph) { g.Nodes[1].X, g.Nodes[1].Y = 500, 80 },
		"order":           func(g *ProcessGraph) { g.Nodes[0], g.Nodes[1] = g.Nodes[1], g.Nodes[0] },
	}
	for name, mutate := range free {
		t.Run("free "+name, func(t *testing.T) {
			next := CloneProcessGraph(base)
			mutate(&next)
			if ProcessStructureChanged(base, next) {
				t.Fatal("reported as structural")
			}
		})
	}
	structural := map[string]func(g *ProcessGraph){
		"add node":      func(g *ProcessGraph) { g.Nodes = append(g.Nodes, node("new", ProcessNodeStep)) },
		"remove node":   func(g *ProcessGraph) { g.Nodes, g.Edges = g.Nodes[1:], g.Edges[1:] },
		"replace id":    func(g *ProcessGraph) { g.Nodes[1].ID = "other" },
		"kind":          func(g *ProcessGraph) { g.Nodes[3].Kind = ProcessNodeByproduct },
		"label":         func(g *ProcessGraph) { g.Nodes[1].Label = "Drugi naziv" },
		"quantity":      func(g *ProcessGraph) { g.Nodes[0].Quantity = f(11) },
		"quantity set":  func(g *ProcessGraph) { g.Nodes[3].Quantity = f(1) },
		"quantity drop": func(g *ProcessGraph) { g.Nodes[0].Quantity = nil },
		"unit":          func(g *ProcessGraph) { g.Nodes[0].Unit = "kg" },
		"catalog item":  func(g *ProcessGraph) { g.Nodes[0].CatalogItemID = "cat-1" },
		"add edge":      func(g *ProcessGraph) { g.Edges = append(g.Edges, edge("e5", "print", "waste")) },
		"remove edge":   func(g *ProcessGraph) { g.Edges = g.Edges[1:] },
		"edge label":    func(g *ProcessGraph) { g.Edges[0].Label = "novo" },
		"edge retarget": func(g *ProcessGraph) { g.Edges[3].Target = "prints" },
		"start marker":  func(g *ProcessGraph) { g.Nodes[1].Start = true },
		"final marker":  func(g *ProcessGraph) { g.Nodes[3].Final = true },
	}
	for name, mutate := range structural {
		t.Run("structural "+name, func(t *testing.T) {
			next := CloneProcessGraph(base)
			mutate(&next)
			if !ProcessStructureChanged(base, next) {
				t.Fatal("not reported as structural")
			}
		})
	}
}

func TestNormalizeProcessGraphMarkers(t *testing.T) {
	// Two independent starting steps feeding a shared one that yields two
	// outputs; the intermediate product is also marked as a final output.
	g := ProcessGraph{
		Nodes: []ProcessNode{
			{ID: "paper", Kind: ProcessNodeInput, Label: "Papir", Start: true, Final: true},
			{ID: "print", Kind: ProcessNodeStep, Label: "Štampa", Start: true, Final: true},
			{ID: "foil", Kind: ProcessNodeStep, Label: "Folija", Start: true},
			{ID: "sheets", Kind: ProcessNodeProduct, Label: "Tabaci", Final: true, Start: true},
			{ID: "bind", Kind: ProcessNodeStep, Label: "Povez"},
			{ID: "books", Kind: ProcessNodeProduct, Label: "Knjige"},
			{ID: "offcuts", Kind: ProcessNodeByproduct, Label: "Otpad", Final: true},
		},
		Edges: []ProcessEdge{
			edge("e1", "paper", "print"), edge("e2", "print", "sheets"), edge("e3", "sheets", "bind"),
			edge("e4", "foil", "bind"), edge("e5", "bind", "books"), edge("e6", "bind", "offcuts"),
		},
	}
	got, err := NormalizeProcessGraph(g)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string][2]bool{ // id → {start, final}
		"paper": {false, false}, "print": {true, false}, "foil": {true, false},
		"sheets": {false, true}, "bind": {false, false}, "books": {false, false}, "offcuts": {false, true},
	}
	for _, n := range got.Nodes {
		if w := want[n.ID]; n.Start != w[0] || n.Final != w[1] {
			t.Errorf("%s: start=%v final=%v, want %v", n.ID, n.Start, n.Final, w)
		}
	}
	// Markers are structure: a template keeps them.
	template, err := PrepareTemplateGraph(got)
	if err != nil || !template.Nodes[1].Start || !template.Nodes[3].Final {
		t.Fatalf("template = %+v, %v", template.Nodes, err)
	}
}

func TestDesiredStockNetSameArticleInAndOut(t *testing.T) {
	// One article is both consumed and (partly) returned by the same process.
	g := ProcessGraph{
		Nodes: []ProcessNode{
			{ID: "paper", Kind: ProcessNodeInput, Label: "Papir", CatalogItemID: "cat-paper", Quantity: f(10)},
			{ID: "print", Kind: ProcessNodeStep, Label: "Štampa", Status: ProcessStepDone},
			{ID: "cut", Kind: ProcessNodeStep, Label: "Sečenje", Status: ProcessStepDone},
			{ID: "leftover", Kind: ProcessNodeByproduct, Label: "Višak papira", CatalogItemID: "cat-paper", Quantity: f(3)},
			{ID: "flyers", Kind: ProcessNodeProduct, Label: "Flajeri", CatalogItemID: "cat-paper", Quantity: f(6), Final: true},
		},
		Edges: []ProcessEdge{
			edge("e1", "paper", "print"), edge("e2", "print", "leftover"), edge("e3", "print", "cut"),
			edge("e4", "cut", "flyers"),
		},
	}
	normalized, err := PrepareWorkOrderGraph(g)
	if err != nil {
		t.Fatal(err)
	}
	net := DesiredStockNet(normalized, 1)
	for id, want := range map[string]float64{"paper": -10, "leftover": 3, "flyers": 6} {
		if got := net[id]; got.CatalogItemID != "cat-paper" || got.Net != want {
			t.Errorf("%s = %+v, want %v", id, got, want)
		}
	}
}
