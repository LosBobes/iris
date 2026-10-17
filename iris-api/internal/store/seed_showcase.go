package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Showcase organization: a prepopulated tenant for manually exercising the
// "Procesi rada" and "Magacin" modules. Everything goes through the same store
// methods the HTTP API uses (module switch, catalog, stock count/receipt,
// process templates, work orders, process updates), so stock movements come
// from the real posting logic rather than hand-inserted rows.

// Showcase defaults.
const (
	ShowcaseDefaultSlug = "showcase"
	ShowcaseName        = "Showcase Štamparija"

	ShowcaseAdminUsername    = "admin"
	ShowcaseAdminPassword    = "admin123"
	ShowcaseOperatorUsername = "operater"
	ShowcaseOperatorPassword = "operater123"

	// ShowcaseBrochureTemplate is the template with an intermediate product and
	// two parallel steps, the one to open in the process simulator.
	ShowcaseBrochureTemplate = "Brošura sa šivenjem"
)

// ShowcaseOptions controls SeedShowcase.
type ShowcaseOptions struct {
	// Slug is the organization slug; empty means ShowcaseDefaultSlug.
	Slug string
	// Reset deletes an existing organization with that slug before seeding.
	Reset bool
	// Now anchors the order dates; zero means time.Now().
	Now time.Time
	// AdminPassword and OperatorPassword set the two logins' passwords; empty
	// means the public demo passwords. Resolve them with ShowcasePasswords so
	// production never gets the demo ones.
	AdminPassword    string
	OperatorPassword string
}

// MinShowcasePasswordLength is required for the showcase logins in production.
const MinShowcasePasswordLength = 12

// ShowcasePasswords resolves the showcase logins' passwords. Outside production
// an empty value falls back to the public demo password. In production both
// must be set, at least MinShowcasePasswordLength characters, and must not be
// a demo password: a production server refuses to start with the demo admin
// password, and the showcase org is reachable at /login/<slug> on the live host.
func ShowcasePasswords(production bool, admin, operator string) (string, string, error) {
	admin, operator = strings.TrimSpace(admin), strings.TrimSpace(operator)
	if !production {
		if admin == "" {
			admin = ShowcaseAdminPassword
		}
		if operator == "" {
			operator = ShowcaseOperatorPassword
		}
		return admin, operator, nil
	}
	for _, pw := range []struct{ name, value string }{
		{"IRIS_SHOWCASE_ADMIN_PASSWORD", admin},
		{"IRIS_SHOWCASE_OPERATOR_PASSWORD", operator},
	} {
		switch {
		case pw.value == "":
			return "", "", fmt.Errorf("%s is required in production", pw.name)
		case len(pw.value) < MinShowcasePasswordLength:
			return "", "", fmt.Errorf("%s must be at least %d characters", pw.name, MinShowcasePasswordLength)
		case pw.value == ShowcaseAdminPassword || pw.value == ShowcaseOperatorPassword || pw.value == "admin123321":
			return "", "", fmt.Errorf("%s must not be a demo password", pw.name)
		}
	}
	return admin, operator, nil
}

// ShowcaseResult describes what SeedShowcase did. When Created is false the
// organization already existed and nothing else is filled in.
type ShowcaseResult struct {
	Created          bool
	Slug             string
	Name             string
	Templates        int
	Orders           int
	LowArticles      []string // names of articles flagged low
	ShortageOrder    string   // open order whose planned input exceeds on-hand stock
	ShortageArticle  string
	InProgressOrder  string // in progress, actual quantity above planned
	BrochureOrder    string
	BrochureTemplate string
	CancelledOrder   string
	// DemoPasswords is true when the logins use the public demo passwords.
	DemoPasswords bool
}

type showcaseArticle struct {
	key      string
	code     string
	name     string
	unit     string
	price    float64
	minStock float64
	opening  float64
}

var showcaseArticles = []showcaseArticle{
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

var showcaseServices = []struct {
	code, name, unit string
	price            float64
}{
	{"USL-PRIPREMA", "Grafička priprema", "sat", 2500},
	{"USL-OFFSET", "Offset štampa", "kom", 6},
	{"USL-DIGITAL", "Digitalna štampa", "kom", 18},
	{"USL-KNJIGOVEZ", "Knjigovezivanje", "kom", 45},
}

// SeedShowcase creates and prepopulates the showcase organization. It is
// idempotent: when the organization exists it changes nothing (Created=false)
// unless opts.Reset is set, which deletes and recreates it. A failure midway
// removes the half-built organization so a re-run starts clean.
func SeedShowcase(ctx context.Context, s *SQLiteStore, opts ShowcaseOptions) (result ShowcaseResult, err error) {
	slug := strings.ToLower(strings.TrimSpace(opts.Slug))
	if slug == "" {
		slug = ShowcaseDefaultSlug
	}
	existing, err := s.TenantBySlug(ctx, slug)
	if err != nil {
		return ShowcaseResult{}, err
	}
	if existing != nil {
		if !opts.Reset {
			return ShowcaseResult{Slug: slug, Name: existing.Name}, nil
		}
		if _, err := s.DeleteTenant(ctx, slug); err != nil {
			return ShowcaseResult{}, err
		}
	}
	tenant, err := s.CreateTenant(ctx, "tenant-"+slug, slug, ShowcaseName)
	if err != nil {
		return ShowcaseResult{}, err
	}
	defer func() {
		if err != nil {
			_, _ = s.DeleteTenant(context.WithoutCancel(ctx), slug)
		}
	}()
	b := &showcaseBuilder{
		s: s, slug: slug, ctx: ContextWithTenant(ctx, tenant.ID),
		now: opts.Now, articles: map[string]domain.CatalogItem{}, customers: map[string]domain.Customer{},
		locations: map[string]domain.Location{}, templates: map[string]*domain.ProcessTemplate{},
		adminPassword: opts.AdminPassword, operatorPassword: opts.OperatorPassword,
	}
	if b.adminPassword == "" {
		b.adminPassword = ShowcaseAdminPassword
	}
	if b.operatorPassword == "" {
		b.operatorPassword = ShowcaseOperatorPassword
	}
	if b.now.IsZero() {
		b.now = time.Now()
	}
	result.Slug, result.Name = slug, tenant.Name
	if err = b.build(&result); err != nil {
		return ShowcaseResult{}, err
	}
	result.Created = true
	result.DemoPasswords = b.adminPassword == ShowcaseAdminPassword && b.operatorPassword == ShowcaseOperatorPassword
	return result, nil
}

type showcaseBuilder struct {
	s         *SQLiteStore
	ctx       context.Context
	slug      string
	now       time.Time
	articles  map[string]domain.CatalogItem
	customers map[string]domain.Customer
	locations map[string]domain.Location
	templates map[string]*domain.ProcessTemplate

	adminPassword, operatorPassword string
}

func (b *showcaseBuilder) build(result *ShowcaseResult) error {
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

func (b *showcaseBuilder) users() error {
	for _, u := range []struct {
		name, password string
		role           domain.UserRole
	}{
		{ShowcaseAdminUsername, b.adminPassword, domain.RoleAdmin},
		{ShowcaseOperatorUsername, b.operatorPassword, domain.RoleUser},
	} {
		id := "user-" + b.slug + "-" + u.name
		if err := b.s.CreateUser(b.ctx, id, u.name, u.password, u.role, true); err != nil {
			return fmt.Errorf("showcase user %s: %w", u.name, err)
		}
	}
	return nil
}

func (b *showcaseBuilder) modules() error {
	on := true
	if _, err := b.s.SetTenantModules(b.ctx, b.slug, domain.OrganizationModulesUpdate{Stock: &on, Processes: &on}); err != nil {
		return fmt.Errorf("showcase modules: %w", err)
	}
	// Brand the app with the showcase name instead of the default firm name.
	firmName := ShowcaseName
	if _, err := b.s.UpdateOrganizationSettings(b.ctx, domain.OrganizationSettingsUpdate{FirmName: &firmName}); err != nil {
		return fmt.Errorf("showcase firm name: %w", err)
	}
	return nil
}

func (b *showcaseBuilder) customersAndLocations() error {
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
			return fmt.Errorf("showcase customer %s: %w", c.key, err)
		}
		location, err := b.s.UpsertLocation(b.ctx, domain.Location{
			ID: "loc-" + b.slug + "-" + c.key, CustomerID: customer.ID, Name: c.location, Address: str(c.address),
		})
		if err != nil {
			return fmt.Errorf("showcase location %s: %w", c.key, err)
		}
		b.customers[c.key], b.locations[c.key] = *customer, *location
	}
	return nil
}

func (b *showcaseBuilder) catalog() error {
	for _, svc := range showcaseServices {
		price := svc.price
		if _, err := b.s.UpsertCatalogItem(b.ctx, domain.CatalogItem{
			ID: "cat-" + b.slug + "-" + strings.ToLower(svc.code), Code: svc.code, Name: svc.name, Unit: svc.unit,
			Kind: domain.CatalogItemKindService, SalePrice: &price, IsActive: true,
		}, ""); err != nil {
			return fmt.Errorf("showcase service %s: %w", svc.code, err)
		}
	}
	for _, a := range showcaseArticles {
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
			return fmt.Errorf("showcase article %s: %w", a.code, err)
		}
		b.articles[a.key] = *saved
	}
	return nil
}

// stock posts the opening balance as a stock count (history shows "Početno
// stanje") and three goods receipts on different articles.
func (b *showcaseBuilder) stock() error {
	counts := make([]domain.StockCountLine, 0, len(showcaseArticles))
	for _, a := range showcaseArticles {
		counts = append(counts, domain.StockCountLine{CatalogItemID: b.articles[a.key].ID, CountedQuantity: a.opening})
	}
	if _, err := b.s.PostStockCount(b.ctx, domain.StockCountInput{Note: "Početno stanje", Lines: counts}, ShowcaseAdminUsername); err != nil {
		return fmt.Errorf("showcase opening stock: %w", err)
	}
	line := func(key string, qty float64) domain.StockReceiptLine {
		return domain.StockReceiptLine{CatalogItemID: b.articles[key].ID, Quantity: qty}
	}
	for _, r := range []domain.StockReceiptInput{
		{DocumentRef: "OT-2026-118 Papirdom", Note: "Isporuka papira", Lines: []domain.StockReceiptLine{line("papir80", 2500), line("kunstdruk", 1000)}},
		{DocumentRef: "FA-2026-0342 Chem-Color", Note: "Boje i ploče", Lines: []domain.StockReceiptLine{line("boja", 10), line("ploca", 50)}},
		{DocumentRef: "OT-2026-131 Banerprint", Note: "Baneri i žica", Lines: []domain.StockReceiptLine{line("baner", 150), line("zica", 4)}},
	} {
		if _, err := b.s.PostStockReceipt(b.ctx, r, ShowcaseOperatorUsername); err != nil {
			return fmt.Errorf("showcase receipt %s: %w", r.DocumentRef, err)
		}
	}
	return nil
}

// graphBuilder lays a process out left to right: a step per column (300px
// apart), its inputs above it (side by side when there are two, at col±0.37)
// and its byproducts below, products one column after their step. The web
// editor draws inputs and byproducts as vertical lines into/out of the step.
type graphBuilder struct {
	b     *showcaseBuilder
	graph domain.ProcessGraph
}

const (
	showcaseColumn = 300.0
	showcaseRow    = 120.0 // step row → byproduct row
	showcaseInRow  = 170.0 // input row → step row; room for right-angled side streams
)

func (g *graphBuilder) step(id, label string, col, y float64) {
	g.graph.Nodes = append(g.graph.Nodes, domain.ProcessNode{ID: id, Kind: domain.ProcessNodeStep, Label: label, X: col * showcaseColumn, Y: y})
}

// item adds an input (stack index above the step), byproduct (below) or product.
func (g *graphBuilder) item(kind domain.ProcessNodeKind, id, label, article string, qty float64, col, y float64) {
	node := domain.ProcessNode{ID: id, Kind: kind, Label: label, X: col * showcaseColumn, Y: y}
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

func (b *showcaseBuilder) processTemplates() error {
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
			g.item(in, "ploce", "Offset ploče", "ploca", 4, 0, lane-showcaseInRow)
			g.item(in, "papir", "Papir 80g A3", "papir80", 100, 0.63, lane-showcaseInRow)
			g.item(in, "boja", "Boja CMYK", "boja", 2, 1.37, lane-showcaseInRow)
			g.item(by, "mak-stampa", "Makulatura (štampa)", "makulatura", 3, 1, lane+showcaseRow)
			g.item(by, "mak-secenje", "Makulatura (sečenje)", "makulatura", 2, 2, lane+showcaseRow)
			g.item(pr, "otisci", "Gotovi otisci", "", 0, 4, lane)
			g.edges("priprema", "stampa", "stampa", "secenje", "secenje", "pakovanje", "pakovanje", "otisci",
				"ploce", "priprema", "papir", "stampa", "boja", "stampa", "stampa", "mak-stampa", "secenje", "mak-secenje")
		}},
		{"digital", "Digitalna štampa", "Kratke serije na digitalnoj mašini.", false, func(g *graphBuilder) {
			g.step("priprema", "Priprema fajla", 0, lane)
			g.step("stampa", "Štampa", 1, lane)
			g.step("dorada", "Dorada", 2, lane)
			g.item(in, "papir", "Papir kunstdruk 135g", "kunstdruk", 50, 0.63, lane-showcaseInRow)
			g.item(in, "toner", "Toner", "toner", 1, 1.37, lane-showcaseInRow)
			g.item(pr, "otisci", "Digitalni otisci", "", 0, 3, lane)
			g.edges("priprema", "stampa", "stampa", "dorada", "dorada", "otisci", "papir", "stampa", "toner", "stampa")
		}},
		{"brosura", ShowcaseBrochureTemplate, "Brošura sa međuproizvodom (štampani tabaci) i paralelnom štampom korica.", false, func(g *graphBuilder) {
			g.step("stampa-tabaka", "Štampa tabaka", 0, lane)
			g.step("savijanje", "Savijanje", 2, lane)
			g.step("sivenje", "Šivenje", 3, lane)
			g.step("obrezivanje", "Obrezivanje", 4, lane)
			g.step("stampa-korica", "Štampa korica", 1, lane+320)
			g.item(in, "papir", "Papir kunstdruk 135g", "kunstdruk", 200, -0.37, lane-showcaseInRow)
			g.item(in, "boja", "Boja CMYK", "boja", 3, 0.37, lane-showcaseInRow)
			g.item(pr, "tabaci", "Štampani tabaci", "", 0, 1, lane)
			g.item(in, "karton", "Karton 300g", "karton", 50, 1, lane+320-showcaseInRow)
			g.item(in, "zica", "Žica za povez", "zica", 1, 3, lane-showcaseInRow)
			g.item(by, "mak", "Makulatura", "makulatura", 5, 4, lane+showcaseRow)
			g.item(pr, "brosure", "Brošure", "", 0, 5, lane)
			g.edges("stampa-tabaka", "tabaci", "tabaci", "savijanje", "savijanje", "sivenje", "stampa-korica", "sivenje",
				"sivenje", "obrezivanje", "obrezivanje", "brosure", "obrezivanje", "mak",
				"papir", "stampa-tabaka", "boja", "stampa-tabaka", "karton", "stampa-korica", "zica", "sivenje")
		}},
		{"baner", "Veliki format (baner)", "Štampa banera na PVC-u sa ojačanjem i ringlovanjem.", false, func(g *graphBuilder) {
			g.step("priprema", "Priprema", 0, lane)
			g.step("stampa", "Štampa", 1, lane)
			g.step("ojacanje", "Ojačanje i ringlovanje", 2, lane)
			g.item(in, "baner", "Banner PVC 510g", "baner", 12, 1, lane-showcaseInRow)
			g.item(by, "otpad", "Otpad bannera", "otpad", 1, 1, lane+showcaseRow)
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
			return fmt.Errorf("showcase template %s: %w", sp.name, err)
		}
		b.templates[sp.key] = template
	}
	return nil
}

// showcaseOrder is one work order to create.
type showcaseOrder struct {
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
	done []showcaseDone
	// finish moves the order to the final status after the process work.
	finish []domain.WorkOrderStatus
}

type showcaseDone struct {
	steps  []string
	actual map[string]float64
}

func (b *showcaseBuilder) workOrders(result *ShowcaseResult) error {
	assigned := []domain.WorkOrderStatus{domain.WorkOrderStatusAssigned}
	progress := []domain.WorkOrderStatus{domain.WorkOrderStatusAssigned, domain.WorkOrderStatusInProgress}
	completed := []domain.WorkOrderStatus{domain.WorkOrderStatusCompleted}
	offsetAll := []showcaseDone{{steps: []string{"priprema"}}, {steps: []string{"stampa"}}, {steps: []string{"secenje"}}, {steps: []string{"pakovanje"}}}
	orders := []showcaseOrder{
		{ // 1: new, untouched -> reserved stock
			customer: "pekara", description: "Flajeri A5, 5.000 kom, 4+4", template: "offset", daysAgo: 2,
			assignee: ShowcaseOperatorUsername, priority: domain.WorkOrderPriorityNormal, price: 38000,
			scale: map[string]float64{"papir": 650, "boja": 2, "ploce": 4},
		},
		{ // 2: new digital
			customer: "pixel", description: "Vizit karte, 500 kom, kunstdruk 350g", template: "digital", daysAgo: 1,
			assignee: ShowcaseOperatorUsername, priority: domain.WorkOrderPriorityHigh, price: 7800,
			scale: map[string]float64{"papir": 40, "toner": 1},
		},
		{ // 3: in progress, actual paper above plan
			customer: "opstina", description: "Obrasci A4 u tri primerka, 10.000 kom", template: "offset", daysAgo: 9,
			assignee: ShowcaseOperatorUsername, priority: domain.WorkOrderPriorityNormal, price: 112000,
			scale:    map[string]float64{"papir": 2500, "boja": 6, "ploce": 8, "mak-stampa": 40, "mak-secenje": 25},
			statuses: progress,
			done: []showcaseDone{
				{steps: []string{"priprema"}},
				{steps: []string{"stampa"}, actual: map[string]float64{"papir": 2750, "boja": 6.5, "mak-stampa": 55}},
			},
		},
		{ // 4: in progress brochure, two parallel steps done
			customer: "slovo", description: "Katalog izdanja, 24 strane, 500 kom", template: "brosura", daysAgo: 6,
			assignee: ShowcaseAdminUsername, priority: domain.WorkOrderPriorityHigh, price: 96000,
			scale:    map[string]float64{"papir": 600, "boja": 6, "karton": 150, "zica": 2, "mak": 12},
			statuses: progress,
			done:     []showcaseDone{{steps: []string{"stampa-tabaka", "stampa-korica"}}},
		},
		{ // 5: completed offset
			customer: "volan", description: "Brošure i uputstva A4, 3.000 kom", template: "offset", daysAgo: 20,
			assignee: ShowcaseOperatorUsername, priority: domain.WorkOrderPriorityNormal, price: 54000,
			scale:    map[string]float64{"papir": 1100, "boja": 4, "ploce": 4, "mak-stampa": 18, "mak-secenje": 9},
			statuses: progress, done: offsetAll, finish: completed,
		},
		{ // 6: completed banner
			customer: "pixel", description: "Baner 4x2 m za sajam", template: "baner", daysAgo: 15,
			assignee: ShowcaseAdminUsername, priority: domain.WorkOrderPriorityUrgent, price: 9800,
			scale:    map[string]float64{"baner": 8, "otpad": 0.5},
			statuses: progress,
			done:     []showcaseDone{{steps: []string{"priprema"}}, {steps: []string{"stampa"}}, {steps: []string{"ojacanje"}}},
			finish:   completed,
		},
		{ // 7: big order, planned inputs exceed stock
			customer: "slovo", description: "Zbirka priča, 320 strana, tiraž 2.000", template: "offset", daysAgo: 3,
			assignee: ShowcaseOperatorUsername, priority: domain.WorkOrderPriorityHigh, price: 640000,
			scale:    map[string]float64{"papir": 8000, "boja": 30, "ploce": 24, "mak-stampa": 120, "mak-secenje": 60},
			statuses: assigned,
		},
		{ // 8: cancelled, must not reserve stock
			customer: "opstina", description: "Plakati A3, 200 kom", template: "digital", daysAgo: 12,
			assignee: ShowcaseOperatorUsername, priority: domain.WorkOrderPriorityLow, price: 6400,
			scale:    map[string]float64{"papir": 400, "toner": 1},
			statuses: []domain.WorkOrderStatus{domain.WorkOrderStatusCancelled},
		},
	}
	for i, order := range orders {
		number, err := b.createOrder(order)
		if err != nil {
			return fmt.Errorf("showcase order %d: %w", i+1, err)
		}
		switch i {
		case 2:
			result.InProgressOrder = number
		case 3:
			result.BrochureOrder = number
		case 6:
			result.ShortageOrder, result.ShortageArticle = number, b.articles["papir80"].Name
		case 7:
			result.CancelledOrder = number
		}
	}
	result.Orders = len(orders)
	result.BrochureTemplate = ShowcaseBrochureTemplate
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

func (b *showcaseBuilder) createOrder(o showcaseOrder) (string, error) {
	customer, location := b.customers[o.customer], b.locations[o.customer]
	issue := b.now.AddDate(0, 0, -o.daysAgo)
	due := issue.AddDate(0, 0, 10).Format("2006-01-02")
	assignee, price := o.assignee, o.price
	customerID, locationID := customer.ID, location.ID
	order, err := b.s.CreateWorkOrder(b.ctx, domain.CreateWorkOrderInput{
		CustomerID: &customerID, LocationID: &locationID, ClientName: customer.Name, ContactPerson: customer.ContactName,
		JobDescription: o.description, IssuedBy: ShowcaseAdminUsername, IssueDate: issue.Format("2006-01-02"), DueDate: &due,
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
		if _, err := b.s.ApplyProcessTemplate(b.ctx, order.ID, template.ID, ShowcaseAdminUsername); err != nil {
			return "", err
		}
	}
	// Scale planned quantities on the order's own graph (admin, structural).
	if err := b.editProcess(order.ID, ShowcaseAdminUsername, true, func(node *domain.ProcessNode) {
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

func (b *showcaseBuilder) editProcess(workOrderID, user string, structural bool, edit func(*domain.ProcessNode)) error {
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

func (b *showcaseBuilder) setStatuses(workOrderID string, statuses []domain.WorkOrderStatus) error {
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
