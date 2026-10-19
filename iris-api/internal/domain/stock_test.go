package domain

import (
	"errors"
	"math"
	"testing"
)

func qty(v float64) *float64 { return &v }

// stockGraph: paper(100) -> print -> cut -> out(product, unlinked);
// print -> sheets (intermediate product, linked) -> cut; cut -> waste (byproduct).
func stockGraph() ProcessGraph {
	return ProcessGraph{
		Nodes: []ProcessNode{
			{ID: "paper", Kind: ProcessNodeInput, Label: "Papir", Quantity: qty(100), CatalogItemID: "a-paper"},
			{ID: "ink", Kind: ProcessNodeInput, Label: "Boja", Quantity: qty(2), CatalogItemID: "a-ink"},
			{ID: "free", Kind: ProcessNodeInput, Label: "Bez veze", Quantity: qty(9)},
			{ID: "print", Kind: ProcessNodeStep, Label: "Štampa", Status: ProcessStepPending},
			{ID: "sheets", Kind: ProcessNodeProduct, Label: "Otisnuti tabaci", Quantity: qty(90), CatalogItemID: "a-sheets"},
			{ID: "cut", Kind: ProcessNodeStep, Label: "Sečenje", Status: ProcessStepPending},
			{ID: "waste", Kind: ProcessNodeByproduct, Label: "Makulatura", Quantity: qty(3), CatalogItemID: "a-waste"},
			{ID: "done", Kind: ProcessNodeProduct, Label: "Gotovo", Quantity: qty(80), CatalogItemID: "a-final"},
		},
		Edges: []ProcessEdge{
			{ID: "e1", Source: "paper", Target: "print"},
			{ID: "e2", Source: "ink", Target: "print"},
			{ID: "e3", Source: "free", Target: "print"},
			{ID: "e4", Source: "print", Target: "sheets"},
			{ID: "e5", Source: "sheets", Target: "cut"},
			{ID: "e6", Source: "cut", Target: "waste"},
			{ID: "e7", Source: "cut", Target: "done"},
		},
	}
}

func setStatus(graph ProcessGraph, id string, status ProcessStepStatus) ProcessGraph {
	graph = CloneProcessGraph(graph)
	for i := range graph.Nodes {
		if graph.Nodes[i].ID == id {
			graph.Nodes[i].Status = status
		}
	}
	return graph
}

func nets(graph ProcessGraph) map[string]float64 {
	out := map[string]float64{}
	for id, want := range DesiredStockNet(graph, 1) {
		out[id] = want.Net
	}
	return out
}

func TestDesiredStockNetNothingDoneIsZero(t *testing.T) {
	got := nets(stockGraph())
	if len(got) != 5 { // unlinked "free" is absent
		t.Fatalf("nodes = %v", got)
	}
	for id, net := range got {
		if net != 0 {
			t.Errorf("%s net = %v, want 0", id, net)
		}
	}
	if _, ok := got["free"]; ok {
		t.Error("unlinked node must not be planned")
	}
}

func TestDesiredStockNetDoneUndoAndSkipped(t *testing.T) {
	graph := setStatus(stockGraph(), "print", ProcessStepDone)
	got := nets(graph)
	if got["paper"] != -100 || got["ink"] != -2 {
		t.Errorf("inputs = %v", got)
	}
	if got["sheets"] != 90 { // produced by print, not yet consumed by cut
		t.Errorf("sheets = %v, want +90", got["sheets"])
	}
	if got["waste"] != 0 || got["done"] != 0 {
		t.Errorf("cut outputs = %v", got)
	}

	// Undo.
	if undone := nets(setStatus(graph, "print", ProcessStepPending)); undone["paper"] != 0 || undone["sheets"] != 0 {
		t.Errorf("undone = %v", undone)
	}
	// in_progress and skipped are not done.
	for _, status := range []ProcessStepStatus{ProcessStepInProgress, ProcessStepSkipped} {
		if got := nets(setStatus(stockGraph(), "print", status)); got["paper"] != 0 {
			t.Errorf("%s consumed stock: %v", status, got)
		}
	}
}

func TestDesiredStockNetIntermediateProductNetsOut(t *testing.T) {
	graph := setStatus(setStatus(stockGraph(), "print", ProcessStepDone), "cut", ProcessStepDone)
	got := nets(graph)
	if got["sheets"] != 0 { // +90 produced, -90 consumed
		t.Errorf("sheets = %v, want 0", got["sheets"])
	}
	if got["waste"] != 3 || got["done"] != 80 {
		t.Errorf("outputs = %v", got)
	}
	// Only the consuming step done: pure consumption of the intermediate.
	onlyCut := nets(setStatus(stockGraph(), "cut", ProcessStepDone))
	if onlyCut["sheets"] != -90 {
		t.Errorf("sheets = %v, want -90", onlyCut["sheets"])
	}
}

func TestDesiredStockNetActualOverridesPlanned(t *testing.T) {
	graph := setStatus(stockGraph(), "print", ProcessStepDone)
	for i := range graph.Nodes {
		switch graph.Nodes[i].ID {
		case "paper":
			graph.Nodes[i].ActualQuantity = qty(97.5)
		case "ink":
			graph.Nodes[i].ActualQuantity = qty(0) // actual 0 wins over planned 2
		}
	}
	got := nets(graph)
	if got["paper"] != -97.5 || got["ink"] != 0 {
		t.Errorf("got %v", got)
	}
	// Missing quantities post nothing.
	for i := range graph.Nodes {
		graph.Nodes[i].Quantity, graph.Nodes[i].ActualQuantity = nil, nil
	}
	if got := nets(graph); got["paper"] != 0 {
		t.Errorf("no quantity: %v", got)
	}
}

func TestDesiredStockNetConsumedOnceWhenFeedingTwoSteps(t *testing.T) {
	graph := stockGraph()
	graph.Edges = append(graph.Edges, ProcessEdge{ID: "e8", Source: "paper", Target: "cut"})
	graph = setStatus(setStatus(graph, "print", ProcessStepDone), "cut", ProcessStepDone)
	if got := nets(graph)["paper"]; got != -100 {
		t.Errorf("paper = %v, want a single -100", got)
	}
}

func TestReservedInputs(t *testing.T) {
	graph := stockGraph()
	got := ReservedInputs(graph, 1)
	if got["a-paper"] != 100 || got["a-ink"] != 2 || len(got) != 2 {
		t.Errorf("reserved = %v (products/byproducts and unlinked inputs must not reserve)", got)
	}
	consumed := ReservedInputs(setStatus(graph, "print", ProcessStepDone), 1)
	if len(consumed) != 0 {
		t.Errorf("after print done = %v, want none", consumed)
	}
	if skipped := ReservedInputs(setStatus(graph, "print", ProcessStepSkipped), 1); skipped["a-paper"] != 100 {
		t.Errorf("skipped step still reserves: %v", skipped)
	}
	// Two nodes of the same article add up; planned quantity, not actual.
	graph.Nodes = append(graph.Nodes, ProcessNode{ID: "paper2", Kind: ProcessNodeInput, Label: "Papir 2", Quantity: qty(5), ActualQuantity: qty(50), CatalogItemID: "a-paper"})
	graph.Edges = append(graph.Edges, ProcessEdge{ID: "e9", Source: "paper2", Target: "cut"})
	if got := ReservedInputs(graph, 1)["a-paper"]; got != 105 {
		t.Errorf("summed = %v, want 105", got)
	}
}

func TestPlanStockPostingsIsIdempotentAndReversible(t *testing.T) {
	graph := setStatus(stockGraph(), "print", ProcessStepDone)
	first := PlanStockPostings(graph, 1, nil)
	if len(first) != 3 { // paper, ink, sheets
		t.Fatalf("plan = %+v", first)
	}
	existing := map[StockNodeKey]float64{}
	for _, m := range first {
		existing[StockNodeKey{NodeID: m.NodeID, CatalogItemID: m.CatalogItemID}] += m.Quantity
		wantKind := StockMovementConsumption
		if m.Quantity > 0 {
			wantKind = StockMovementProduction
		}
		if m.Kind != wantKind {
			t.Errorf("%s kind = %s", m.NodeID, m.Kind)
		}
	}
	if again := PlanStockPostings(graph, 1, existing); len(again) != 0 {
		t.Fatalf("second plan = %+v, want none", again)
	}

	// Undo reverses everything.
	reverse := PlanStockPostings(setStatus(graph, "print", ProcessStepPending), 1, existing)
	if len(reverse) != 3 {
		t.Fatalf("reverse = %+v", reverse)
	}
	for _, m := range reverse {
		if math.Abs(m.Quantity+existing[StockNodeKey{NodeID: m.NodeID, CatalogItemID: m.CatalogItemID}]) > 1e-9 {
			t.Errorf("%s reverse = %v", m.NodeID, m.Quantity)
		}
		if m.Kind != StockMovementAdjustment {
			t.Errorf("%s reverse kind = %s, want adjustment", m.NodeID, m.Kind)
		}
	}

	// Changed actual quantity posts only the delta.
	changed := CloneProcessGraph(graph)
	for i := range changed.Nodes {
		if changed.Nodes[i].ID == "paper" {
			changed.Nodes[i].ActualQuantity = qty(95)
		}
	}
	delta := PlanStockPostings(changed, 1, existing)
	// Using less paper than posted gives material back: a correction, not production.
	if len(delta) != 1 || delta[0].NodeID != "paper" || delta[0].Quantity != 5 || delta[0].Kind != StockMovementAdjustment {
		t.Fatalf("delta = %+v, want +5 adjustment on paper", delta)
	}
}

func TestPlanStockPostingsRelinkAndRemovedNodes(t *testing.T) {
	graph := setStatus(stockGraph(), "print", ProcessStepDone)
	existing := map[StockNodeKey]float64{
		{NodeID: "paper", CatalogItemID: "a-old-paper"}: -100, // posted before the node was relinked
		{NodeID: "ink", CatalogItemID: "a-ink"}:         -2,
		{NodeID: "sheets", CatalogItemID: "a-sheets"}:   90,
		{NodeID: "gone", CatalogItemID: "a-gone"}:       -7, // node no longer in the graph
	}
	plan := PlanStockPostings(graph, 1, existing)
	got := map[StockNodeKey]float64{}
	for _, m := range plan {
		got[StockNodeKey{NodeID: m.NodeID, CatalogItemID: m.CatalogItemID}] = m.Quantity
	}
	want := map[StockNodeKey]float64{
		{NodeID: "paper", CatalogItemID: "a-old-paper"}: 100,
		{NodeID: "paper", CatalogItemID: "a-paper"}:     -100,
		{NodeID: "gone", CatalogItemID: "a-gone"}:       7,
	}
	if len(got) != len(want) {
		t.Fatalf("plan = %v, want %v", got, want)
	}
	for key, quantity := range want {
		if got[key] != quantity {
			t.Errorf("%v = %v, want %v", key, got[key], quantity)
		}
	}
}

func TestResolveGraphArticleLinks(t *testing.T) {
	articles := map[string]StockArticle{"a1": {ID: "a1", Name: "Papir", Unit: "tabak"}}
	lookup := func(id string) (StockArticle, bool) { a, ok := articles[id]; return a, ok }
	graph := ProcessGraph{Nodes: []ProcessNode{
		{ID: "s", Kind: ProcessNodeStep, Label: "S"},
		{ID: "i", Kind: ProcessNodeInput, Label: "I", CatalogItemID: "a1"},
	}}

	resolved, err := ResolveGraphArticleLinks(graph, lookup, nil)
	if err != nil || resolved.Nodes[1].Unit != "tabak" {
		t.Fatalf("fill unit = %+v, %v", resolved.Nodes[1], err)
	}
	if graph.Nodes[1].Unit != "" {
		t.Error("input graph was modified")
	}

	graph.Nodes[1].Unit = " TABAK "
	if _, err := ResolveGraphArticleLinks(graph, lookup, nil); err != nil {
		t.Fatalf("case/space-insensitive unit: %v", err)
	}

	graph.Nodes[1].Unit = "kg"
	_, err = ResolveGraphArticleLinks(graph, lookup, nil)
	var graphErr *ProcessGraphError
	if !errors.As(err, &graphErr) || graphErr.Message != "Jedinica mora odgovarati jedinici artikla „Papir“." {
		t.Fatalf("unit mismatch = %v", err)
	}
	if _, err := ResolveGraphArticleLinks(graph, lookup, func(ProcessNode) bool { return true }); err != nil {
		t.Fatalf("skipped node validated: %v", err)
	}

	graph.Nodes[1].CatalogItemID = "missing"
	if _, err := ResolveGraphArticleLinks(graph, lookup, nil); !errors.As(err, &graphErr) || graphErr.Message != StockArticleNotFoundMessage {
		t.Fatalf("missing article = %v", err)
	}
}

func TestStockLowAndValidation(t *testing.T) {
	min := qty(10)
	if !StockLow(5, 5, min) || StockLow(10, 10, min) || !StockLow(-1, -1, nil) || StockLow(3, 3, nil) {
		t.Error("StockLow thresholds wrong")
	}
	if !StockLow(20, 5, min) {
		t.Error("available below minimum must be low even when on-hand is fine")
	}

	cases := []struct {
		name  string
		input StockReceiptInput
		want  string
	}{
		{"empty", StockReceiptInput{}, "Prijem mora imati između 1 i 200 stavki."},
		{"zero", StockReceiptInput{Lines: []StockReceiptLine{{CatalogItemID: "a", Quantity: 0}}}, StockQuantityPositiveMessage},
		{"negative", StockReceiptInput{Lines: []StockReceiptLine{{CatalogItemID: "a", Quantity: -1}}}, StockQuantityPositiveMessage},
		{"duplicate", StockReceiptInput{Lines: []StockReceiptLine{{CatalogItemID: "a", Quantity: 1}, {CatalogItemID: " a ", Quantity: 2}}}, StockDuplicateArticleMessage},
		{"ok", StockReceiptInput{Lines: []StockReceiptLine{{CatalogItemID: "a", Quantity: 1.5}}}, ""},
	}
	for _, tc := range cases {
		if got := ValidateStockReceipt(tc.input); got != tc.want {
			t.Errorf("%s: %q, want %q", tc.name, got, tc.want)
		}
	}
	if got := ValidateStockCount(StockCountInput{Lines: []StockCountLine{{CatalogItemID: "a", CountedQuantity: -1}}}); got != StockCountNegativeMessage {
		t.Errorf("negative count: %q", got)
	}
	if got := ValidateStockCount(StockCountInput{Lines: []StockCountLine{{CatalogItemID: "a", CountedQuantity: 0}}}); got != "" {
		t.Errorf("zero count rejected: %q", got)
	}
}

// Planned quantities are per unit of the order and scale by the order's
// quantity factor (D-028); actual quantities are absolute and never scale.
func TestStockQuantitiesScaleByOrderFactor(t *testing.T) {
	graph := stockGraph()
	reserved := ReservedInputs(graph, 3)
	if reserved["a-paper"] != 300 || reserved["a-ink"] != 6 {
		t.Fatalf("reserved ×3 = %v", reserved)
	}
	done := setStatus(setStatus(graph, "print", ProcessStepDone), "cut", ProcessStepDone)
	for i := range done.Nodes {
		if done.Nodes[i].ID == "ink" {
			done.Nodes[i].ActualQuantity = qty(5) // absolute, entered by the operator
		}
	}
	net := DesiredStockNet(done, 3)
	want := map[string]float64{"paper": -300, "ink": -5, "sheets": 0, "waste": 9, "done": 240}
	for id, expected := range want {
		if got := net[id].Net; math.Abs(got-expected) > 1e-9 {
			t.Errorf("%s net ×3 = %v, want %v", id, got, expected)
		}
	}
	// A legacy per-order copy (factor 1) keeps the stored amounts as they are.
	if legacy := DesiredStockNet(done, 1); legacy["paper"].Net != -100 || legacy["done"].Net != 80 {
		t.Fatalf("legacy net = %v", legacy)
	}
	// Fractional per-unit amounts round to three decimals once scaled.
	fractional := CloneProcessGraph(graph)
	fractional.Nodes[0].Quantity = qty(1100.0 / 3000.0)
	if got := ReservedInputs(fractional, 3000)["a-paper"]; got != 1100 {
		t.Fatalf("fractional reserved = %v, want 1100", got)
	}
}
