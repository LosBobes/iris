package store

import (
	"context"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// materialGraph is one printing step that takes perUnit sheets of paper per
// unit of the order.
func materialGraph(perUnit float64) domain.ProcessGraph {
	return domain.ProcessGraph{
		Nodes: []domain.ProcessNode{
			{ID: "paper", Kind: domain.ProcessNodeInput, Label: "Papir", Unit: "tabak", CatalogItemID: "cat-paper", Quantity: stockQty(perUnit)},
			{ID: "print", Kind: domain.ProcessNodeStep, Label: "Štampa", Status: domain.ProcessStepPending},
		},
		Edges: []domain.ProcessEdge{{ID: "e1", Source: "paper", Target: "print"}},
	}
}

func newMaterialOrder(t *testing.T, ctx context.Context, s *SQLiteStore, client string, quantity int, templateID string) *domain.WorkOrder {
	t.Helper()
	order, err := s.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName: client, JobDescription: "Posao", IssuedBy: "admin", IssueDate: "2026-10-01",
		JobDetails: &domain.JobDetails{Quantity: &quantity}, Assignment: domain.Assignment{Priority: "normal"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApplyProcessTemplate(ctx, order.ID, templateID, "admin"); err != nil {
		t.Fatal(err)
	}
	return order
}

func publishMaterialPlan(t *testing.T, ctx context.Context, s *SQLiteStore, date, horizonEnd string, blocks ...domain.PlanAssignment) {
	t.Helper()
	at := "2026-10-16T12:00:00Z"
	plan := domain.ProductionPlan{
		ID: "plan-" + date, Date: date, Status: domain.PlanStatusPublished, HorizonEnd: horizonEnd,
		GeneratedAt: at, GeneratedBy: "admin", UpdatedAt: at, UpdatedBy: "admin", PublishedAt: &at, PublishedBy: stringPtr("admin"),
		Assignments: blocks, Issues: []domain.PlanIssue{}, LateOrders: []domain.OrderForecast{},
	}
	if err := insertPlan(ctx, s.db, DemoTenantID, plan); err != nil {
		t.Fatal(err)
	}
}

func printBlock(orderID, start string) domain.PlanAssignment {
	return domain.PlanAssignment{
		ID: orderID + "-" + start, WorkOrderID: orderID, StepNodeID: "print", StepLabel: "Štampa",
		Start: start, End: start, UserIDs: []string{}, Part: 1, Parts: 1,
	}
}

func TestMaterialNeedsFromPublishedHorizon(t *testing.T) {
	s, ctx := newPlanningStore(t) // today is Monday 2026-10-19
	enablePlanning(t, s, DemoTenantSlug)
	upsertArticle(t, ctx, s, "cat-paper", "Papir 70g", "tabak", domain.CatalogItemKindArticle, nil)
	if _, err := s.PostStockCount(ctx, domain.StockCountInput{Lines: []domain.StockCountLine{{CatalogItemID: "cat-paper", CountedQuantity: 100}}}, "admin"); err != nil {
		t.Fatal(err)
	}
	template, err := s.CreateProcessTemplate(ctx, domain.ProcessTemplateInput{Name: "Štampa", Graph: materialGraph(2)})
	if err != nil {
		t.Fatal(err)
	}
	alfa := newMaterialOrder(t, ctx, s, "Alfa", 30, template.ID) // 60 sheets
	beta := newMaterialOrder(t, ctx, s, "Beta", 50, template.ID) // 100 sheets

	// No plan yet: from today over four weeks, everything unplanned.
	needs, err := s.MaterialNeeds(ctx, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if needs.From != "2026-10-19" || needs.To != "2026-11-15" || len(needs.Weeks) != 4 || len(needs.Items) != 1 {
		t.Fatalf("defaults = %+v", needs)
	}
	paper := needs.Items[0]
	if paper.CatalogItemID == nil || *paper.CatalogItemID != "cat-paper" || paper.Name != "Papir 70g" || paper.Unplanned != 160 ||
		paper.OnHand == nil || *paper.OnHand != 100 || *paper.Reserved != 160 || *paper.Available != -60 || paper.ShortFromWeek != nil {
		t.Fatalf("paper without a plan = %+v", paper)
	}

	// Friday's plan projected Alfa onto today and Beta onto next Tuesday; its
	// horizon end becomes the default end of the window.
	publishMaterialPlan(t, ctx, s, "2026-10-16", "2026-11-05",
		printBlock(alfa.ID, "2026-10-19T07:00"), printBlock(beta.ID, "2026-10-27T07:00"))
	needs, err = s.MaterialNeeds(ctx, "", "")
	if err != nil {
		t.Fatal(err)
	}
	paper = needs.Items[0]
	if needs.To != "2026-11-05" || len(needs.Weeks) != 3 || needs.Weeks[2] != (domain.MaterialNeedsWeek{Start: "2026-11-02", End: "2026-11-05"}) {
		t.Fatalf("window = %s..%s %+v", needs.From, needs.To, needs.Weeks)
	}
	if paper.Weeks[0] != 60 || paper.Weeks[1] != 100 || paper.Cumulative[1] != 160 || paper.Unplanned != 0 ||
		paper.ShortFromWeek == nil || *paper.ShortFromWeek != 1 {
		t.Fatalf("paper with Friday's plan = %+v", paper)
	}

	// Tuesday's own published plan speaks for Tuesday on: it dropped Beta.
	publishMaterialPlan(t, ctx, s, "2026-10-20", "2026-11-06", printBlock(alfa.ID, "2026-10-20T07:00"))
	if needs, err = s.MaterialNeeds(ctx, "2026-10-19", "2026-11-01"); err != nil {
		t.Fatal(err)
	}
	if paper = needs.Items[0]; paper.Weeks[0] != 60 || paper.Weeks[1] != 0 || paper.Unplanned != 100 || paper.ShortFromWeek != nil {
		t.Fatalf("paper with Tuesday's plan = %+v", paper)
	}

	// Once Alfa's step is done its paper is consumed (posted) and left out;
	// the per-order copy flag turns off the scaling.
	process, err := s.WorkOrderProcess(ctx, alfa.ID)
	if err != nil {
		t.Fatal(err)
	}
	graph := domain.CloneProcessGraph(process.Graph)
	graph.Nodes[1].Status = domain.ProcessStepDone
	if _, err := s.UpdateWorkOrderProcess(ctx, alfa.ID, graph, "ana", false); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`UPDATE work_order_processes SET quantities_per_order = 1 WHERE work_order_id = ?`, beta.ID); err != nil {
		t.Fatal(err)
	}
	if needs, err = s.MaterialNeeds(ctx, "2026-10-19", "2026-11-01"); err != nil {
		t.Fatal(err)
	}
	if paper = needs.Items[0]; paper.Weeks[0] != 0 || paper.Unplanned != 2 || *paper.OnHand != 40 {
		t.Fatalf("paper after Alfa is done = %+v", paper)
	}

	// Window validation.
	_, err = s.MaterialNeeds(ctx, "2026-10-20", "2026-10-19")
	requireValidation(t, err, materialNeedsOrderMessage)
	_, err = s.MaterialNeeds(ctx, "2026-10-19", "2026-12-14")
	requireValidation(t, err, materialNeedsSpanMessage)
	_, err = s.MaterialNeeds(ctx, "2026-10-19", "2026-13-01")
	requireValidation(t, err, invalidPlanningDate)

	// Another organization sees none of it.
	if err := s.EnsureTenant(context.Background(), "tenant-other", "other", "Other"); err != nil {
		t.Fatal(err)
	}
	other, err := s.MaterialNeeds(ContextWithTenant(context.Background(), "tenant-other"), "", "")
	if err != nil || len(other.Items) != 0 || other.Items == nil {
		t.Fatalf("other organization = %+v, %v", other, err)
	}
}

func TestDefaultMaterialNeedsEndIsClipped(t *testing.T) {
	far := []domain.ProductionPlan{{Date: "2026-10-16", HorizonEnd: "2027-03-01"}}
	// Wednesday: the eighth week ends on Sunday 2026-12-13.
	if end := defaultMaterialNeedsEnd("2026-10-21", far); end != "2026-12-13" {
		t.Fatalf("clipped end = %s", end)
	}
	if end := defaultMaterialNeedsEnd("2026-10-21", nil); end != "2026-11-17" {
		t.Fatalf("four weeks = %s", end)
	}
}
