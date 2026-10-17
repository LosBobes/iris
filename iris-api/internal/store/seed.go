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
	if err := seedDemoStock(ctx, sqliteStore); err != nil {
		return err
	}
	return seedDemoProcessTemplate(ctx, sqliteStore)
}

// Demo warehouse articles. The ids are stable so seed-demo can tell whether it
// already created them and the demo process template can link to them.
const (
	demoPaperID = "cat-demo-papir"
	demoInkID   = "cat-demo-boja"
	demoPlateID = "cat-demo-ploca"
	demoWasteID = "cat-demo-makulatura"
)

// seedDemoStock creates the demo tenant's consumable articles and posts their
// opening balance as a stock count. An article that already exists is left
// alone (including its stock), so re-running seed-demo is idempotent and never
// resets stock that was moved since.
func seedDemoStock(ctx context.Context, sqliteStore *SQLiteStore) error {
	price := func(value float64) *float64 { return &value }
	articles := []struct {
		item    domain.CatalogItem
		opening float64
	}{
		{domain.CatalogItem{ID: demoPaperID, Code: "PAP-80-A3", Name: "Papir 80g A3", Unit: "tabak", PurchasePrice: price(12.5)}, 5000},
		{domain.CatalogItem{ID: demoInkID, Code: "BOJ-CMYK", Name: "Boja CMYK", Unit: "kg", PurchasePrice: price(1800), MinStock: price(5)}, 40},
		{domain.CatalogItem{ID: demoPlateID, Code: "PLO-OFF", Name: "Offset ploča", Unit: "kom", PurchasePrice: price(650), MinStock: price(20)}, 120},
		{domain.CatalogItem{ID: demoWasteID, Code: "MAK-001", Name: "Makulatura", Unit: "tabak"}, 0},
	}
	counts := make([]domain.StockCountLine, 0, len(articles))
	for _, article := range articles {
		existing, err := sqliteStore.CatalogItemByID(ctx, article.item.ID)
		if err != nil {
			return err
		}
		if existing != nil {
			continue
		}
		item := article.item
		item.Kind = domain.CatalogItemKindArticle
		item.IsActive = true
		if _, err := sqliteStore.UpsertCatalogItem(ctx, item, ""); err != nil {
			return fmt.Errorf("seed article %s: %w", item.Code, err)
		}
		counts = append(counts, domain.StockCountLine{CatalogItemID: item.ID, CountedQuantity: article.opening})
	}
	if len(counts) == 0 {
		return nil
	}
	if _, err := sqliteStore.PostStockCount(ctx, domain.StockCountInput{Note: "Početno stanje (demo)", Lines: counts}, "admin"); err != nil {
		return fmt.Errorf("seed opening stock: %w", err)
	}
	return nil
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
	// Linked items carry the planned quantity per batch and the article's unit,
	// set explicitly because the demo tenant keeps its modules off by default and
	// saving a template then does not resolve article links.
	item := func(id string, kind domain.ProcessNodeKind, label string, x, y float64) domain.ProcessNode {
		return domain.ProcessNode{ID: id, Kind: kind, Label: label, X: x, Y: y}
	}
	linked := func(node domain.ProcessNode, articleID, unit string, quantity float64) domain.ProcessNode {
		node.CatalogItemID, node.Unit, node.Quantity = articleID, unit, &quantity
		return node
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
				linked(item("papir", domain.ProcessNodeInput, "Papir", 0, 0), demoPaperID, "tabak", 100),
				linked(item("boja", domain.ProcessNodeInput, "Boja", 0, 160), demoInkID, "kg", 2),
				linked(item("ploce", domain.ProcessNodeInput, "Ploče", 0, 320), demoPlateID, "kom", 4),
				// Finished prints are not a catalog article, so the product stays unlinked.
				item("otisci", domain.ProcessNodeProduct, "Gotovi otisci", 1200, 160),
				// Both scrap nodes return to the same Makulatura article.
				linked(item("makulatura", domain.ProcessNodeByproduct, "Makulatura", 480, 340), demoWasteID, "tabak", 3),
				linked(item("otpad", domain.ProcessNodeByproduct, "Otpad papira", 720, 340), demoWasteID, "tabak", 2),
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
