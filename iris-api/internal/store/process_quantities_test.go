package store

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/testutil"
)

// newQuantityOrder creates a work order of the given quantity.
func newQuantityOrder(t *testing.T, ctx context.Context, s Store, quantity int) *domain.WorkOrder {
	t.Helper()
	order, err := s.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName: "Alfa", JobDescription: "Posao", IssuedBy: "admin", IssueDate: "2026-06-02",
		Assignment: domain.Assignment{Priority: "normal"},
		JobDetails: &domain.JobDetails{Quantity: &quantity},
	})
	if err != nil {
		t.Fatal(err)
	}
	return order
}

func setPrintStatus(graph domain.ProcessGraph, status domain.ProcessStepStatus) domain.ProcessGraph {
	graph = domain.CloneProcessGraph(graph)
	for i := range graph.Nodes {
		if graph.Nodes[i].ID == "print" {
			graph.Nodes[i].Status = status
		}
	}
	return graph
}

// runQuantityScalingContract: item-node quantities are per unit of the order
// (D-028). Reservations and automatic postings multiply them by the order's
// jobDetails.quantity; actual quantities stay absolute.
func runQuantityScalingContract(t *testing.T, s Store, ctx context.Context) {
	t.Helper()
	upsertArticle(t, ctx, s, "paper", "Papir 80g", "tabak", domain.CatalogItemKindArticle, nil)
	upsertArticle(t, ctx, s, "ink", "Boja CMYK", "kg", domain.CatalogItemKindArticle, nil)
	upsertArticle(t, ctx, s, "waste", "Makulatura", "tabak", domain.CatalogItemKindArticle, nil)
	if _, err := s.PostStockCount(ctx, domain.StockCountInput{Lines: []domain.StockCountLine{
		{CatalogItemID: "paper", CountedQuantity: 100}, {CatalogItemID: "ink", CountedQuantity: 10},
	}}, "boss"); err != nil {
		t.Fatal(err)
	}
	template, err := s.CreateProcessTemplate(ctx, domain.ProcessTemplateInput{Name: "Offset", Graph: stockProcessGraph("paper", "ink", "waste")})
	if err != nil {
		t.Fatal(err)
	}

	order := newQuantityOrder(t, ctx, s, 3)
	process, err := s.ApplyProcessTemplate(ctx, order.ID, template.ID, "ana")
	if err != nil {
		t.Fatal(err)
	}
	if process.QuantitiesPerOrder {
		t.Fatalf("fresh copy flagged per order: %+v", process)
	}
	// Reserved: 10 tabak × 3 and 2 kg × 3.
	if paper := levelOf(t, ctx, s, "paper"); paper.Reserved != 30 || paper.Available != 70 {
		t.Fatalf("paper reserved ×3 = %+v", paper)
	}
	if ink := levelOf(t, ctx, s, "ink"); ink.Reserved != 6 {
		t.Fatalf("ink reserved ×3 = %+v", ink)
	}

	// Done: consumption and production are scaled too.
	done, err := s.UpdateWorkOrderProcess(ctx, order.ID, setPrintStatus(process.Graph, domain.ProcessStepDone), "bojan", false)
	if err != nil {
		t.Fatal(err)
	}
	if onHandOf(t, ctx, s, "paper") != 70 || onHandOf(t, ctx, s, "ink") != 4 || onHandOf(t, ctx, s, "waste") != 3 {
		t.Fatalf("after done ×3: paper %v ink %v waste %v", onHandOf(t, ctx, s, "paper"), onHandOf(t, ctx, s, "ink"), onHandOf(t, ctx, s, "waste"))
	}
	if paper := levelOf(t, ctx, s, "paper"); paper.Reserved != 0 || paper.Available != 70 {
		t.Fatalf("paper after done = %+v", paper)
	}

	// An actual quantity is the absolute amount for the whole order (28, not 28 × 3).
	actual := domain.CloneProcessGraph(done.Graph)
	actual.Nodes[0].ActualQuantity = stockQty(28)
	if _, err := s.UpdateWorkOrderProcess(ctx, order.ID, actual, "bojan", false); err != nil {
		t.Fatal(err)
	}
	if onHandOf(t, ctx, s, "paper") != 72 {
		t.Fatalf("paper after actual = %v, want 72", onHandOf(t, ctx, s, "paper"))
	}

	// An order without a quantity scales by 1.
	single := newQuantityOrder(t, ctx, s, 0)
	if _, err := s.ApplyProcessTemplate(ctx, single.ID, template.ID, "ana"); err != nil {
		t.Fatal(err)
	}
	if ink := levelOf(t, ctx, s, "ink"); ink.Reserved != 2 {
		t.Fatalf("ink reserved for quantity-less order = %+v", ink)
	}
}

func TestSQLiteStoreQuantitiesScaleByOrder(t *testing.T) {
	ctx := testTenantContext()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	t.Cleanup(func() { _ = s.Close() })
	enableModules(t, s, DemoTenantSlug)
	runQuantityScalingContract(t, s, ctx)
}

func TestFixtureStoreQuantitiesScaleByOrder(t *testing.T) {
	ctx := testTenantContext()
	s := NewFixtureStore(testutil.FixtureDir(t))
	enableModules(t, s, DemoTenantSlug)
	runQuantityScalingContract(t, s, ctx)
}

// A copy flagged quantities_per_order (every copy that existed before D-028)
// keeps its absolute amounts; re-attaching a template clears the flag.
func TestSQLiteStoreLegacyPerOrderCopyIsNotScaled(t *testing.T) {
	ctx := testTenantContext()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	t.Cleanup(func() { _ = s.Close() })
	enableModules(t, s, DemoTenantSlug)
	upsertArticle(t, ctx, s, "paper", "Papir 80g", "tabak", domain.CatalogItemKindArticle, nil)
	upsertArticle(t, ctx, s, "ink", "Boja CMYK", "kg", domain.CatalogItemKindArticle, nil)
	upsertArticle(t, ctx, s, "waste", "Makulatura", "tabak", domain.CatalogItemKindArticle, nil)
	if _, err := s.PostStockCount(ctx, domain.StockCountInput{Lines: []domain.StockCountLine{{CatalogItemID: "paper", CountedQuantity: 100}}}, "boss"); err != nil {
		t.Fatal(err)
	}
	template, err := s.CreateProcessTemplate(ctx, domain.ProcessTemplateInput{Name: "Offset", Graph: stockProcessGraph("paper", "ink", "waste")})
	if err != nil {
		t.Fatal(err)
	}
	order := newQuantityOrder(t, ctx, s, 3)
	if _, err := s.ApplyProcessTemplate(ctx, order.ID, template.ID, "ana"); err != nil {
		t.Fatal(err)
	}
	// What the v32 migration does to a copy that already existed.
	if _, err := s.db.ExecContext(ctx, `UPDATE work_order_processes SET quantities_per_order = 1 WHERE work_order_id = ?`, order.ID); err != nil {
		t.Fatal(err)
	}
	legacy, err := s.WorkOrderProcess(ctx, order.ID)
	if err != nil || legacy == nil || !legacy.QuantitiesPerOrder {
		t.Fatalf("legacy process = %+v, %v", legacy, err)
	}
	if paper := levelOf(t, ctx, s, "paper"); paper.Reserved != 10 {
		t.Fatalf("legacy copy reserved = %+v, want the stored 10", paper)
	}
	if _, err := s.UpdateWorkOrderProcess(ctx, order.ID, setPrintStatus(legacy.Graph, domain.ProcessStepDone), "bojan", false); err != nil {
		t.Fatal(err)
	}
	if onHandOf(t, ctx, s, "paper") != 90 {
		t.Fatalf("legacy copy consumed %v, want 10", 100-onHandOf(t, ctx, s, "paper"))
	}

	// Re-attaching the template gives a per-unit copy again.
	if err := s.DeleteWorkOrderProcess(ctx, order.ID); err != nil {
		t.Fatal(err)
	}
	fresh, err := s.ApplyProcessTemplate(ctx, order.ID, template.ID, "ana")
	if err != nil || fresh.QuantitiesPerOrder {
		t.Fatalf("re-attached process = %+v, %v", fresh, err)
	}
	if paper := levelOf(t, ctx, s, "paper"); paper.Reserved != 30 {
		t.Fatalf("re-attached copy reserved = %+v, want 30", paper)
	}
}

// The v32 migration flags every process copy that exists when it runs and
// leaves the default (per unit) for copies inserted afterwards.
func TestQuantitiesPerOrderMigrationFlagsExistingCopies(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if _, err := db.ExecContext(ctx, `PRAGMA foreign_keys = ON`); err != nil {
		t.Fatal(err)
	}
	// Everything up to (not including) v32 reproduces the pre-D-028 schema.
	migrateSQLiteBelow(t, ctx, db, 32)
	for _, statement := range []string{
		`INSERT INTO tenants(id, slug, name) VALUES ('t1', 'legacy', 'Legacy')`,
		`INSERT INTO work_orders(id, tenant_id, order_number, client_name, job_description, issued_by, status, issue_date, payload, created_at, updated_at)
		 VALUES ('wo1', 't1', 'RN-2026-00001', 'Klijent', 'Posao', 'admin', 'new', '2026-01-01', '{}', '2026-01-01', '2026-01-01')`,
		`INSERT INTO work_order_processes(work_order_id, tenant_id, template_name, graph, updated_at, updated_by, stock_tracked)
		 VALUES ('wo1', 't1', 'Offset', '{"nodes":[],"edges":[]}', '2026-01-01', 'admin', 1)`,
	} {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatalf("seed %q: %v", statement, err)
		}
	}
	if err := RunMigrations(ctx, db); err != nil {
		t.Fatalf("run migrations: %v", err)
	}
	var flagged int
	if err := db.QueryRowContext(ctx, `SELECT quantities_per_order FROM work_order_processes WHERE work_order_id = 'wo1'`).Scan(&flagged); err != nil {
		t.Fatal(err)
	}
	if flagged != 1 {
		t.Fatalf("existing copy quantities_per_order = %d, want 1", flagged)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO work_orders(id, tenant_id, order_number, client_name, job_description, issued_by, status, issue_date, payload, created_at, updated_at)
		 VALUES ('wo2', 't1', 'RN-2026-00002', 'Klijent', 'Posao', 'admin', 'new', '2026-01-01', '{}', '2026-01-01', '2026-01-01')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO work_order_processes(work_order_id, tenant_id, template_name, graph, updated_at, updated_by, stock_tracked)
		 VALUES ('wo2', 't1', 'Offset', '{"nodes":[],"edges":[]}', '2026-01-01', 'admin', 1)`); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT quantities_per_order FROM work_order_processes WHERE work_order_id = 'wo2'`).Scan(&flagged); err != nil {
		t.Fatal(err)
	}
	if flagged != 0 {
		t.Fatalf("new copy quantities_per_order = %d, want 0", flagged)
	}
}

// runStepTimesContract: moving a step to in_progress / done through the store
// records when it actually started and finished (D-028).
func runStepTimesContract(t *testing.T, s Store, ctx context.Context, workOrderID string) {
	t.Helper()
	template, err := s.CreateProcessTemplate(ctx, domain.ProcessTemplateInput{Name: "Offset", Graph: processTestGraph()})
	if err != nil {
		t.Fatal(err)
	}
	process, err := s.ApplyProcessTemplate(ctx, workOrderID, template.ID, "ana")
	if err != nil {
		t.Fatal(err)
	}
	if step := process.Graph.Nodes[1]; step.StartedAt != "" || step.FinishedAt != "" {
		t.Fatalf("fresh copy carries step times: %+v", step)
	}
	set := func(status domain.ProcessStepStatus, graph domain.ProcessGraph) domain.ProcessGraph {
		graph = domain.CloneProcessGraph(graph)
		graph.Nodes[1].Status = status
		return graph
	}
	started, err := s.UpdateWorkOrderProcess(ctx, workOrderID, set(domain.ProcessStepInProgress, process.Graph), "bojan", false)
	if err != nil {
		t.Fatal(err)
	}
	if step := started.Graph.Nodes[1]; step.StartedAt == "" || step.FinishedAt != "" {
		t.Fatalf("after start = %+v", step)
	}
	done, err := s.UpdateWorkOrderProcess(ctx, workOrderID, set(domain.ProcessStepDone, started.Graph), "bojan", false)
	if err != nil {
		t.Fatal(err)
	}
	if step := done.Graph.Nodes[1]; step.StartedAt != started.Graph.Nodes[1].StartedAt || step.FinishedAt == "" || step.FinishedAt < step.StartedAt {
		t.Fatalf("after done = %+v", step)
	}
	stored, _ := s.WorkOrderProcess(ctx, workOrderID)
	if stored.Graph.Nodes[1] != done.Graph.Nodes[1] {
		t.Fatalf("stored step = %+v, want %+v", stored.Graph.Nodes[1], done.Graph.Nodes[1])
	}
	// An operator may correct the times (state, not structure).
	corrected := domain.CloneProcessGraph(done.Graph)
	corrected.Nodes[1].StartedAt = "2026-10-19T06:00:00Z"
	fixed, err := s.UpdateWorkOrderProcess(ctx, workOrderID, corrected, "bojan", false)
	if err != nil || fixed.Graph.Nodes[1].StartedAt != "2026-10-19T06:00:00Z" {
		t.Fatalf("corrected = %+v, %v", fixed, err)
	}
	// A finish before the start is a validation error.
	corrected.Nodes[1].FinishedAt = "2026-10-19T05:00:00Z"
	_, err = s.UpdateWorkOrderProcess(ctx, workOrderID, corrected, "bojan", false)
	requireValidation(t, err, domain.StepTimeOrderMessage)
	// Back to pending clears both.
	reset, err := s.UpdateWorkOrderProcess(ctx, workOrderID, set(domain.ProcessStepPending, fixed.Graph), "bojan", false)
	if err != nil || reset.Graph.Nodes[1].StartedAt != "" || reset.Graph.Nodes[1].FinishedAt != "" {
		t.Fatalf("after reset = %+v, %v", reset, err)
	}
}

func TestSQLiteStoreProcessStepTimes(t *testing.T) {
	ctx := testTenantContext()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	t.Cleanup(func() { _ = s.Close() })
	runStepTimesContract(t, s, ctx, newQuantityOrder(t, ctx, s, 1).ID)
}

func TestFixtureStoreProcessStepTimes(t *testing.T) {
	ctx := testTenantContext()
	s := NewFixtureStore(testutil.FixtureDir(t))
	runStepTimesContract(t, s, ctx, newQuantityOrder(t, ctx, s, 1).ID)
}
