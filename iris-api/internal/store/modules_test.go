package store

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/testutil"
)

func processStatus(graph domain.ProcessGraph, status domain.ProcessStepStatus) domain.ProcessGraph {
	graph = domain.CloneProcessGraph(graph)
	for i := range graph.Nodes {
		if graph.Nodes[i].ID == "print" {
			graph.Nodes[i].Status = status
		}
	}
	return graph
}

// runModulesContract is the module behavior both stores share: defaults off,
// auto-attach gating, stock tracking (no retroactive posting, resume after an
// off/on cycle) and reservations of tracked processes only.
func runModulesContract(t *testing.T, s Store, ctx context.Context) {
	t.Helper()
	if modules, err := s.OrganizationModules(ctx); err != nil || modules != (domain.OrganizationModules{}) {
		t.Fatalf("default modules = %+v, %v", modules, err)
	}
	if settings, err := s.OrganizationSettings(ctx); err != nil || settings.Modules != (domain.OrganizationModules{}) {
		t.Fatalf("default settings modules = %+v, %v", settings.Modules, err)
	}

	upsertArticle(t, ctx, s, "paper", "Papir 80g", "tabak", domain.CatalogItemKindArticle, nil)
	upsertArticle(t, ctx, s, "ink", "Boja CMYK", "kg", domain.CatalogItemKindArticle, nil)
	upsertArticle(t, ctx, s, "waste", "Makulatura", "tabak", domain.CatalogItemKindArticle, nil)
	if _, err := s.PostStockCount(ctx, domain.StockCountInput{Lines: []domain.StockCountLine{
		{CatalogItemID: "paper", CountedQuantity: 100}, {CatalogItemID: "ink", CountedQuantity: 10},
	}}, "boss"); err != nil {
		t.Fatal(err)
	}
	// Links are inert with stock off, so even an unknown article is accepted.
	if _, err := s.CreateProcessTemplate(ctx, domain.ProcessTemplateInput{Name: "Nevalidan link", Graph: stockProcessGraph("nope", "ink", "waste")}); err != nil {
		t.Fatalf("template with unvalidated link while stock off: %v", err)
	}
	template, err := s.CreateProcessTemplate(ctx, domain.ProcessTemplateInput{Name: "Offset", IsDefault: true, Graph: stockProcessGraph("paper", "ink", "waste")})
	if err != nil {
		t.Fatal(err)
	}
	attached := func(orderID string) bool {
		t.Helper()
		process, err := s.WorkOrderProcess(ctx, orderID)
		if err != nil {
			t.Fatal(err)
		}
		return process != nil
	}

	// Everything off: no auto-attach. Stock only: still none (needs processes).
	orderA := newStockOrder(t, ctx, s)
	if attached(orderA.ID) {
		t.Fatal("process auto-attached with modules off")
	}
	setModules(t, s, DemoTenantSlug, false, true)
	if orderB := newStockOrder(t, ctx, s); attached(orderB.ID) {
		t.Fatal("process auto-attached with processes off")
	}

	// A process created while stock is off never posts, even after stock is on.
	setModules(t, s, DemoTenantSlug, false, false)
	untracked, err := s.ApplyProcessTemplate(ctx, orderA.ID, template.ID, "ana")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.UpdateWorkOrderProcess(ctx, orderA.ID, processStatus(untracked.Graph, domain.ProcessStepDone), "bojan", false); err != nil {
		t.Fatal(err)
	}
	enableModules(t, s, DemoTenantSlug)
	if _, err := s.UpdateWorkOrderProcess(ctx, orderA.ID, processStatus(untracked.Graph, domain.ProcessStepDone), "bojan", false); err != nil {
		t.Fatal(err)
	}
	if m, _ := s.StockMovements(ctx, StockMovementQuery{}); m.Total != 2 { // only the two opening counts
		t.Fatalf("untracked process posted: %+v", m)
	}

	// With both on, new orders get the process and it is stock tracked.
	orderC := newStockOrder(t, ctx, s)
	if !attached(orderC.ID) {
		t.Fatal("process not auto-attached with modules on")
	}
	orderD := newStockOrder(t, ctx, s)
	processC, _ := s.WorkOrderProcess(ctx, orderC.ID)
	if _, err := s.UpdateWorkOrderProcess(ctx, orderC.ID, processStatus(processC.Graph, domain.ProcessStepDone), "bojan", false); err != nil {
		t.Fatal(err)
	}
	if got := onHandOf(t, ctx, s, "paper"); got != 90 {
		t.Fatalf("tracked process paper on hand = %v", got)
	}
	// Reserved counts only tracked processes: D reserves 10, untracked A none.
	if paper := levelOf(t, ctx, s, "paper"); paper.Reserved != 10 {
		t.Fatalf("paper reserved = %+v (order D %s)", paper, orderD.ID)
	}

	// Off: undoing the step posts nothing. Back on: the next save posts the diff.
	setModules(t, s, DemoTenantSlug, false, false)
	if _, err := s.UpdateWorkOrderProcess(ctx, orderC.ID, processStatus(processC.Graph, domain.ProcessStepPending), "bojan", false); err != nil {
		t.Fatal(err)
	}
	if got := onHandOf(t, ctx, s, "paper"); got != 90 {
		t.Fatalf("posted while stock off: paper = %v", got)
	}
	enableModules(t, s, DemoTenantSlug)
	if _, err := s.UpdateWorkOrderProcess(ctx, orderC.ID, processStatus(processC.Graph, domain.ProcessStepPending), "bojan", false); err != nil {
		t.Fatal(err)
	}
	if got := onHandOf(t, ctx, s, "paper"); got != 100 {
		t.Fatalf("resume did not post the difference: paper = %v", got)
	}
}

func TestSQLiteStoreModules(t *testing.T) {
	ctx := testTenantContext()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	t.Cleanup(func() { _ = s.Close() })
	runModulesContract(t, s, ctx)
}

func TestFixtureStoreModules(t *testing.T) {
	runModulesContract(t, NewFixtureStore(testutil.FixtureDir(t)), testTenantContext())
}

func TestSQLiteStoreModulesDependencyAndAudit(t *testing.T) {
	ctx := testTenantContext()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	t.Cleanup(func() { _ = s.Close() })
	actor := AuditActor{AdminID: "p1", AdminUsername: "root"}

	_, err := s.PlatformSetTenantModules(ctx, actor, DemoTenantSlug, domain.OrganizationModules{Processes: true})
	requireValidation(t, err, ModulesDependencyMessage)
	on := true
	_, err = s.SetTenantModules(ctx, DemoTenantSlug, domain.OrganizationModulesUpdate{Processes: &on})
	requireValidation(t, err, ModulesDependencyMessage)
	if log, _ := s.PlatformAuditLog(ctx, 10, 0); log.Total != 0 {
		t.Fatalf("rejected switch wrote audit rows: %+v", log)
	}

	// Stored processes-without-stock reads as off.
	if err := writeModules(ctx, s.db, DemoTenantID, domain.OrganizationModules{Processes: true}); err != nil {
		t.Fatal(err)
	}
	if modules, _ := s.OrganizationModules(ctx); modules != (domain.OrganizationModules{}) {
		t.Fatalf("effective modules = %+v", modules)
	}

	// Switch + audit; repeating the same state writes no second row.
	want := domain.OrganizationModules{Processes: true, Stock: true}
	tenant, err := s.PlatformSetTenantModules(ctx, actor, DemoTenantSlug, want)
	if err != nil || tenant == nil || tenant.Modules != want {
		t.Fatalf("set modules = %+v, %v", tenant, err)
	}
	if _, err := s.PlatformSetTenantModules(ctx, actor, DemoTenantSlug, want); err != nil {
		t.Fatal(err)
	}
	log, _ := s.PlatformAuditLog(ctx, 10, 0)
	if log.Total != 1 || log.Items[0].Action != domain.AuditTenantModules ||
		log.Items[0].Detail["processes"] != "on" || log.Items[0].Detail["stock"] != "on" || log.Items[0].Detail["changed"] != "processes,stock" {
		t.Fatalf("audit = %+v", log)
	}
	if tenant, err := s.PlatformSetTenantModules(ctx, actor, "missing", want); err != nil || tenant != nil {
		t.Fatalf("unknown slug = %+v, %v", tenant, err)
	}
}
