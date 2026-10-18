package store

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/testutil"
)

func processTestGraph() domain.ProcessGraph {
	return domain.ProcessGraph{
		Nodes: []domain.ProcessNode{
			{ID: "in", Kind: domain.ProcessNodeInput, Label: "Papir"},
			{ID: "s1", Kind: domain.ProcessNodeStep, Label: "Štampa"},
			{ID: "out", Kind: domain.ProcessNodeProduct, Label: "Otisci"},
		},
		Edges: []domain.ProcessEdge{{ID: "e1", Source: "in", Target: "s1"}, {ID: "e2", Source: "s1", Target: "out"}},
	}
}

// runProcessStoreContract is the behavior the SQLite and fixture stores share.
func runProcessStoreContract(t *testing.T, s Store, ctx context.Context, workOrderID string) {
	t.Helper()
	input := domain.ProcessTemplateInput{Name: "  Offset ", Description: " d ", IsDefault: true, Graph: processTestGraph()}
	first, err := s.CreateProcessTemplate(ctx, input)
	if err != nil || first.Name != "Offset" || first.Description != "d" || !first.IsDefault {
		t.Fatalf("create = %+v, %v", first, err)
	}
	var validation *ValidationError
	if _, err := s.CreateProcessTemplate(ctx, input); !errors.As(err, &validation) {
		t.Fatalf("duplicate name error = %v, want ValidationError", err)
	}
	bad := input
	bad.Name = "Ciklus"
	bad.Graph = processTestGraph()
	bad.Graph.Edges = append(bad.Graph.Edges, domain.ProcessEdge{ID: "e3", Source: "out", Target: "s1"})
	if _, err := s.CreateProcessTemplate(ctx, bad); !errors.As(err, &validation) {
		t.Fatalf("cyclic graph error = %v, want ValidationError", err)
	}

	second, err := s.CreateProcessTemplate(ctx, domain.ProcessTemplateInput{Name: "Digitalna", IsDefault: true, Graph: processTestGraph()})
	if err != nil {
		t.Fatal(err)
	}
	list, err := s.ProcessTemplates(ctx)
	if err != nil || len(list) != 2 || list[0].ID != second.ID || !list[0].IsDefault || list[1].IsDefault {
		t.Fatalf("list = %+v, %v", list, err)
	}

	if got, err := s.WorkOrderProcess(ctx, workOrderID); err != nil || got != nil {
		t.Fatalf("process before apply = %+v, %v", got, err)
	}
	if _, err := s.ApplyProcessTemplate(ctx, "missing-order", first.ID, "ana"); !errors.Is(err, ErrWorkOrderNotFound) {
		t.Fatalf("apply to unknown order = %v", err)
	}
	if _, err := s.ApplyProcessTemplate(ctx, workOrderID, "missing", "ana"); !errors.Is(err, ErrProcessTemplateNotFound) {
		t.Fatalf("apply unknown template = %v", err)
	}
	process, err := s.ApplyProcessTemplate(ctx, workOrderID, first.ID, "ana")
	if err != nil || process.TemplateName != "Offset" || process.UpdatedBy != "ana" || process.Graph.Nodes[1].Status != domain.ProcessStepPending {
		t.Fatalf("apply = %+v, %v", process, err)
	}
	if _, err := s.ApplyProcessTemplate(ctx, workOrderID, first.ID, "ana"); !errors.Is(err, ErrProcessExists) {
		t.Fatalf("second apply = %v", err)
	}

	// Mutating the returned process must not alter the stored one.
	process.Graph.Nodes[1].Label = "Izmenjeno"
	stored, _ := s.WorkOrderProcess(ctx, workOrderID)
	if stored.Graph.Nodes[1].Label != "Štampa" {
		t.Fatal("stored process aliased the returned value")
	}

	state := stored.Graph
	state.Nodes[1].Status = domain.ProcessStepDone
	updated, err := s.UpdateWorkOrderProcess(ctx, workOrderID, state, "bojan", false)
	if err != nil || updated.Graph.Nodes[1].Status != domain.ProcessStepDone || updated.UpdatedBy != "bojan" {
		t.Fatalf("state update = %+v, %v", updated, err)
	}
	state.Nodes[1].Label = "Novo"
	if _, err := s.UpdateWorkOrderProcess(ctx, workOrderID, state, "bojan", false); !errors.Is(err, ErrProcessStructureLocked) {
		t.Fatalf("structural update = %v, want locked", err)
	}
	if updated, err = s.UpdateWorkOrderProcess(ctx, workOrderID, state, "ana", true); err != nil || updated.Graph.Nodes[1].Label != "Novo" {
		t.Fatalf("admin structural update = %+v, %v", updated, err)
	}
	if got, err := s.UpdateWorkOrderProcess(ctx, "missing-order", state, "ana", true); err != nil || got != nil {
		t.Fatalf("update without process = %+v, %v", got, err)
	}

	if err := s.DeleteProcessTemplate(ctx, first.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteProcessTemplate(ctx, first.ID); !errors.Is(err, ErrProcessTemplateNotFound) {
		t.Fatalf("delete again = %v", err)
	}
	kept, err := s.WorkOrderProcess(ctx, workOrderID)
	if err != nil || kept == nil || kept.TemplateID != nil || kept.TemplateName != "Offset" {
		t.Fatalf("process after template delete = %+v, %v", kept, err)
	}

	if err := s.DeleteWorkOrderProcess(ctx, workOrderID); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteWorkOrderProcess(ctx, workOrderID); !errors.Is(err, ErrProcessNotFound) {
		t.Fatalf("delete process again = %v", err)
	}
}

func TestSQLiteStoreProcessLifecycle(t *testing.T) {
	ctx := testTenantContext()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	t.Cleanup(func() { _ = s.Close() })
	order, err := s.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName: "Alfa", JobDescription: "Posao", IssuedBy: "admin", IssueDate: "2026-06-02",
		Assignment: domain.Assignment{Priority: "normal"},
	})
	if err != nil {
		t.Fatal(err)
	}
	runProcessStoreContract(t, s, ctx, order.ID)
}

func TestSQLiteStoreProcessIsTenantScoped(t *testing.T) {
	ctx := testTenantContext()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	t.Cleanup(func() { _ = s.Close() })
	if err := s.EnsureTenant(ctx, "tenant-other", "other", "Other"); err != nil {
		t.Fatal(err)
	}
	other := ContextWithTenant(context.Background(), "tenant-other")
	template, err := s.CreateProcessTemplate(ctx, domain.ProcessTemplateInput{Name: "Offset", IsDefault: true, Graph: processTestGraph()})
	if err != nil {
		t.Fatal(err)
	}
	// Default exclusivity is per tenant.
	if _, err := s.CreateProcessTemplate(other, domain.ProcessTemplateInput{Name: "Offset", IsDefault: true, Graph: processTestGraph()}); err != nil {
		t.Fatal(err)
	}
	if kept, _ := s.ProcessTemplateByID(ctx, template.ID); kept == nil || !kept.IsDefault {
		t.Fatalf("other tenant's default cleared this one: %+v", kept)
	}
	if got, err := s.ProcessTemplateByID(other, template.ID); err != nil || got != nil {
		t.Fatalf("cross-tenant read = %+v, %v", got, err)
	}
	if err := s.DeleteProcessTemplate(other, template.ID); !errors.Is(err, ErrProcessTemplateNotFound) {
		t.Fatalf("cross-tenant delete = %v", err)
	}
	if _, err := s.ProcessTemplates(context.Background()); !errors.Is(err, ErrNoTenant) {
		t.Fatalf("no tenant = %v, want ErrNoTenant", err)
	}
}

func TestSQLiteStoreCreateWorkOrderAttachesDefaultProcess(t *testing.T) {
	ctx := testTenantContext()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	t.Cleanup(func() { _ = s.Close() })
	enableModules(t, s, DemoTenantSlug)
	create := func() *domain.WorkOrder {
		order, err := s.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
			ClientName: "Alfa", JobDescription: "Posao", IssuedBy: "admin", IssueDate: "2026-06-02",
			Assignment: domain.Assignment{Priority: "normal"},
		})
		if err != nil {
			t.Fatal(err)
		}
		return order
	}
	if process, _ := s.WorkOrderProcess(ctx, create().ID); process != nil {
		t.Fatalf("process without default template: %+v", process)
	}
	template, err := s.CreateProcessTemplate(ctx, domain.ProcessTemplateInput{Name: "Offset", IsDefault: true, Graph: processTestGraph()})
	if err != nil {
		t.Fatal(err)
	}
	process, _ := s.WorkOrderProcess(ctx, create().ID)
	if process == nil || process.TemplateID == nil || *process.TemplateID != template.ID || process.UpdatedBy != "admin" {
		t.Fatalf("auto-attached process = %+v", process)
	}
}

func TestFixtureStoreProcessLifecycle(t *testing.T) {
	ctx := testTenantContext()
	s := NewFixtureStore(testutil.FixtureDir(t))
	order, err := s.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName: "Alfa", JobDescription: "Posao", IssuedBy: "admin", IssueDate: "2026-06-02",
		Assignment: domain.Assignment{Priority: "normal"},
	})
	if err != nil {
		t.Fatal(err)
	}
	runProcessStoreContract(t, s, ctx, order.ID)
}

func TestSeedDemoCreatesTemplatesOnce(t *testing.T) {
	ctx := context.Background()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	t.Cleanup(func() { _ = s.Close() })
	for i := 0; i < 2; i++ {
		if _, err := SeedDemoFromFixtures(ctx, s, testutil.FixtureDir(t)); err != nil {
			t.Fatalf("seed #%d: %v", i+1, err)
		}
	}
	// A re-seed must not duplicate the content templates.
	templates, err := s.ProcessTemplates(testTenantContext())
	if err != nil || len(templates) != 4 {
		t.Fatalf("templates = %+v, %v", templates, err)
	}
	defaults := 0
	for _, template := range templates {
		if template.IsDefault {
			defaults++
			if template.Name != "Offset štampa" {
				t.Fatalf("default template = %q", template.Name)
			}
		}
	}
	if defaults != 1 {
		t.Fatalf("default templates = %d", defaults)
	}
}
