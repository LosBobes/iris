package planner

import (
	"errors"
	"fmt"
	"reflect"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func TestMaterialWeeks(t *testing.T) {
	weeks, err := MaterialWeeks("2026-10-21", "2026-10-27") // Wednesday to the next Tuesday
	if err != nil {
		t.Fatal(err)
	}
	want := []domain.MaterialNeedsWeek{{Start: "2026-10-21", End: "2026-10-25"}, {Start: "2026-10-26", End: "2026-10-27"}}
	if !reflect.DeepEqual(weeks, want) {
		t.Fatalf("weeks = %+v", weeks)
	}
	if weeks, err := MaterialWeeks("2026-10-25", "2026-10-25"); err != nil || len(weeks) != 1 || weeks[0].Start != "2026-10-25" || weeks[0].End != "2026-10-25" {
		t.Fatalf("one Sunday = %+v, %v", weeks, err)
	}
	// Eight full weeks fit; one day more touches a ninth.
	if weeks, err := MaterialWeeks("2026-10-19", "2026-12-13"); err != nil || len(weeks) != 8 {
		t.Fatalf("eight weeks = %d, %v", len(weeks), err)
	}
	if _, err := MaterialWeeks("2026-10-19", "2026-12-14"); !errors.Is(err, ErrMaterialWindowSpan) {
		t.Fatalf("nine weeks = %v", err)
	}
	if _, err := MaterialWeeks("2026-10-20", "2026-10-19"); !errors.Is(err, ErrMaterialWindowOrder) {
		t.Fatalf("reversed = %v", err)
	}
	if _, err := MaterialWeeks("2026-13-01", "2026-10-19"); err == nil {
		t.Fatal("malformed date accepted")
	}
}

func inputNode(id, label, unit, catalogItemID string, quantity float64) domain.ProcessNode {
	return domain.ProcessNode{
		ID: id, Kind: domain.ProcessNodeInput, Label: label, Unit: unit, CatalogItemID: catalogItemID, Quantity: fl(quantity),
	}
}

func materialBlock(order, step, start string) domain.PlanAssignment {
	return domain.PlanAssignment{ID: order + "-" + step + "-" + start, WorkOrderID: order, StepNodeID: step, Start: start, End: start}
}

func materialScenario() MaterialNeedsInput {
	weeks, err := MaterialWeeks("2026-10-19", "2026-11-01")
	if err != nil {
		panic(err)
	}
	printStep := func(status domain.ProcessStepStatus) domain.ProcessNode {
		node := stepNode("print", "Štampa", "", 30, 1)
		node.Status = status
		return node
	}
	o1 := domain.ProcessGraph{
		Nodes: []domain.ProcessNode{
			inputNode("paper", "Papir", "tabak", "cat-paper", 2),
			inputNode("ink", "Boja", "kg", "", 0.1),
			inputNode("glue", "Lepak", "kg", "cat-glue", 1),
			inputNode("old", "Stari karton", "kom", "cat-gone", 0.5),
			printStep(domain.ProcessStepInProgress),
		},
		Edges: []domain.ProcessEdge{edge("paper", "print"), edge("ink", "print"), edge("glue", "print"), edge("old", "print")},
	}
	cut := stepNode("cut", "Sečenje", "", 10, 1)
	o2 := domain.ProcessGraph{
		Nodes: []domain.ProcessNode{inputNode("paper", "Papir", "tabak", "cat-paper", 5), cut},
		Edges: []domain.ProcessEdge{edge("paper", "cut")},
	}
	o3 := domain.ProcessGraph{
		Nodes: []domain.ProcessNode{
			inputNode("paper", "Papir", "tabak", "cat-paper", 1),
			inputNode("ink", " boja ", "KG", "", 0.02),
			printStep(domain.ProcessStepPending),
		},
		Edges: []domain.ProcessEdge{edge("paper", "print"), edge("ink", "print")},
	}
	// Already consumed (a consuming step is done), only feeding a skipped
	// step, without a quantity, or feeding nothing: none of these count.
	skipped := stepNode("varnish", "Lak", "", 5, 1)
	skipped.Status = domain.ProcessStepSkipped
	o4 := domain.ProcessGraph{
		Nodes: []domain.ProcessNode{
			inputNode("paper", "Papir", "tabak", "cat-paper", 7),
			inputNode("lacquer", "Lak", "l", "", 3),
			{ID: "nothing", Kind: domain.ProcessNodeInput, Label: "Bez količine", CatalogItemID: "cat-paper"},
			inputNode("loose", "Višak", "kom", "", 4),
			printStep(domain.ProcessStepDone),
			skipped,
		},
		Edges: []domain.ProcessEdge{edge("paper", "print"), edge("lacquer", "varnish"), edge("nothing", "print")},
	}
	// First planned after the window: out of the report.
	o5 := domain.ProcessGraph{
		Nodes: []domain.ProcessNode{inputNode("paper", "Papir", "tabak", "cat-paper", 3), printStep(domain.ProcessStepPending)},
		Edges: []domain.ProcessEdge{edge("paper", "print")},
	}

	// The plan of Friday the 16th projected o1 onto Monday, o3 onto Tuesday and
	// o2 onto Thursday; the plan of Tuesday the 20th speaks for the 20th on: it
	// moved o3 to the 27th, dropped o2, and put o5 after the window.
	friday := domain.ProductionPlan{ID: "p16", Date: "2026-10-16", Assignments: []domain.PlanAssignment{
		materialBlock("o1", "print", "2026-10-16T13:00"),
		materialBlock("o1", "print", "2026-10-19T07:00"),
		materialBlock("o3", "print", "2026-10-20T07:00"),
		materialBlock("o2", "cut", "2026-10-22T07:00"),
	}}
	tuesday := domain.ProductionPlan{ID: "p20", Date: "2026-10-20", Assignments: []domain.PlanAssignment{
		materialBlock("o3", "print", "2026-10-27T09:00"),
		materialBlock("o3", "print", "2026-10-28T07:00"),
		materialBlock("o5", "print", "2026-11-03T07:00"),
	}}
	return MaterialNeedsInput{
		Weeks: weeks,
		Plans: []domain.ProductionPlan{tuesday, friday},
		Orders: []MaterialOrder{
			{WorkOrderID: "o3", Graph: o3, Factor: 100},
			{WorkOrderID: "o1", Graph: o1, Factor: 10},
			{WorkOrderID: "o2", Graph: o2, Factor: 1},
			{WorkOrderID: "o4", Graph: o4, Factor: 1},
			{WorkOrderID: "o5", Graph: o5, Factor: 1},
		},
		Stock: map[string]domain.StockLevel{
			"cat-paper": {CatalogItemID: "cat-paper", Name: "Papir 70g B1", Unit: "tabak", OnHand: 110, Reserved: 128, Available: -18},
			"cat-glue":  {CatalogItemID: "cat-glue", Name: "Lepak", Unit: "kg", OnHand: 50, Reserved: 10, Available: 40},
		},
	}
}

func TestMaterialNeeds(t *testing.T) {
	got := MaterialNeeds(materialScenario())
	if got.From != "2026-10-19" || got.To != "2026-11-01" || len(got.Weeks) != 2 {
		t.Fatalf("window = %s..%s %+v", got.From, got.To, got.Weeks)
	}
	short := 1
	want := []domain.MaterialNeedsItem{
		{
			// o1: 2 × 10 in week 0; o3: 1 × 100 in week 1 (its block moved by
			// the later plan); o2: 5 unplanned (the later plan dropped it).
			// 120 > 110 on hand from week 1.
			CatalogItemID: sp("cat-paper"), Name: "Papir 70g B1", Unit: "tabak",
			OnHand: fl(110), Reserved: fl(128), Available: fl(-18),
			Weeks: []float64{20, 100}, Cumulative: []float64{20, 120}, Unplanned: 5, ShortFromWeek: &short,
		},
		{
			// Unlinked inputs merge by name and unit, case-insensitively.
			Name: "Boja", Unit: "kg", Weeks: []float64{1, 2}, Cumulative: []float64{1, 3},
		},
		{
			CatalogItemID: sp("cat-glue"), Name: "Lepak", Unit: "kg", OnHand: fl(50), Reserved: fl(10), Available: fl(40),
			Weeks: []float64{10, 0}, Cumulative: []float64{10, 10},
		},
		{
			// A linked article missing from the stock list keeps its link but
			// has no stock figures (and so no shortage).
			CatalogItemID: sp("cat-gone"), Name: "Stari karton", Unit: "kom", Weeks: []float64{5, 0}, Cumulative: []float64{5, 5},
		},
	}
	if !reflect.DeepEqual(got.Items, want) {
		t.Fatalf("items =\n%s\nwant\n%s", describeMaterialItems(got.Items), describeMaterialItems(want))
	}
}

func TestMaterialNeedsIsDeterministic(t *testing.T) {
	first := MaterialNeeds(materialScenario())
	in := materialScenario()
	// Input order does not matter.
	for i, j := 0, len(in.Orders)-1; i < j; i, j = i+1, j-1 {
		in.Orders[i], in.Orders[j] = in.Orders[j], in.Orders[i]
	}
	in.Plans[0], in.Plans[1] = in.Plans[1], in.Plans[0]
	if again := MaterialNeeds(in); !reflect.DeepEqual(first, again) {
		t.Fatalf("result depends on input order:\n%+v\n%+v", first, again)
	}
}

func TestMaterialNeedsWithoutPlans(t *testing.T) {
	in := materialScenario()
	in.Plans = nil
	got := MaterialNeeds(in)
	if len(got.Items) != 4 {
		t.Fatalf("items = %+v", got.Items)
	}
	for _, item := range got.Items {
		if item.ShortFromWeek != nil || item.Cumulative[len(item.Cumulative)-1] != 0 || item.Unplanned <= 0 {
			t.Fatalf("without plans everything is unplanned: %+v", item)
		}
	}
	// Paper: 20 + 5 + 100 + 3.
	if got.Items[2].Name != "Papir 70g B1" || got.Items[2].Unplanned != 128 {
		t.Fatalf("paper = %+v", got.Items[2])
	}
	if empty := MaterialNeeds(MaterialNeedsInput{}); empty.Items == nil || empty.Weeks == nil || len(empty.Items) != 0 {
		t.Fatalf("empty input = %+v", empty)
	}
}

func TestEffectiveBlocks(t *testing.T) {
	in := materialScenario()
	blocks := EffectiveBlocks(in.Plans, "2026-10-19")
	ids := make([]string, 0, len(blocks))
	for _, block := range blocks {
		ids = append(ids, block.ID)
	}
	want := []string{"o1-print-2026-10-19T07:00", "o3-print-2026-10-27T09:00", "o3-print-2026-10-28T07:00", "o5-print-2026-11-03T07:00"}
	if !reflect.DeepEqual(ids, want) {
		t.Fatalf("blocks = %v, want %v", ids, want)
	}
}

func describeMaterialItems(items []domain.MaterialNeedsItem) string {
	out := ""
	for _, item := range items {
		id, short := "<nil>", "<nil>"
		if item.CatalogItemID != nil {
			id = *item.CatalogItemID
		}
		if item.ShortFromWeek != nil {
			short = fmt.Sprint(*item.ShortFromWeek)
		}
		out += fmt.Sprintf("%s %s %s weeks=%v cum=%v unplanned=%v short=%s\n", id, item.Name, item.Unit, item.Weeks, item.Cumulative, item.Unplanned, short)
	}
	return out
}
