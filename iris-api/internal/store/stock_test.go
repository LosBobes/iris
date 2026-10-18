package store

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"path/filepath"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/testutil"
)

func near(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

func requireValidation(t *testing.T, err error, message string) {
	t.Helper()
	var validation *ValidationError
	if !errors.As(err, &validation) || validation.Error() != message {
		t.Fatalf("error = %v, want validation %q", err, message)
	}
}

func stockQty(v float64) *float64 { return &v }

func upsertArticle(t *testing.T, ctx context.Context, s Store, id, name, unit string, kind domain.CatalogItemKind, min *float64) {
	t.Helper()
	if _, err := s.UpsertCatalogItem(ctx, domain.CatalogItem{
		ID: id, Code: "C-" + id, Name: name, Unit: unit, Kind: kind, IsActive: true, MinStock: min,
	}, ""); err != nil {
		t.Fatalf("upsert %s: %v", id, err)
	}
}

func onHandOf(t *testing.T, ctx context.Context, s Store, id string) float64 {
	t.Helper()
	item, err := s.CatalogItemByID(ctx, id)
	if err != nil || item == nil || item.StockOnHand == nil {
		t.Fatalf("catalog item %s = %+v, %v", id, item, err)
	}
	return *item.StockOnHand
}

func levelOf(t *testing.T, ctx context.Context, s Store, id string) domain.StockLevel {
	t.Helper()
	levels, err := s.StockLevels(ctx, StockLevelQuery{})
	if err != nil {
		t.Fatal(err)
	}
	for _, level := range levels.Items {
		if level.CatalogItemID == id {
			return level
		}
	}
	t.Fatalf("no stock level for %s in %+v", id, levels)
	return domain.StockLevel{}
}

func stockProcessGraph(paperID, inkID, wasteID string) domain.ProcessGraph {
	return domain.ProcessGraph{
		Nodes: []domain.ProcessNode{
			{ID: "paper", Kind: domain.ProcessNodeInput, Label: "Papir", Quantity: stockQty(10), CatalogItemID: paperID},
			{ID: "ink", Kind: domain.ProcessNodeInput, Label: "Boja", Quantity: stockQty(2), CatalogItemID: inkID, Unit: "KG"},
			{ID: "print", Kind: domain.ProcessNodeStep, Label: "Štampa"},
			{ID: "waste", Kind: domain.ProcessNodeByproduct, Label: "Makulatura", Quantity: stockQty(1), CatalogItemID: wasteID},
			{ID: "out", Kind: domain.ProcessNodeProduct, Label: "Otisci", Quantity: stockQty(500)},
		},
		Edges: []domain.ProcessEdge{
			{ID: "e1", Source: "paper", Target: "print"}, {ID: "e2", Source: "ink", Target: "print"},
			{ID: "e3", Source: "print", Target: "waste"}, {ID: "e4", Source: "print", Target: "out"},
		},
	}
}

// runStockContract is the behavior the SQLite and fixture stores share.
func runStockContract(t *testing.T, s Store, ctx context.Context) {
	t.Helper()
	upsertArticle(t, ctx, s, "paper", "Papir 80g", "tabak", domain.CatalogItemKindArticle, nil)
	upsertArticle(t, ctx, s, "ink", "Boja CMYK", "kg", domain.CatalogItemKindArticle, stockQty(5))
	upsertArticle(t, ctx, s, "waste", "Makulatura", "tabak", domain.CatalogItemKindArticle, nil)
	upsertArticle(t, ctx, s, "svc", "Štampa usluga", "kom", domain.CatalogItemKindService, stockQty(3))

	// Services carry no stock and no minimum; articles start at zero.
	if svc, _ := s.CatalogItemByID(ctx, "svc"); svc.StockOnHand != nil || svc.MinStock != nil {
		t.Fatalf("service stock fields = %+v", svc)
	}
	if got := onHandOf(t, ctx, s, "paper"); got != 0 {
		t.Fatalf("new article on hand = %v", got)
	}
	if ink, _ := s.CatalogItemByID(ctx, "ink"); ink.MinStock == nil || *ink.MinStock != 5 {
		t.Fatalf("minStock = %+v", ink.MinStock)
	}
	if _, err := s.UpsertCatalogItem(ctx, domain.CatalogItem{ID: "paper", Code: "C-paper", Name: "Papir 80g", Unit: "tabak", Kind: domain.CatalogItemKindArticle, IsActive: true, MinStock: stockQty(-1)}, ""); err == nil {
		t.Fatal("negative minStock accepted")
	}

	// Receipt validation.
	line := func(id string, q float64) domain.StockReceiptLine {
		return domain.StockReceiptLine{CatalogItemID: id, Quantity: q}
	}
	_, err := s.PostStockReceipt(ctx, domain.StockReceiptInput{}, "ana")
	requireValidation(t, err, "Prijem mora imati između 1 i 200 stavki.")
	_, err = s.PostStockReceipt(ctx, domain.StockReceiptInput{Lines: []domain.StockReceiptLine{line("svc", 1)}}, "ana")
	requireValidation(t, err, domain.StockArticleNotFoundMessage)
	_, err = s.PostStockReceipt(ctx, domain.StockReceiptInput{Lines: []domain.StockReceiptLine{line("nope", 1)}}, "ana")
	requireValidation(t, err, domain.StockArticleNotFoundMessage)
	_, err = s.PostStockReceipt(ctx, domain.StockReceiptInput{Lines: []domain.StockReceiptLine{line("paper", 0)}}, "ana")
	requireValidation(t, err, domain.StockQuantityPositiveMessage)
	_, err = s.PostStockReceipt(ctx, domain.StockReceiptInput{Lines: []domain.StockReceiptLine{line("paper", 1), line("paper", 2)}}, "ana")
	requireValidation(t, err, domain.StockDuplicateArticleMessage)
	// A bad line later in the request must not post the earlier ones.
	_, err = s.PostStockReceipt(ctx, domain.StockReceiptInput{Lines: []domain.StockReceiptLine{line("paper", 5), line("svc", 1)}}, "ana")
	requireValidation(t, err, domain.StockArticleNotFoundMessage)
	if got := onHandOf(t, ctx, s, "paper"); got != 0 {
		t.Fatalf("failed receipt posted stock: %v", got)
	}

	result, err := s.PostStockReceipt(ctx, domain.StockReceiptInput{
		DocumentRef: " OTP-7 ", Note: "dostava",
		Lines: []domain.StockReceiptLine{line("paper", 100), line("ink", 3)},
	}, "ana")
	if err != nil || len(result.Movements) != 2 {
		t.Fatalf("receipt = %+v, %v", result, err)
	}
	first := result.Movements[0]
	if first.Kind != domain.StockMovementReceipt || first.Quantity != 100 || first.ItemName != "Papir 80g" || first.Unit != "tabak" ||
		first.CreatedBy != "ana" || first.DocumentRef == nil || *first.DocumentRef != "OTP-7" || first.WorkOrderID != nil {
		t.Fatalf("receipt movement = %+v", first)
	}
	if onHandOf(t, ctx, s, "paper") != 100 || onHandOf(t, ctx, s, "ink") != 3 {
		t.Fatal("on hand after receipt")
	}

	// Count: ink has movements, so its delta is an adjustment; waste has none, so opening.
	count := func(lines ...domain.StockCountLine) domain.StockPostingResult {
		t.Helper()
		res, err := s.PostStockCount(ctx, domain.StockCountInput{Note: "popis", Lines: lines}, "boss")
		if err != nil {
			t.Fatal(err)
		}
		return res
	}
	cl := func(id string, q float64) domain.StockCountLine {
		return domain.StockCountLine{CatalogItemID: id, CountedQuantity: q}
	}
	res := count(cl("paper", 90), cl("waste", 40), cl("ink", 3))
	if len(res.Movements) != 2 {
		t.Fatalf("count movements = %+v (equal balance must post nothing)", res.Movements)
	}
	if m := res.Movements[0]; m.CatalogItemID != "paper" || m.Kind != domain.StockMovementAdjustment || m.Quantity != -10 {
		t.Fatalf("adjustment = %+v", m)
	}
	if m := res.Movements[1]; m.CatalogItemID != "waste" || m.Kind != domain.StockMovementOpening || m.Quantity != 40 {
		t.Fatalf("opening = %+v", m)
	}
	if len(count(cl("paper", 90), cl("waste", 40)).Movements) != 0 {
		t.Fatal("repeating a count posted movements")
	}
	_, err = s.PostStockCount(ctx, domain.StockCountInput{Lines: []domain.StockCountLine{cl("svc", 1)}}, "boss")
	requireValidation(t, err, domain.StockArticleNotFoundMessage)
	_, err = s.PostStockCount(ctx, domain.StockCountInput{Lines: []domain.StockCountLine{cl("paper", -1)}}, "boss")
	requireValidation(t, err, domain.StockCountNegativeMessage)
	_, err = s.PostStockCount(ctx, domain.StockCountInput{Lines: []domain.StockCountLine{cl("paper", 1), cl("paper", 2)}}, "boss")
	requireValidation(t, err, domain.StockDuplicateArticleMessage)
	_, err = s.PostStockCount(ctx, domain.StockCountInput{}, "boss")
	requireValidation(t, err, "Popis mora imati između 1 i 1000 stavki.")

	// Levels: ink 3 < min 5 is low; paper has no minimum; services never listed.
	levels, err := s.StockLevels(ctx, StockLevelQuery{})
	if err != nil || levels.Total != 3 {
		t.Fatalf("levels = %+v, %v", levels, err)
	}
	if ink := levelOf(t, ctx, s, "ink"); !ink.Low || ink.OnHand != 3 || ink.Available != 3 || ink.MinStock == nil || ink.LastMovementAt == nil {
		t.Fatalf("ink level = %+v", ink)
	}
	if paper := levelOf(t, ctx, s, "paper"); paper.Low || paper.OnHand != 90 {
		t.Fatalf("paper level = %+v", paper)
	}
	if low, _ := s.StockLevels(ctx, StockLevelQuery{LowOnly: true}); low.Total != 1 || low.Items[0].CatalogItemID != "ink" {
		t.Fatalf("lowOnly = %+v", low)
	}
	if found, _ := s.StockLevels(ctx, StockLevelQuery{Search: "MAKULATURA"}); found.Total != 1 {
		t.Fatalf("search = %+v", found)
	}
	if page, _ := s.StockLevels(ctx, StockLevelQuery{Limit: 1, Offset: 1}); len(page.Items) != 1 || page.Total != 3 {
		t.Fatalf("page = %+v", page)
	}

	// Inactive articles are listed only while they hold stock.
	upsertArticle(t, ctx, s, "old", "Stari papir", "tabak", domain.CatalogItemKindArticle, nil)
	if _, err := s.UpsertCatalogItem(ctx, domain.CatalogItem{ID: "old", Code: "C-old", Name: "Stari papir", Unit: "tabak", Kind: domain.CatalogItemKindArticle, IsActive: false}, ""); err != nil {
		t.Fatal(err)
	}
	if all, _ := s.StockLevels(ctx, StockLevelQuery{}); all.Total != 3 {
		t.Fatalf("empty inactive article listed: %+v", all)
	}
	count(cl("old", 2))
	if all, _ := s.StockLevels(ctx, StockLevelQuery{}); all.Total != 4 || all.Items[3].CatalogItemID != "old" {
		t.Fatalf("inactive article with stock = %+v (active first, then name)", all)
	}

	// Movement ledger: newest first, filterable.
	all, err := s.StockMovements(ctx, StockMovementQuery{})
	if err != nil || all.Total != 5 || all.Items[0].CatalogItemID != "old" {
		t.Fatalf("movements = %+v, %v", all, err)
	}
	if byItem, _ := s.StockMovements(ctx, StockMovementQuery{CatalogItemID: "paper"}); byItem.Total != 2 || byItem.Items[0].Kind != domain.StockMovementAdjustment {
		t.Fatalf("by item = %+v", byItem)
	}
	if page, _ := s.StockMovements(ctx, StockMovementQuery{Limit: 2, Offset: 1}); len(page.Items) != 2 || page.Total != 5 {
		t.Fatalf("movement page = %+v", page)
	}
}

// runStockProcessContract covers link validation and automatic posting.
func runStockProcessContract(t *testing.T, s Store, ctx context.Context, orderID, orderNumber string) {
	t.Helper()
	upsertArticle(t, ctx, s, "paper", "Papir 80g", "tabak", domain.CatalogItemKindArticle, nil)
	upsertArticle(t, ctx, s, "ink", "Boja CMYK", "kg", domain.CatalogItemKindArticle, nil)
	upsertArticle(t, ctx, s, "ink2", "Boja Pantone", "kg", domain.CatalogItemKindArticle, nil)
	upsertArticle(t, ctx, s, "waste", "Makulatura", "tabak", domain.CatalogItemKindArticle, nil)
	upsertArticle(t, ctx, s, "svc", "Usluga", "kom", domain.CatalogItemKindService, nil)
	if _, err := s.PostStockCount(ctx, domain.StockCountInput{Lines: []domain.StockCountLine{
		{CatalogItemID: "paper", CountedQuantity: 100}, {CatalogItemID: "ink", CountedQuantity: 10}, {CatalogItemID: "ink2", CountedQuantity: 10},
	}}, "boss"); err != nil {
		t.Fatal(err)
	}

	// Link validation on templates.
	bad := stockProcessGraph("svc", "ink", "waste")
	_, err := s.CreateProcessTemplate(ctx, domain.ProcessTemplateInput{Name: "Servis", Graph: bad})
	requireValidation(t, err, domain.StockArticleNotFoundMessage)
	bad = stockProcessGraph("nope", "ink", "waste")
	_, err = s.CreateProcessTemplate(ctx, domain.ProcessTemplateInput{Name: "Nepoznat", Graph: bad})
	requireValidation(t, err, domain.StockArticleNotFoundMessage)
	bad = stockProcessGraph("paper", "ink", "waste")
	bad.Nodes[0].Unit = "kg"
	_, err = s.CreateProcessTemplate(ctx, domain.ProcessTemplateInput{Name: "Jedinica", Graph: bad})
	requireValidation(t, err, "Jedinica mora odgovarati jedinici artikla „Papir 80g“.")

	template, err := s.CreateProcessTemplate(ctx, domain.ProcessTemplateInput{Name: "Offset", Graph: stockProcessGraph("paper", "ink", "waste")})
	if err != nil {
		t.Fatal(err)
	}
	if template.Graph.Nodes[0].Unit != "tabak" || template.Graph.Nodes[1].Unit != "KG" {
		t.Fatalf("units = %q, %q (empty filled from article, matching kept as typed)", template.Graph.Nodes[0].Unit, template.Graph.Nodes[1].Unit)
	}
	if _, err := s.UpdateProcessTemplate(ctx, template.ID, domain.ProcessTemplateInput{Name: "Offset", Graph: stockProcessGraph("svc", "ink", "waste")}); err == nil {
		t.Fatal("template update linked a service")
	}

	process, err := s.ApplyProcessTemplate(ctx, orderID, template.ID, "ana")
	if err != nil {
		t.Fatal(err)
	}
	if m, _ := s.StockMovements(ctx, StockMovementQuery{WorkOrderID: orderID}); m.Total != 0 {
		t.Fatalf("apply posted %d movements", m.Total)
	}
	// Open order reserves its planned inputs.
	if paper := levelOf(t, ctx, s, "paper"); paper.Reserved != 10 || paper.Available != 90 || paper.OnHand != 100 {
		t.Fatalf("paper reserved = %+v", paper)
	}
	if ink := levelOf(t, ctx, s, "ink"); ink.Reserved != 2 {
		t.Fatalf("ink reserved = %+v", ink)
	}

	setStatus := func(graph domain.ProcessGraph, status domain.ProcessStepStatus) domain.ProcessGraph {
		graph = domain.CloneProcessGraph(graph)
		for i := range graph.Nodes {
			if graph.Nodes[i].ID == "print" {
				graph.Nodes[i].Status = status
			}
		}
		return graph
	}
	put := func(graph domain.ProcessGraph, admin bool) *domain.WorkOrderProcess {
		t.Helper()
		updated, err := s.UpdateWorkOrderProcess(ctx, orderID, graph, "bojan", admin)
		if err != nil || updated == nil {
			t.Fatalf("update process = %+v, %v", updated, err)
		}
		return updated
	}

	// Done: inputs consumed, byproduct produced; the unlinked product posts nothing.
	done := put(setStatus(process.Graph, domain.ProcessStepDone), false)
	if onHandOf(t, ctx, s, "paper") != 90 || onHandOf(t, ctx, s, "ink") != 8 || onHandOf(t, ctx, s, "waste") != 1 {
		t.Fatalf("after done: paper %v ink %v waste %v", onHandOf(t, ctx, s, "paper"), onHandOf(t, ctx, s, "ink"), onHandOf(t, ctx, s, "waste"))
	}
	movements, _ := s.StockMovements(ctx, StockMovementQuery{WorkOrderID: orderID})
	if movements.Total != 3 {
		t.Fatalf("movements = %+v", movements)
	}
	for _, m := range movements.Items {
		wantKind := domain.StockMovementConsumption
		if m.CatalogItemID == "waste" {
			wantKind = domain.StockMovementProduction
		}
		if m.Kind != wantKind || m.CreatedBy != "bojan" || m.ProcessNodeID == nil || m.WorkOrderNumber == nil || *m.WorkOrderNumber != orderNumber {
			t.Fatalf("process movement = %+v", m)
		}
	}
	// Consumed inputs no longer reserve.
	if paper := levelOf(t, ctx, s, "paper"); paper.Reserved != 0 || paper.Available != 90 {
		t.Fatalf("paper after done = %+v", paper)
	}

	// Idempotent: the same state again posts nothing.
	put(done.Graph, false)
	if m, _ := s.StockMovements(ctx, StockMovementQuery{WorkOrderID: orderID}); m.Total != 3 {
		t.Fatalf("repeat posted %d movements", m.Total)
	}

	// Actual quantity change posts only the delta (used 8, planned 10: +2 back).
	adjusted := domain.CloneProcessGraph(done.Graph)
	adjusted.Nodes[0].ActualQuantity = stockQty(8)
	put(adjusted, false)
	if onHandOf(t, ctx, s, "paper") != 92 {
		t.Fatalf("paper after actual qty = %v", onHandOf(t, ctx, s, "paper"))
	}
	if m, _ := s.StockMovements(ctx, StockMovementQuery{WorkOrderID: orderID}); m.Total != 4 {
		t.Fatalf("delta not a single movement: %d", m.Total)
	}

	// Un-doing the step reverses everything.
	put(setStatus(adjusted, domain.ProcessStepPending), false)
	if onHandOf(t, ctx, s, "paper") != 100 || onHandOf(t, ctx, s, "ink") != 10 || onHandOf(t, ctx, s, "waste") != 0 {
		t.Fatalf("after undo: paper %v ink %v waste %v", onHandOf(t, ctx, s, "paper"), onHandOf(t, ctx, s, "ink"), onHandOf(t, ctx, s, "waste"))
	}

	// Relinking an already-posted node moves the posting to the new article (admin).
	put(setStatus(adjusted, domain.ProcessStepDone), false)
	relinked := domain.CloneProcessGraph(adjusted)
	relinked = setStatus(relinked, domain.ProcessStepDone)
	relinked.Nodes[1].CatalogItemID, relinked.Nodes[1].Unit = "ink2", ""
	if _, err := s.UpdateWorkOrderProcess(ctx, orderID, relinked, "bojan", false); !errors.Is(err, ErrProcessStructureLocked) {
		t.Fatalf("operator relink = %v", err)
	}
	updated := put(relinked, true)
	if updated.Graph.Nodes[1].Unit != "kg" {
		t.Fatalf("relinked unit = %q", updated.Graph.Nodes[1].Unit)
	}
	if onHandOf(t, ctx, s, "ink") != 10 || onHandOf(t, ctx, s, "ink2") != 8 {
		t.Fatalf("after relink: ink %v ink2 %v", onHandOf(t, ctx, s, "ink"), onHandOf(t, ctx, s, "ink2"))
	}
	// Invalid link in a graph update is a 422 and posts nothing.
	invalid := domain.CloneProcessGraph(relinked)
	invalid.Nodes[1].CatalogItemID = "svc"
	if _, err := s.UpdateWorkOrderProcess(ctx, orderID, invalid, "bojan", true); err == nil {
		t.Fatal("service link accepted on work order process")
	} else {
		requireValidation(t, err, domain.StockArticleNotFoundMessage)
	}
	invalid = domain.CloneProcessGraph(relinked)
	invalid.Nodes[0].Unit = "kg"
	_, err = s.UpdateWorkOrderProcess(ctx, orderID, invalid, "bojan", true)
	requireValidation(t, err, "Jedinica mora odgovarati jedinici artikla „Papir 80g“.")

	// Completed orders release their reservations.
	put(setStatus(updated.Graph, domain.ProcessStepPending), true)
	if ink2 := levelOf(t, ctx, s, "ink2"); ink2.Reserved != 2 {
		t.Fatalf("ink2 reserved = %+v", ink2)
	}
	if _, err := s.UpdateWorkOrder(ctx, orderID, domain.UpdateWorkOrderInput{"status": json.RawMessage(`"cancelled"`)}); err != nil {
		t.Fatalf("cancel order: %v", err)
	}
	if ink2 := levelOf(t, ctx, s, "ink2"); ink2.Reserved != 0 {
		t.Fatalf("cancelled order still reserves: %+v", ink2)
	}

	// Articles with movements cannot be deleted; unused ones can.
	if err := s.DeleteCatalogItem(ctx, "paper"); !errors.Is(err, ErrCatalogItemHasMovements) {
		t.Fatalf("delete article with movements = %v", err)
	}
	if item, _ := s.CatalogItemByID(ctx, "paper"); item == nil {
		t.Fatal("article vanished")
	}
	upsertArticle(t, ctx, s, "unused", "Neiskorišćen", "kom", domain.CatalogItemKindArticle, nil)
	if err := s.DeleteCatalogItem(ctx, "unused"); err != nil {
		t.Fatalf("delete unused article: %v", err)
	}

	// Deleting the order keeps its movements, detached.
	before, _ := s.StockMovements(ctx, StockMovementQuery{CatalogItemID: "paper"})
	if res, err := s.DeleteWorkOrder(ctx, orderID); err != nil || !res.Success {
		t.Fatalf("delete order = %+v, %v", res, err)
	}
	after, _ := s.StockMovements(ctx, StockMovementQuery{CatalogItemID: "paper"})
	if after.Total != before.Total {
		t.Fatalf("order delete changed ledger: %d -> %d", before.Total, after.Total)
	}
	for _, m := range after.Items {
		if m.WorkOrderID != nil || m.WorkOrderNumber != nil {
			t.Fatalf("movement still points at deleted order: %+v", m)
		}
	}
	if onHandOf(t, ctx, s, "paper") != 100 {
		t.Fatalf("paper on hand = %v", onHandOf(t, ctx, s, "paper"))
	}
}

// enableModules switches both modules on for the test shop (or the named
// organization of a SQLite store); the process/stock rules are inert without it.
func enableModules(t *testing.T, s Store, slug string) {
	t.Helper()
	setModules(t, s, slug, true, true)
}

func setModules(t *testing.T, s Store, slug string, processes, stock bool) {
	t.Helper()
	switch typed := s.(type) {
	case *SQLiteStore:
		if _, err := typed.SetTenantModules(context.Background(), slug, domain.OrganizationModulesUpdate{Processes: &processes, Stock: &stock}); err != nil {
			t.Fatal(err)
		}
	case *FixtureStore:
		typed.SetOrganizationModules(domain.OrganizationModules{Processes: processes, Stock: stock})
	default:
		t.Fatalf("unsupported store %T", s)
	}
}

func newStockOrder(t *testing.T, ctx context.Context, s Store) *domain.WorkOrder {
	t.Helper()
	order, err := s.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName: "Alfa", JobDescription: "Posao", IssuedBy: "admin", IssueDate: "2026-06-02",
		Assignment: domain.Assignment{Priority: "normal"},
	})
	if err != nil {
		t.Fatal(err)
	}
	return order
}

func TestSQLiteStoreStock(t *testing.T) {
	ctx := testTenantContext()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	t.Cleanup(func() { _ = s.Close() })
	runStockContract(t, s, ctx)
}

func TestFixtureStoreStock(t *testing.T) {
	runStockContract(t, NewFixtureStore(testutil.FixtureDir(t)), testTenantContext())
}

func TestSQLiteStoreStockProcessPosting(t *testing.T) {
	ctx := testTenantContext()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	t.Cleanup(func() { _ = s.Close() })
	enableModules(t, s, DemoTenantSlug)
	order := newStockOrder(t, ctx, s)
	runStockProcessContract(t, s, ctx, order.ID, order.OrderNumber)
}

func TestFixtureStoreStockProcessPosting(t *testing.T) {
	ctx := testTenantContext()
	s := NewFixtureStore(testutil.FixtureDir(t))
	enableModules(t, s, DemoTenantSlug)
	order := newStockOrder(t, ctx, s)
	runStockProcessContract(t, s, ctx, order.ID, order.OrderNumber)
}

func TestSQLiteStoreStockIsTenantScoped(t *testing.T) {
	ctx := testTenantContext()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	t.Cleanup(func() { _ = s.Close() })
	if err := s.EnsureTenant(ctx, "tenant-other", "other", "Other"); err != nil {
		t.Fatal(err)
	}
	other := ContextWithTenant(context.Background(), "tenant-other")
	enableModules(t, s, DemoTenantSlug)
	enableModules(t, s, "other")
	upsertArticle(t, ctx, s, "paper", "Papir", "tabak", domain.CatalogItemKindArticle, nil)
	if _, err := s.PostStockReceipt(ctx, domain.StockReceiptInput{Lines: []domain.StockReceiptLine{{CatalogItemID: "paper", Quantity: 5}}}, "ana"); err != nil {
		t.Fatal(err)
	}

	// The other tenant sees nothing and cannot post against this tenant's article.
	if levels, err := s.StockLevels(other, StockLevelQuery{}); err != nil || levels.Total != 0 {
		t.Fatalf("other levels = %+v, %v", levels, err)
	}
	if moves, err := s.StockMovements(other, StockMovementQuery{CatalogItemID: "paper"}); err != nil || moves.Total != 0 {
		t.Fatalf("other movements = %+v, %v", moves, err)
	}
	_, err := s.PostStockReceipt(other, domain.StockReceiptInput{Lines: []domain.StockReceiptLine{{CatalogItemID: "paper", Quantity: 1}}}, "eve")
	requireValidation(t, err, domain.StockArticleNotFoundMessage)
	_, err = s.PostStockCount(other, domain.StockCountInput{Lines: []domain.StockCountLine{{CatalogItemID: "paper", CountedQuantity: 1}}}, "eve")
	requireValidation(t, err, domain.StockArticleNotFoundMessage)
	if err := s.DeleteCatalogItem(other, "paper"); err != nil {
		t.Fatal(err) // scoped delete is a no-op for a foreign id
	}
	if got := onHandOf(t, ctx, s, "paper"); got != 5 {
		t.Fatalf("on hand = %v", got)
	}

	// Same-tenant graph links to a foreign article are rejected.
	graph := stockProcessGraph("paper", "paper", "paper")
	_, err = s.CreateProcessTemplate(other, domain.ProcessTemplateInput{Name: "X", Graph: graph})
	requireValidation(t, err, domain.StockArticleNotFoundMessage)

	// Reservations never cross tenants.
	if _, err := s.CreateProcessTemplate(ctx, domain.ProcessTemplateInput{Name: "Offset", IsDefault: true, Graph: stockProcessGraph("paper", "paper", "paper")}); err == nil {
		// same article used for ink with unit KG vs tabak must fail
		t.Fatal("unit mismatch not detected")
	}
	if _, err := s.StockLevels(context.Background(), StockLevelQuery{}); !errors.Is(err, ErrNoTenant) {
		t.Fatalf("no tenant = %v", err)
	}
	if _, err := s.PostStockReceipt(context.Background(), domain.StockReceiptInput{}, "x"); !errors.Is(err, ErrNoTenant) {
		t.Fatalf("no tenant receipt = %v", err)
	}
}

// Cleanup must skip articles that have movements, in preview and delete alike.
func runStockCleanupContract(t *testing.T, s Store, ctx context.Context) {
	t.Helper()
	upsertArticle(t, ctx, s, "moved", "S prometom", "kom", domain.CatalogItemKindArticle, nil)
	upsertArticle(t, ctx, s, "idle", "Bez prometa", "kom", domain.CatalogItemKindArticle, nil)
	if _, err := s.PostStockReceipt(ctx, domain.StockReceiptInput{Lines: []domain.StockReceiptLine{{CatalogItemID: "moved", Quantity: 1}}}, "ana"); err != nil {
		t.Fatal(err)
	}
	filter := CatalogCleanupFilter{Kinds: []domain.CatalogItemKind{domain.CatalogItemKindArticle}, Missing: CleanupMissingBoth}
	preview, err := s.CatalogItemsMissingPrices(ctx, filter)
	if err != nil || len(preview) != 1 || preview[0].ID != "idle" {
		t.Fatalf("preview = %+v, %v", preview, err)
	}
	deleted, err := s.DeleteCatalogItemsMissingPrices(ctx, filter)
	if err != nil || deleted != 1 {
		t.Fatalf("deleted = %d, %v", deleted, err)
	}
	if item, _ := s.CatalogItemByID(ctx, "moved"); item == nil {
		t.Fatal("cleanup deleted an article with movements")
	}
}

func TestSQLiteStoreCleanupSkipsArticlesWithMovements(t *testing.T) {
	ctx := testTenantContext()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	t.Cleanup(func() { _ = s.Close() })
	runStockCleanupContract(t, s, ctx)
}

func TestFixtureStoreCleanupSkipsArticlesWithMovements(t *testing.T) {
	runStockCleanupContract(t, NewFixtureStore(testutil.FixtureDir(t)), testTenantContext())
}

// The demo organization's stock and process-template content, including its
// idempotency and article links, is covered by TestSeedDemoFromFixtures in
// seed_demo_test.go.
