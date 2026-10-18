package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Demo content: the "Procesi rada" and "Magacin" half of the demo organization.
// SeedDemoFromFixtures lays down the fixture users/customers/work-orders first
// (modules off, no process), then calls seedDemoContent to turn both modules on
// and add a curated, process- and stock-driven data set on top. Everything here
// goes through the same store methods the HTTP API uses (module switch, catalog,
// stock count/receipt, process templates, work orders, process updates), so
// stock movements come from the real posting logic rather than hand-inserted
// rows. The two halves share one tenant: article codes and order numbers are
// unique per tenant, so the fixtures are seeded first and the orders below take
// the next free RN-<year>-<seq> numbers after them.

const (
	// demoAdminUsername is created by the fixture seed; the content below reuses
	// it as the actor for admin-only writes (module switch, stock count, order
	// creation). demoOperatorUsername is created here (the fixtures have their
	// own operator logins) and acts for operator-only writes (receipts, marking
	// steps done).
	demoAdminUsername    = "admin"
	demoOperatorUsername = "operater"
	demoOperatorPassword = "operater123"

	// demoBrochureTemplate is the template with an intermediate product and two
	// parallel steps, the one to open in the process simulator.
	demoBrochureTemplate = "Brošura sa šivenjem"
)

// MinDemoPasswordLength is required for the demo logins in production.
const MinDemoPasswordLength = 12

// DemoPasswords resolves the password overrides for the demo organization's
// logins. Outside production both may be empty, meaning "keep the public demo
// passwords" (the fixture admin password and operater123). In production both
// must be set, at least MinDemoPasswordLength characters, and must not be a
// public demo password: a production server refuses to start when any tenant
// has the demo admin/admin123 login (see cmd/server/main.go), and the demo org
// is reachable at /login/demo on the live host. The returned values are the
// overrides to apply; empty means leave the default in place.
func DemoPasswords(production bool, admin, operator string) (string, string, error) {
	admin, operator = strings.TrimSpace(admin), strings.TrimSpace(operator)
	if !production {
		return admin, operator, nil
	}
	for _, pw := range []struct{ name, value string }{
		{"IRIS_DEMO_ADMIN_PASSWORD", admin},
		{"IRIS_DEMO_OPERATOR_PASSWORD", operator},
	} {
		switch {
		case pw.value == "":
			return "", "", fmt.Errorf("%s is required in production", pw.name)
		case len(pw.value) < MinDemoPasswordLength:
			return "", "", fmt.Errorf("%s must be at least %d characters", pw.name, MinDemoPasswordLength)
		case pw.value == "admin123" || pw.value == demoOperatorPassword || pw.value == "admin123321":
			return "", "", fmt.Errorf("%s must not be a demo password", pw.name)
		}
	}
	return admin, operator, nil
}

// DemoSeedResult describes what SeedDemoFromFixtures created, for the CLI
// summary. The order numbers are resolved at creation time because they follow
// the fixture orders. When AlreadySeeded is true the process/stock content was
// already present and left untouched, so the other fields are zero.
type DemoSeedResult struct {
	AlreadySeeded    bool
	Templates        int
	Orders           int      // process-driven orders added on top of the fixtures
	LowArticles      []string // names of articles flagged low
	ShortageOrder    string   // open order whose planned input exceeds on-hand stock
	InProgressOrder  string   // in progress, actual quantity above planned
	BrochureOrder    string
	BrochureTemplate string
	CancelledOrder   string
}

type demoArticle struct {
	key      string
	code     string
	name     string
	unit     string
	price    float64
	minStock float64
	opening  float64
}

var demoArticles = []demoArticle{
	{"papir80", "PAP-80-A3", "Papir 80g A3", "tabak", 12.5, 1000, 6500},
	{"kunstdruk", "PAP-KD-135", "Papir kunstdruk 135g SRA3", "tabak", 24, 500, 1500},
	{"karton", "KAR-300", "Karton 300g", "tabak", 38, 100, 400},
	{"boja", "BOJ-CMYK", "Boja CMYK", "kg", 1800, 10, 14},
	{"ploca", "PLO-OFF", "Offset ploča", "kom", 650, 40, 100},
	{"toner", "TON-DIG", "Toner", "kom", 9500, 5, 3},
	{"zica", "ZIC-POV", "Žica za povez", "kalem", 1400, 2, 6},
	{"baner", "BAN-PVC-510", "Banner PVC 510g", "m2", 420, 50, 100},
	{"makulatura", "MAK-001", "Makulatura", "tabak", 0, 0, 0},
	{"otpad", "OTP-BAN", "Otpad bannera", "m2", 0, 0, 0},
}

var demoServices = []struct {
	code, name, unit string
	price            float64
}{
	{"USL-PRIPREMA", "Grafička priprema", "sat", 2500},
	{"USL-OFFSET", "Offset štampa", "kom", 6},
	{"USL-DIGITAL", "Digitalna štampa", "kom", 18},
	{"USL-KNJIGOVEZ", "Knjigovezivanje", "kom", 45},
}

// seedDemoContent turns on both modules for the demo tenant (already in ctx) and
// adds the curated catalog, warehouse stock, process templates and
// process-driven work orders. It assumes the fixture seed has already run, so it
// creates only the operater login (the admin login comes from the fixtures) and
// its orders take the next free order numbers. now anchors the order dates; zero
// means time.Now().
func seedDemoContent(ctx context.Context, s *SQLiteStore, slug, operatorPassword string, now time.Time) (DemoSeedResult, error) {
	// Idempotency sentinel: process templates exist only once this content has
	// run, so their presence means a prior seed already added everything here.
	// The fixture half (seedDemoFixtures) is upsert-based and safe to re-run; the
	// content half below creates templates, orders and stock movements that are
	// not, so skip it rather than duplicate them.
	if templates, err := s.ProcessTemplates(ctx); err != nil {
		return DemoSeedResult{}, err
	} else if len(templates) > 0 {
		return DemoSeedResult{AlreadySeeded: true}, nil
	}
	if now.IsZero() {
		now = time.Now()
	}
	operatorPw := demoOperatorPassword
	if operatorPassword != "" {
		operatorPw = operatorPassword
	}
	b := &demoContentBuilder{
		s: s, slug: slug, ctx: ctx, now: now, operatorPassword: operatorPw,
		articles:  map[string]domain.CatalogItem{},
		customers: map[string]domain.Customer{},
		locations: map[string]domain.Location{},
		templates: map[string]*domain.ProcessTemplate{},
	}
	var result DemoSeedResult
	if err := b.build(&result); err != nil {
		return DemoSeedResult{}, err
	}
	return result, nil
}

type demoContentBuilder struct {
	s                *SQLiteStore
	ctx              context.Context
	slug             string
	now              time.Time
	operatorPassword string
	articles         map[string]domain.CatalogItem
	customers        map[string]domain.Customer
	locations        map[string]domain.Location
	templates        map[string]*domain.ProcessTemplate
}

func (b *demoContentBuilder) build(result *DemoSeedResult) error {
	steps := []func() error{
		b.users, b.modules, b.customersAndLocations, b.catalog, b.stock, b.processTemplates,
	}
	for _, step := range steps {
		if err := step(); err != nil {
			return err
		}
	}
	return b.workOrders(result)
}

func (b *demoContentBuilder) users() error {
	id := "user-" + b.slug + "-" + demoOperatorUsername
	if err := b.s.CreateUser(b.ctx, id, demoOperatorUsername, b.operatorPassword, domain.RoleUser, true); err != nil {
		return fmt.Errorf("demo user %s: %w", demoOperatorUsername, err)
	}
	return nil
}

func (b *demoContentBuilder) modules() error {
	on := true
	if _, err := b.s.SetTenantModules(b.ctx, b.slug, domain.OrganizationModulesUpdate{Stock: &on, Processes: &on}); err != nil {
		return fmt.Errorf("demo modules: %w", err)
	}
	return nil
}

func (b *demoContentBuilder) customersAndLocations() error {
	str := func(v string) *string { return &v }
	for _, c := range []struct{ key, name, contact, email, phone, location, address string }{
		{"pekara", "Pekara Zlatni klas", "Milan Jovanović", "milan@zlatniklas.example", "021/555-101", "Pekara Centar", "Bulevar oslobođenja 12, Novi Sad"},
		{"opstina", "Opština Novi Grad", "Jelena Marković", "jelena.markovic@novigrad.example", "021/555-202", "Pisarnica", "Trg slobode 1, Novi Grad"},
		{"pixel", "Agencija Pixel", "Nikola Ilić", "nikola@pixel.example", "064/555-303", "Studio", "Zmaj Jovina 8, Novi Sad"},
		{"slovo", "Knjižara Slovo", "Ana Petrović", "ana@slovo.example", "011/555-404", "Knjižara Slovo", "Knez Mihailova 20, Beograd"},
		{"volan", "Auto-škola Volan", "Dragan Savić", "dragan@volan.example", "021/555-505", "Sedište", "Futoška 45, Novi Sad"},
	} {
		customer, err := b.s.UpsertCustomer(b.ctx, domain.Customer{
			ID: "cust-" + b.slug + "-" + c.key, Name: c.name,
			ContactName: str(c.contact), Email: str(c.email), Phone: str(c.phone),
		})
		if err != nil {
			return fmt.Errorf("demo customer %s: %w", c.key, err)
		}
		location, err := b.s.UpsertLocation(b.ctx, domain.Location{
			ID: "loc-" + b.slug + "-" + c.key, CustomerID: customer.ID, Name: c.location, Address: str(c.address),
		})
		if err != nil {
			return fmt.Errorf("demo location %s: %w", c.key, err)
		}
		b.customers[c.key], b.locations[c.key] = *customer, *location
	}
	return nil
}

func (b *demoContentBuilder) catalog() error {
	for _, svc := range demoServices {
		price := svc.price
		if _, err := b.s.UpsertCatalogItem(b.ctx, domain.CatalogItem{
			ID: "cat-" + b.slug + "-" + strings.ToLower(svc.code), Code: svc.code, Name: svc.name, Unit: svc.unit,
			Kind: domain.CatalogItemKindService, SalePrice: &price, IsActive: true,
		}, ""); err != nil {
			return fmt.Errorf("demo service %s: %w", svc.code, err)
		}
	}
	for _, a := range demoArticles {
		item := domain.CatalogItem{
			ID: "cat-" + b.slug + "-" + a.key, Code: a.code, Name: a.name, Unit: a.unit,
			Kind: domain.CatalogItemKindArticle, IsActive: true,
		}
		if a.price > 0 {
			price := a.price
			item.PurchasePrice = &price
		}
		if a.minStock > 0 {
			min := a.minStock
			item.MinStock = &min
		}
		saved, err := b.s.UpsertCatalogItem(b.ctx, item, "")
		if err != nil {
			return fmt.Errorf("demo article %s: %w", a.code, err)
		}
		b.articles[a.key] = *saved
	}
	return nil
}

// stock posts the opening balance as a stock count (history shows "Početno
// stanje") and three goods receipts on different articles.
func (b *demoContentBuilder) stock() error {
	counts := make([]domain.StockCountLine, 0, len(demoArticles))
	for _, a := range demoArticles {
		counts = append(counts, domain.StockCountLine{CatalogItemID: b.articles[a.key].ID, CountedQuantity: a.opening})
	}
	if _, err := b.s.PostStockCount(b.ctx, domain.StockCountInput{Note: "Početno stanje", Lines: counts}, demoAdminUsername); err != nil {
		return fmt.Errorf("demo opening stock: %w", err)
	}
	line := func(key string, qty float64) domain.StockReceiptLine {
		return domain.StockReceiptLine{CatalogItemID: b.articles[key].ID, Quantity: qty}
	}
	for _, r := range []domain.StockReceiptInput{
		{DocumentRef: "OT-2026-118 Papirdom", Note: "Isporuka papira", Lines: []domain.StockReceiptLine{line("papir80", 2500), line("kunstdruk", 1000)}},
		{DocumentRef: "FA-2026-0342 Chem-Color", Note: "Boje i ploče", Lines: []domain.StockReceiptLine{line("boja", 10), line("ploca", 50)}},
		{DocumentRef: "OT-2026-131 Banerprint", Note: "Baneri i žica", Lines: []domain.StockReceiptLine{line("baner", 150), line("zica", 4)}},
	} {
		if _, err := b.s.PostStockReceipt(b.ctx, r, demoOperatorUsername); err != nil {
			return fmt.Errorf("demo receipt %s: %w", r.DocumentRef, err)
		}
	}
	return nil
}

// graphBuilder lays a process out left to right: a step per column (300px
// apart), its inputs above it (side by side when there are two, at col±0.37)
// and its byproducts below, products one column after their step. The web
// editor draws inputs and byproducts as vertical lines into/out of the step.
type graphBuilder struct {
	b     *demoContentBuilder
	graph domain.ProcessGraph
}

const (
	demoColumn = 300.0
	demoRow    = 120.0 // step row → byproduct row
	demoInRow  = 170.0 // input row → step row; room for right-angled side streams
)

func (g *graphBuilder) step(id, label string, col, y float64) {
	g.graph.Nodes = append(g.graph.Nodes, domain.ProcessNode{ID: id, Kind: domain.ProcessNodeStep, Label: label, X: col * demoColumn, Y: y})
}

// item adds an input (stack index above the step), byproduct (below) or product.
func (g *graphBuilder) item(kind domain.ProcessNodeKind, id, label, article string, qty float64, col, y float64) {
	node := domain.ProcessNode{ID: id, Kind: kind, Label: label, X: col * demoColumn, Y: y}
	if article != "" {
		a := g.b.articles[article]
		node.CatalogItemID, node.Unit = a.ID, a.Unit
		node.Quantity = &qty
	} else {
		node.Unit = "kom"
	}
	g.graph.Nodes = append(g.graph.Nodes, node)
}

func (g *graphBuilder) edges(pairs ...string) {
	for i := 0; i+1 < len(pairs); i += 2 {
		g.graph.Edges = append(g.graph.Edges, domain.ProcessEdge{ID: pairs[i] + "-" + pairs[i+1], Source: pairs[i], Target: pairs[i+1]})
	}
}

func (b *demoContentBuilder) processTemplates() error {
	const lane = 300.0 // main step row; inputs sit above, byproducts below
	in, by, pr := domain.ProcessNodeInput, domain.ProcessNodeByproduct, domain.ProcessNodeProduct
	type spec struct {
		key, name, description string
		isDefault              bool
		build                  func(g *graphBuilder)
	}
	specs := []spec{
		{"offset", "Offset štampa", "Standardni tok offset štampe od pripreme ploča do pakovanja.", true, func(g *graphBuilder) {
			g.step("priprema", "Priprema", 0, lane)
			g.step("stampa", "Štampa", 1, lane)
			g.step("secenje", "Sečenje", 2, lane)
			g.step("pakovanje", "Pakovanje", 3, lane)
			g.item(in, "ploce", "Offset ploče", "ploca", 4, 0, lane-demoInRow)
			g.item(in, "papir", "Papir 80g A3", "papir80", 100, 0.63, lane-demoInRow)
			g.item(in, "boja", "Boja CMYK", "boja", 2, 1.37, lane-demoInRow)
			g.item(by, "mak-stampa", "Makulatura (štampa)", "makulatura", 3, 1, lane+demoRow)
			g.item(by, "mak-secenje", "Makulatura (sečenje)", "makulatura", 2, 2, lane+demoRow)
			g.item(pr, "otisci", "Gotovi otisci", "", 0, 4, lane)
			g.edges("priprema", "stampa", "stampa", "secenje", "secenje", "pakovanje", "pakovanje", "otisci",
				"ploce", "priprema", "papir", "stampa", "boja", "stampa", "stampa", "mak-stampa", "secenje", "mak-secenje")
		}},
		{"digital", "Digitalna štampa", "Kratke serije na digitalnoj mašini.", false, func(g *graphBuilder) {
			g.step("priprema", "Priprema fajla", 0, lane)
			g.step("stampa", "Štampa", 1, lane)
			g.step("dorada", "Dorada", 2, lane)
			g.item(in, "papir", "Papir kunstdruk 135g", "kunstdruk", 50, 0.63, lane-demoInRow)
			g.item(in, "toner", "Toner", "toner", 1, 1.37, lane-demoInRow)
			g.item(pr, "otisci", "Digitalni otisci", "", 0, 3, lane)
			g.edges("priprema", "stampa", "stampa", "dorada", "dorada", "otisci", "papir", "stampa", "toner", "stampa")
		}},
		{"brosura", demoBrochureTemplate, "Brošura sa međuproizvodom (štampani tabaci) i paralelnom štampom korica.", false, func(g *graphBuilder) {
			g.step("stampa-tabaka", "Štampa tabaka", 0, lane)
			g.step("savijanje", "Savijanje", 2, lane)
			g.step("sivenje", "Šivenje", 3, lane)
			g.step("obrezivanje", "Obrezivanje", 4, lane)
			g.step("stampa-korica", "Štampa korica", 1, lane+320)
			g.item(in, "papir", "Papir kunstdruk 135g", "kunstdruk", 200, -0.37, lane-demoInRow)
			g.item(in, "boja", "Boja CMYK", "boja", 3, 0.37, lane-demoInRow)
			g.item(pr, "tabaci", "Štampani tabaci", "", 0, 1, lane)
			g.item(in, "karton", "Karton 300g", "karton", 50, 1, lane+320-demoInRow)
			g.item(in, "zica", "Žica za povez", "zica", 1, 3, lane-demoInRow)
			g.item(by, "mak", "Makulatura", "makulatura", 5, 4, lane+demoRow)
			g.item(pr, "brosure", "Brošure", "", 0, 5, lane)
			g.edges("stampa-tabaka", "tabaci", "tabaci", "savijanje", "savijanje", "sivenje", "stampa-korica", "sivenje",
				"sivenje", "obrezivanje", "obrezivanje", "brosure", "obrezivanje", "mak",
				"papir", "stampa-tabaka", "boja", "stampa-tabaka", "karton", "stampa-korica", "zica", "sivenje")
		}},
		{"baner", "Veliki format (baner)", "Štampa banera na PVC-u sa ojačanjem i ringlovanjem.", false, func(g *graphBuilder) {
			g.step("priprema", "Priprema", 0, lane)
			g.step("stampa", "Štampa", 1, lane)
			g.step("ojacanje", "Ojačanje i ringlovanje", 2, lane)
			g.item(in, "baner", "Banner PVC 510g", "baner", 12, 1, lane-demoInRow)
			g.item(by, "otpad", "Otpad bannera", "otpad", 1, 1, lane+demoRow)
			g.item(pr, "gotov", "Baner", "", 0, 3, lane)
			g.edges("priprema", "stampa", "stampa", "ojacanje", "ojacanje", "gotov", "baner", "stampa", "stampa", "otpad")
		}},
	}
	for _, sp := range specs {
		g := &graphBuilder{b: b}
		sp.build(g)
		template, err := b.s.CreateProcessTemplate(b.ctx, domain.ProcessTemplateInput{
			Name: sp.name, Description: sp.description, IsDefault: sp.isDefault, Graph: g.graph,
		})
		if err != nil {
			return fmt.Errorf("demo template %s: %w", sp.name, err)
		}
		b.templates[sp.key] = template
	}
	return nil
}

// demoOrder is one work order to create.
type demoOrder struct {
	customer, description, template string
	daysAgo                         int
	assignee                        string
	priority                        domain.WorkOrderPriority
	price                           float64
	// scale overrides planned quantities of nodes (after the process is attached).
	scale map[string]float64
	// status path after creation, e.g. assigned, inProgress.
	statuses []domain.WorkOrderStatus
	// done lists step batches to complete in order; actual overrides the
	// recorded quantity of item nodes when that batch is marked done.
	done []demoDone
	// finish moves the order to the final status after the process work.
	finish []domain.WorkOrderStatus
}

type demoDone struct {
	steps  []string
	actual map[string]float64
}

func (b *demoContentBuilder) workOrders(result *DemoSeedResult) error {
	assigned := []domain.WorkOrderStatus{domain.WorkOrderStatusAssigned}
	progress := []domain.WorkOrderStatus{domain.WorkOrderStatusAssigned, domain.WorkOrderStatusInProgress}
	completed := []domain.WorkOrderStatus{domain.WorkOrderStatusCompleted}
	offsetAll := []demoDone{{steps: []string{"priprema"}}, {steps: []string{"stampa"}}, {steps: []string{"secenje"}}, {steps: []string{"pakovanje"}}}
	orders := []demoOrder{
		{ // 1: new, untouched -> reserved stock
			customer: "pekara", description: "Flajeri A5, 5.000 kom, 4+4", template: "offset", daysAgo: 2,
			assignee: demoOperatorUsername, priority: domain.WorkOrderPriorityNormal, price: 38000,
			scale: map[string]float64{"papir": 650, "boja": 2, "ploce": 4},
		},
		{ // 2: new digital
			customer: "pixel", description: "Vizit karte, 500 kom, kunstdruk 350g", template: "digital", daysAgo: 1,
			assignee: demoOperatorUsername, priority: domain.WorkOrderPriorityHigh, price: 7800,
			scale: map[string]float64{"papir": 40, "toner": 1},
		},
		{ // 3: in progress, actual paper above plan
			customer: "opstina", description: "Obrasci A4 u tri primerka, 10.000 kom", template: "offset", daysAgo: 9,
			assignee: demoOperatorUsername, priority: domain.WorkOrderPriorityNormal, price: 112000,
			scale:    map[string]float64{"papir": 2500, "boja": 6, "ploce": 8, "mak-stampa": 40, "mak-secenje": 25},
			statuses: progress,
			done: []demoDone{
				{steps: []string{"priprema"}},
				{steps: []string{"stampa"}, actual: map[string]float64{"papir": 2750, "boja": 6.5, "mak-stampa": 55}},
			},
		},
		{ // 4: in progress brochure, two parallel steps done
			customer: "slovo", description: "Katalog izdanja, 24 strane, 500 kom", template: "brosura", daysAgo: 6,
			assignee: demoAdminUsername, priority: domain.WorkOrderPriorityHigh, price: 96000,
			scale:    map[string]float64{"papir": 600, "boja": 6, "karton": 150, "zica": 2, "mak": 12},
			statuses: progress,
			done:     []demoDone{{steps: []string{"stampa-tabaka", "stampa-korica"}}},
		},
		{ // 5: completed offset
			customer: "volan", description: "Brošure i uputstva A4, 3.000 kom", template: "offset", daysAgo: 20,
			assignee: demoOperatorUsername, priority: domain.WorkOrderPriorityNormal, price: 54000,
			scale:    map[string]float64{"papir": 1100, "boja": 4, "ploce": 4, "mak-stampa": 18, "mak-secenje": 9},
			statuses: progress, done: offsetAll, finish: completed,
		},
		{ // 6: completed banner
			customer: "pixel", description: "Baner 4x2 m za sajam", template: "baner", daysAgo: 15,
			assignee: demoAdminUsername, priority: domain.WorkOrderPriorityUrgent, price: 9800,
			scale:    map[string]float64{"baner": 8, "otpad": 0.5},
			statuses: progress,
			done:     []demoDone{{steps: []string{"priprema"}}, {steps: []string{"stampa"}}, {steps: []string{"ojacanje"}}},
			finish:   completed,
		},
		{ // 7: big order, planned inputs exceed stock
			customer: "slovo", description: "Zbirka priča, 320 strana, tiraž 2.000", template: "offset", daysAgo: 3,
			assignee: demoOperatorUsername, priority: domain.WorkOrderPriorityHigh, price: 640000,
			scale:    map[string]float64{"papir": 8000, "boja": 30, "ploce": 24, "mak-stampa": 120, "mak-secenje": 60},
			statuses: assigned,
		},
		{ // 8: cancelled, must not reserve stock
			customer: "opstina", description: "Plakati A3, 200 kom", template: "digital", daysAgo: 12,
			assignee: demoOperatorUsername, priority: domain.WorkOrderPriorityLow, price: 6400,
			scale:    map[string]float64{"papir": 400, "toner": 1},
			statuses: []domain.WorkOrderStatus{domain.WorkOrderStatusCancelled},
		},
	}
	for i, order := range orders {
		number, err := b.createOrder(order)
		if err != nil {
			return fmt.Errorf("demo order %d: %w", i+1, err)
		}
		switch i {
		case 2:
			result.InProgressOrder = number
		case 3:
			result.BrochureOrder = number
		case 6:
			result.ShortageOrder = number
		case 7:
			result.CancelledOrder = number
		}
	}
	result.Orders = len(orders)
	result.BrochureTemplate = demoBrochureTemplate
	result.Templates = len(b.templates)

	levels, err := b.s.StockLevels(b.ctx, StockLevelQuery{})
	if err != nil {
		return err
	}
	for _, level := range levels.Items {
		if level.Low {
			result.LowArticles = append(result.LowArticles, level.Name)
		}
	}
	return nil
}

func (b *demoContentBuilder) createOrder(o demoOrder) (string, error) {
	customer, location := b.customers[o.customer], b.locations[o.customer]
	issue := b.now.AddDate(0, 0, -o.daysAgo)
	due := issue.AddDate(0, 0, 10).Format("2006-01-02")
	assignee, price := o.assignee, o.price
	customerID, locationID := customer.ID, location.ID
	order, err := b.s.CreateWorkOrder(b.ctx, domain.CreateWorkOrderInput{
		CustomerID: &customerID, LocationID: &locationID, ClientName: customer.Name, ContactPerson: customer.ContactName,
		JobDescription: o.description, IssuedBy: demoAdminUsername, IssueDate: issue.Format("2006-01-02"), DueDate: &due,
		Assignment: domain.Assignment{AssignedTo: &assignee, Priority: o.priority}, Price: &price,
	})
	if err != nil {
		return "", err
	}
	// New orders get the default template automatically; any other one replaces it.
	template := b.templates[o.template]
	if process, err := b.s.WorkOrderProcess(b.ctx, order.ID); err != nil {
		return "", err
	} else if process == nil || process.TemplateID == nil || *process.TemplateID != template.ID {
		if process != nil {
			if err := b.s.DeleteWorkOrderProcess(b.ctx, order.ID); err != nil {
				return "", err
			}
		}
		if _, err := b.s.ApplyProcessTemplate(b.ctx, order.ID, template.ID, demoAdminUsername); err != nil {
			return "", err
		}
	}
	// Scale planned quantities on the order's own graph (admin, structural).
	if err := b.editProcess(order.ID, demoAdminUsername, true, func(node *domain.ProcessNode) {
		if qty, ok := o.scale[node.ID]; ok {
			value := qty
			node.Quantity = &value
		}
	}); err != nil {
		return "", err
	}
	if err := b.setStatuses(order.ID, o.statuses); err != nil {
		return "", err
	}
	// Operators mark steps done and record actual quantities; the store posts
	// the matching consumption/production movements.
	for _, batch := range o.done {
		steps := map[string]bool{}
		for _, id := range batch.steps {
			steps[id] = true
		}
		if err := b.editProcess(order.ID, o.assignee, false, func(node *domain.ProcessNode) {
			if steps[node.ID] {
				node.Status = domain.ProcessStepDone
			}
			if actual, ok := batch.actual[node.ID]; ok {
				value := actual
				node.ActualQuantity = &value
			}
		}); err != nil {
			return "", err
		}
	}
	if err := b.setStatuses(order.ID, o.finish); err != nil {
		return "", err
	}
	return order.OrderNumber, nil
}

func (b *demoContentBuilder) editProcess(workOrderID, user string, structural bool, edit func(*domain.ProcessNode)) error {
	process, err := b.s.WorkOrderProcess(b.ctx, workOrderID)
	if err != nil {
		return err
	}
	if process == nil {
		return fmt.Errorf("work order %s has no process", workOrderID)
	}
	graph := domain.CloneProcessGraph(process.Graph)
	for i := range graph.Nodes {
		edit(&graph.Nodes[i])
	}
	_, err = b.s.UpdateWorkOrderProcess(b.ctx, workOrderID, graph, user, structural)
	return err
}

func (b *demoContentBuilder) setStatuses(workOrderID string, statuses []domain.WorkOrderStatus) error {
	for _, status := range statuses {
		raw, err := json.Marshal(status)
		if err != nil {
			return err
		}
		if _, err := b.s.UpdateWorkOrder(b.ctx, workOrderID, domain.UpdateWorkOrderInput{"status": raw}); err != nil {
			return fmt.Errorf("set status %s: %w", status, err)
		}
	}
	return nil
}
