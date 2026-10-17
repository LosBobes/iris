package store

import (
	"context"
	"fmt"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func SeedDemoFromFixtures(ctx context.Context, sqliteStore *SQLiteStore, fixtureDir string) error {
	// Demo data lives in its own tenant so it never mixes with real orgs. Ensure
	// the tenant exists and scope every write below to it.
	if err := sqliteStore.EnsureTenant(ctx, DemoTenantID, DemoTenantSlug, DemoTenantName); err != nil {
		return err
	}
	ctx = ContextWithTenant(ctx, DemoTenantID)

	fixtures := NewFixtureStore(fixtureDir)

	users, err := fixtures.Users(ctx)
	if err != nil {
		return err
	}
	for _, user := range users {
		if err := sqliteStore.CreateUser(ctx, user.ID, user.Username, user.Password, user.Role, true); err != nil {
			return fmt.Errorf("seed user %s: %w", user.Username, err)
		}
	}

	customers, err := fixtures.Customers(ctx, CustomerQuery{})
	if err != nil {
		return err
	}
	for _, customer := range customers.Items {
		if _, err := sqliteStore.UpsertCustomer(ctx, customer); err != nil {
			return fmt.Errorf("seed customer %s: %w", customer.ID, err)
		}
	}

	locations, err := fixtures.Locations(ctx, "")
	if err != nil {
		return err
	}
	for _, location := range locations {
		if _, err := sqliteStore.UpsertLocation(ctx, location); err != nil {
			return fmt.Errorf("seed location %s: %w", location.ID, err)
		}
	}

	workOrders, err := fixtures.WorkOrders(ctx, WorkOrderListQuery{})
	if err != nil {
		return err
	}
	for _, workOrder := range workOrders.Items {
		if err := sqliteStore.PutWorkOrder(ctx, workOrder); err != nil {
			return fmt.Errorf("seed work order %s: %w", workOrder.ID, err)
		}
	}
	return seedDemoProcessTemplate(ctx, sqliteStore)
}

// seedDemoProcessTemplate adds the demo tenant's default "Offset štampa"
// process unless a template with that name already exists, so re-running
// seed-demo stays idempotent.
func seedDemoProcessTemplate(ctx context.Context, sqliteStore *SQLiteStore) error {
	const name = "Offset štampa"
	existing, err := sqliteStore.ProcessTemplates(ctx)
	if err != nil {
		return err
	}
	for _, template := range existing {
		if template.Name == name {
			return nil
		}
	}
	step := func(id, label string, x float64) domain.ProcessNode {
		return domain.ProcessNode{ID: id, Kind: domain.ProcessNodeStep, Label: label, X: x, Y: 160}
	}
	item := func(id string, kind domain.ProcessNodeKind, label string, x, y float64) domain.ProcessNode {
		return domain.ProcessNode{ID: id, Kind: kind, Label: label, X: x, Y: y}
	}
	edge := func(source, target string) domain.ProcessEdge {
		return domain.ProcessEdge{ID: source + "-" + target, Source: source, Target: target}
	}
	_, err = sqliteStore.CreateProcessTemplate(ctx, domain.ProcessTemplateInput{
		Name:        name,
		Description: "Standardni tok offset štampe od pripreme do pakovanja.",
		IsDefault:   true,
		Graph: domain.ProcessGraph{
			Nodes: []domain.ProcessNode{
				step("priprema", "Priprema", 240),
				step("stampa", "Štampa", 480),
				step("secenje", "Sečenje", 720),
				step("pakovanje", "Pakovanje", 960),
				item("papir", domain.ProcessNodeInput, "Papir", 0, 0),
				item("boja", domain.ProcessNodeInput, "Boja", 0, 160),
				item("ploce", domain.ProcessNodeInput, "Ploče", 0, 320),
				item("otisci", domain.ProcessNodeProduct, "Gotovi otisci", 1200, 160),
				item("makulatura", domain.ProcessNodeByproduct, "Makulatura", 480, 340),
				item("otpad", domain.ProcessNodeByproduct, "Otpad papira", 720, 340),
			},
			Edges: []domain.ProcessEdge{
				edge("priprema", "stampa"), edge("stampa", "secenje"), edge("secenje", "pakovanje"),
				edge("papir", "stampa"), edge("boja", "stampa"), edge("ploce", "priprema"),
				edge("pakovanje", "otisci"), edge("stampa", "makulatura"), edge("secenje", "otpad"),
			},
		},
	})
	if err != nil {
		return fmt.Errorf("seed process template: %w", err)
	}
	return nil
}
