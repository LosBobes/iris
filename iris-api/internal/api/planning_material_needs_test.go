package api

import (
	"net/http"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

func TestMaterialNeedsEndpoint(t *testing.T) {
	f := newPlanningFixture(t) // today is Monday 2026-10-19
	ctx := store.ContextWithTenant(t.Context(), store.DemoTenantID)
	if _, err := f.sqlite.UpsertCatalogItem(ctx, domain.CatalogItem{
		ID: "cat-paper", Code: "P-1", Name: "Papir", Unit: "tabak", Kind: domain.CatalogItemKindArticle, IsActive: true,
	}, ""); err != nil {
		t.Fatal(err)
	}
	quantity := 12.5
	template, err := f.sqlite.CreateProcessTemplate(ctx, domain.ProcessTemplateInput{Name: "Štampa", Graph: domain.ProcessGraph{
		Nodes: []domain.ProcessNode{
			{ID: "paper", Kind: domain.ProcessNodeInput, Label: "Papir", CatalogItemID: "cat-paper", Quantity: &quantity},
			{ID: "glue", Kind: domain.ProcessNodeInput, Label: "Lepak", Unit: "kg", Quantity: &quantity},
			{ID: "print", Kind: domain.ProcessNodeStep, Label: "Štampa"},
		},
		Edges: []domain.ProcessEdge{{ID: "e1", Source: "paper", Target: "print"}, {ID: "e2", Source: "glue", Target: "print"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.sqlite.ApplyProcessTemplate(ctx, f.orderID, template.ID, "admin"); err != nil {
		t.Fatal(err)
	}

	// Defaults: from today over four weeks (no plan is published); operators
	// may read it. Nothing is planned, so both inputs are unplanned; nothing is
	// on hand, but without a planned week there is no shortage week either.
	needs := call[domain.MaterialNeeds](t, f, f.operator, http.MethodGet, "/planning/material-needs", "", http.StatusOK)
	if needs.From != "2026-10-19" || needs.To != "2026-11-15" || len(needs.Weeks) != 4 || len(needs.Items) != 2 {
		t.Fatalf("needs = %+v", needs)
	}
	glue, paper := needs.Items[0], needs.Items[1]
	if glue.Name != "Lepak" || glue.CatalogItemID != nil || glue.OnHand != nil || glue.Unplanned != 12.5 || len(glue.Weeks) != 4 {
		t.Fatalf("unlinked input = %+v", glue)
	}
	if paper.CatalogItemID == nil || *paper.CatalogItemID != "cat-paper" || paper.Unit != "tabak" || paper.OnHand == nil ||
		*paper.OnHand != 0 || *paper.Reserved != 12.5 || paper.Unplanned != 12.5 || paper.ShortFromWeek != nil {
		t.Fatalf("linked input = %+v", paper)
	}

	window := call[domain.MaterialNeeds](t, f, f.admin, http.MethodGet, "/planning/material-needs?from=2026-10-21&to=2026-10-27", "", http.StatusOK)
	if len(window.Weeks) != 2 || window.Weeks[0] != (domain.MaterialNeedsWeek{Start: "2026-10-21", End: "2026-10-25"}) {
		t.Fatalf("window weeks = %+v", window.Weeks)
	}
	expectError(t, f, f.admin, http.MethodGet, "/planning/material-needs?from=2026-13-01", "", http.StatusBadRequest, invalidDateMessage)
	expectError(t, f, f.admin, http.MethodGet, "/planning/material-needs?to=x", "", http.StatusBadRequest, invalidDateMessage)
	expectError(t, f, f.admin, http.MethodGet, "/planning/material-needs?from=2026-10-20&to=2026-10-19", "", http.StatusUnprocessableEntity, "Kraj perioda ne može biti pre početka.")
	expectError(t, f, f.admin, http.MethodGet, "/planning/material-needs?from=2026-10-19&to=2026-12-14", "", http.StatusUnprocessableEntity, "Period može obuhvatiti najviše 8 nedelja.")

	// Another organization sees nothing of it.
	if other := call[domain.MaterialNeeds](t, f, f.otherAdmin, http.MethodGet, "/planning/material-needs", "", http.StatusOK); len(other.Items) != 0 {
		t.Fatalf("other organization = %+v", other.Items)
	}
	if code, _ := f.do(t, "", http.MethodGet, "/planning/material-needs", ""); code != http.StatusUnauthorized {
		t.Fatalf("anonymous = %d", code)
	}
}

func TestMaterialNeedsNeedsPlanningAndStock(t *testing.T) {
	f := newModuleFixture(t, false)
	expectError(t, f, f.admin, http.MethodGet, "/planning/material-needs", "", http.StatusForbidden, planningDisabled)
	f.setModules(t, true, true)
	expectError(t, f, f.operator, http.MethodGet, "/planning/material-needs", "", http.StatusForbidden, planningDisabled)
	f.setPlanning(t, true)
	call[domain.MaterialNeeds](t, f, f.operator, http.MethodGet, "/planning/material-needs", "", http.StatusOK)
	// The route also requires "Magacin"; it cannot be off while planning is on
	// (planning needs "Procesi rada", which needs "Magacin"), so the stock
	// gate never answers on its own here.
}
