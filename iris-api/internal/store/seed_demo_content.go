package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Demo content: everything the demo organization shows beyond the fixture
// logins and master data. SeedDemoFromFixtures lays down the fixture users,
// customers and locations first, then calls seedDemoContent to turn every
// module on and add a curated data set on top. The content goes through the
// same store methods the HTTP API uses (module switch, settings, catalog, stock
// count/receipt, process templates, work orders, process updates, attendance,
// plans), so stock movements, cost capture, timelines and plans come from the
// real logic rather than hand-inserted rows. The one exception is the invoiced
// history (seed_demo_history.go), written directly so it can carry dates from
// the past year.
//
// The files split the content by area:
//
//	seed_demo_content.go   orchestration, settings, customers, catalog, stock, templates
//	seed_demo_history.go   a year of completed/invoiced orders (direct writes)
//	seed_demo_orders.go    live process-driven orders and their timelines
//	seed_demo_planning.go  machines, working hours, attendance, day plans, platform
//	seed_demo_logo.go      the generated sign-in logo
//
// Every date is relative to the seed run, so the dashboard signals (overdue,
// due today, this week, unassigned), the planning horizon and the sign-in
// history stay meaningful whenever the seed runs.

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

	// demoFirmName is the organization's display name in the app header.
	demoFirmName = "Demo Štamparija"

	// Custom picklist values the demo adds (Podešavanja → Šifarnici).
	demoDeliveryCourier = "kurir" // deliveryMethod: "Kurir (Bex)"
	demoUnitSheet       = "tabak" // invoiceUnit: "Tabak"
)

// demoSeedActor is recorded in the platform activity log for the platform-level
// rows the demo seed writes (announcement, organization notes), like the irisctl
// offboarding commands do.
var demoSeedActor = AuditActor{AdminID: "irisctl", AdminUsername: "irisctl"}

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
// summary. Order numbers are resolved at creation time. When AlreadySeeded is
// true the content was already present and left untouched, so the other fields
// are zero.
type DemoSeedResult struct {
	AlreadySeeded bool
	Customers     int
	Templates     int
	HistoryOrders int      // completed/invoiced orders from the past year
	Orders        int      // live process-driven orders
	LowArticles   []string // names of articles flagged low
	MachineTypes  int      // planning: machine types and units added
	Machines      int

	// Orders worth opening, by number.
	ShortageOrder    string // open order whose planned input exceeds on-hand stock
	InProgressOrder  string // in progress, actual quantity above planned
	BrochureOrder    string // brochure with two parallel steps done
	BrochureTemplate string
	CancelledOrder   string // cancelled, reserves no stock
	CostReviewOrder  string // unassigned, with a line whose cost is not captured
	OverdueOrder     string // urgent and past its due date
	DueTodayOrder    string // due today
	SignedOrder      string // completed, signed off by the customer, with customer notes
	InvoicedOrder    string // invoiced and paid
	SkippedStepOrder string // in progress with a skipped step

	// Planning: dates with a published plan and the date with only a draft.
	PublishedPlanDates []string
	DraftPlanDate      string
}

// seedDemoContent turns on all four modules for the demo tenant (already in
// ctx) and adds the curated content. It assumes the fixture seed has already
// run, so it creates only the operater login (the admin login comes from the
// fixtures). now anchors every date; zero means time.Now().
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
	location, err := time.LoadLocation(domain.DefaultPlanningTimeZone)
	if err != nil {
		return DemoSeedResult{}, err
	}
	operatorPw := demoOperatorPassword
	if operatorPassword != "" {
		operatorPw = operatorPassword
	}
	b := &demoContentBuilder{
		s: s, slug: slug, ctx: ctx, now: now.In(location), location: location, operatorPassword: operatorPw,
		articles:     map[string]domain.CatalogItem{},
		services:     map[string]domain.CatalogItem{},
		customers:    map[string]domain.Customer{},
		locations:    map[string]domain.Location{},
		templates:    map[string]*domain.ProcessTemplate{},
		machineTypes: map[string]string{},
		users:        map[string]domain.User{},
		orderNumbers: map[string]string{},
		invoiceSeq:   map[int]int{},
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
	now              time.Time // local to location
	location         *time.Location
	operatorPassword string
	articles         map[string]domain.CatalogItem
	services         map[string]domain.CatalogItem
	customers        map[string]domain.Customer // demo key -> customer (content and fixture ones)
	locations        map[string]domain.Location // demo key -> first location
	templates        map[string]*domain.ProcessTemplate
	machineTypes     map[string]string // demo key -> machine type ID
	machineCount     int
	users            map[string]domain.User // username -> user
	liveOrders       []string               // ids of the live orders, for backdating
	orderNumbers     map[string]string      // live order key -> order number
	invoiceSeq       map[int]int            // invoice numbers per year, continuing from history into live orders
	publishedPlans   []string               // dates with a published plan
	draftPlan        string                 // date with only a draft
}

func (b *demoContentBuilder) build(result *DemoSeedResult) error {
	steps := []func() error{
		b.userAccounts, b.modules, b.settings, b.customersAndLocations, b.catalog, b.stock,
		b.machines, b.processTemplates, b.history, b.workOrders, b.stockCount, b.backdateLiveOrders,
		b.attendance, b.plans, b.platform,
	}
	for _, step := range steps {
		if err := step(); err != nil {
			return err
		}
	}
	return b.describe(result)
}

// day returns the local date offset days from now, as YYYY-MM-DD.
func (b *demoContentBuilder) day(offset int) string {
	return b.now.AddDate(0, 0, offset).Format("2006-01-02")
}

// at returns the local clock time on the date offset days from now, in UTC
// RFC 3339 as the store writes timestamps.
func (b *demoContentBuilder) at(offset int, hour, minute int) string {
	d := b.now.AddDate(0, 0, offset)
	return time.Date(d.Year(), d.Month(), d.Day(), hour, minute, 0, 0, b.location).UTC().Format(time.RFC3339)
}

func str(v string) *string   { return &v }
func num(v float64) *float64 { return &v }
func integer(v int) *int     { return &v }

// userAccounts creates the operater login and indexes every user by username.
func (b *demoContentBuilder) userAccounts() error {
	id := "user-" + b.slug + "-" + demoOperatorUsername
	if err := b.s.CreateUser(b.ctx, id, demoOperatorUsername, b.operatorPassword, domain.RoleUser, true); err != nil {
		return fmt.Errorf("demo user %s: %w", demoOperatorUsername, err)
	}
	users, err := b.s.ListUsers(b.ctx)
	if err != nil {
		return err
	}
	for _, user := range users {
		b.users[user.Username] = user
	}
	return nil
}

func (b *demoContentBuilder) modules() error {
	on := true
	if _, err := b.s.SetTenantModules(b.ctx, b.slug, domain.OrganizationModulesUpdate{Stock: &on, Processes: &on, Planning: &on, Attendance: &on}); err != nil {
		return fmt.Errorf("demo modules: %w", err)
	}
	return nil
}

// settings sets the organization settings away from their defaults where that
// shows in the app (firm name, the extra shipping options on the form, a
// changeable priority, invoices as the default document), adds custom picklist
// values and the sign-in logo.
func (b *demoContentBuilder) settings() error {
	firm := demoFirmName
	showShipping := true
	if _, err := b.s.UpdateOrganizationSettings(b.ctx, domain.OrganizationSettingsUpdate{
		FirmName:            &firm,
		ShowShippingOptions: &showShipping,
		BillingDefaults:     &domain.BillingDefaults{DocumentType: domain.BillingDocumentTypeInvoice},
		PriorityDefaults:    &domain.PriorityDefaults{Priority: domain.WorkOrderPriorityNormal, AllowOverride: true},
	}); err != nil {
		return fmt.Errorf("demo settings: %w", err)
	}
	for _, value := range []domain.EnumValueInput{
		{Field: domain.EnumFieldDeliveryMethod, Value: demoDeliveryCourier, Label: "Kurir (Bex)", SortOrder: 10},
		{Field: domain.EnumFieldInvoiceUnit, Value: demoUnitSheet, Label: "Tabak", SortOrder: 10},
		{Field: domain.EnumFieldPostagePaymentType, Value: "mesecni", Label: "Mesečni obračun", SortOrder: 10},
	} {
		if _, err := b.s.CreateEnumValue(b.ctx, value); err != nil {
			return fmt.Errorf("demo enum %s/%s: %w", value.Field, value.Value, err)
		}
	}
	logo, err := demoLoginLogoPNG()
	if err != nil {
		return err
	}
	if _, err := b.s.SetLoginLogo(b.ctx, domain.LoginLogoUpload{ContentType: "image/png", Data: logo}); err != nil {
		return fmt.Errorf("demo login logo: %w", err)
	}
	return nil
}

// demoCustomer is one content customer with its identifiers, contacts and
// delivery locations. The first location is the one orders use.
type demoCustomer struct {
	key, name, contact, email, phone string
	pib, mb                          string
	emails                           []domain.CustomerEmail
	contacts                         []domain.CustomerContact
	locations                        []struct{ name, address string }
}

var demoCustomers = []demoCustomer{
	{key: "pekara", name: "Pekara Zlatni klas", contact: "Milan Jovanović", email: "milan@zlatniklas.example", phone: "021/555-101",
		pib: "102345675", mb: "20123456",
		emails:   []domain.CustomerEmail{{Email: "racuni@zlatniklas.example", Label: str("Računovodstvo")}},
		contacts: []domain.CustomerContact{{Name: "Sanja Jović", Email: str("sanja@zlatniklas.example"), Phone: str("021/555-102"), Role: str("Knjigovođa")}},
		locations: []struct{ name, address string }{
			{"Pekara Centar", "Bulevar oslobođenja 12, Novi Sad"}, {"Pekara Liman", "Narodnog fronta 45, Novi Sad"},
		}},
	{key: "opstina", name: "Opština Novi Grad", contact: "Jelena Marković", email: "jelena.markovic@novigrad.example", phone: "021/555-202",
		pib: "104567899", mb: "08123456",
		emails:   []domain.CustomerEmail{{Email: "pisarnica@novigrad.example", Label: str("Pisarnica")}, {Email: "nabavka@novigrad.example", Label: str("Javne nabavke")}},
		contacts: []domain.CustomerContact{{Name: "Zoran Lukić", Email: str("zoran.lukic@novigrad.example"), Phone: str("021/555-203"), Role: str("Šef nabavke")}},
		locations: []struct{ name, address string }{
			{"Pisarnica", "Trg slobode 1, Novi Grad"}, {"Mesna kancelarija Rakovac", "Glavna 8, Rakovac"},
		}},
	{key: "pixel", name: "Agencija Pixel", contact: "Nikola Ilić", email: "nikola@pixel.example", phone: "064/555-303",
		pib: "105678905", mb: "21234567",
		contacts:  []domain.CustomerContact{{Name: "Tamara Kostić", Email: str("tamara@pixel.example"), Role: str("Art direktor")}},
		locations: []struct{ name, address string }{{"Studio", "Zmaj Jovina 8, Novi Sad"}}},
	{key: "slovo", name: "Knjižara Slovo", contact: "Ana Petrović", email: "ana@slovo.example", phone: "011/555-404",
		pib: "106789015", mb: "17345678",
		emails:    []domain.CustomerEmail{{Email: "izdavastvo@slovo.example", Label: str("Izdavaštvo")}},
		locations: []struct{ name, address string }{{"Knjižara Slovo", "Knez Mihailova 20, Beograd"}, {"Magacin Zemun", "Cara Dušana 110, Zemun"}}},
	{key: "volan", name: "Auto-škola Volan", contact: "Dragan Savić", email: "dragan@volan.example", phone: "021/555-505",
		pib: "107890123", mb: "63456789",
		locations: []struct{ name, address string }{{"Sedište", "Futoška 45, Novi Sad"}}},
	{key: "vinarija", name: "Vinarija Dolina", contact: "Petar Vuković", email: "petar@vinarija-dolina.example", phone: "022/555-606",
		pib: "108901233", mb: "20567890",
		contacts:  []domain.CustomerContact{{Name: "Mila Vuković", Email: str("mila@vinarija-dolina.example"), Phone: str("022/555-607"), Role: str("Marketing")}},
		locations: []struct{ name, address string }{{"Vinarija", "Vinogradarska 3, Sremski Karlovci"}}},
	{key: "hotel", name: "Hotel Panorama", contact: "Ivana Đorđević", email: "recepcija@panorama.example", phone: "021/555-707",
		pib: "109012347", mb: "20678901",
		emails:    []domain.CustomerEmail{{Email: "marketing@panorama.example", Label: str("Marketing")}},
		locations: []struct{ name, address string }{{"Hotel", "Fruškogorska 15, Novi Sad"}}},
	{key: "dentis", name: "Ordinacija Dentis", contact: "dr Marija Simić", email: "ordinacija@dentis.example", phone: "021/555-808",
		pib: "110123454", mb: "64567890",
		locations: []struct{ name, address string }{{"Ordinacija", "Maksima Gorkog 22, Novi Sad"}}},
}

// customersAndLocations adds the content customers (with PIB and matični broj,
// extra e-mail addresses, contacts and one or two locations) and indexes the
// fixture customers by a key as well, so orders can spread across all of them.
func (b *demoContentBuilder) customersAndLocations() error {
	for _, c := range demoCustomers {
		customer, err := b.s.UpsertCustomer(b.ctx, domain.Customer{
			ID: "cust-" + b.slug + "-" + c.key, Name: c.name,
			ContactName: str(c.contact), Email: str(c.email), Phone: str(c.phone),
			Pib: str(c.pib), Mb: str(c.mb), Emails: c.emails, Contacts: c.contacts,
		})
		if err != nil {
			return fmt.Errorf("demo customer %s: %w", c.key, err)
		}
		b.customers[c.key] = *customer
		for i, loc := range c.locations {
			id := "loc-" + b.slug + "-" + c.key
			if i > 0 {
				id = fmt.Sprintf("%s-%d", id, i+1)
			}
			location, err := b.s.UpsertLocation(b.ctx, domain.Location{ID: id, CustomerID: customer.ID, Name: loc.name, Address: str(loc.address)})
			if err != nil {
				return fmt.Errorf("demo location %s: %w", c.key, err)
			}
			if i == 0 {
				b.locations[c.key] = *location
			}
		}
	}
	// The fixture customers (Firma Doo, Kompanija AB, …) are keyed by their
	// name's first word in lower case: "firma", "kompanija", "studio",
	// "agencija", "tehnoservis".
	all, err := b.s.Customers(b.ctx, CustomerQuery{Limit: 500})
	if err != nil {
		return err
	}
	for _, customer := range all.Items {
		if strings.HasPrefix(customer.ID, "cust-"+b.slug+"-") {
			continue
		}
		key := strings.ToLower(strings.Fields(customer.Name)[0])
		b.customers[key] = customer
		locations, err := b.s.Locations(b.ctx, customer.ID)
		if err != nil {
			return err
		}
		if len(locations) > 0 {
			b.locations[key] = locations[0]
		}
	}
	return nil
}

type demoArticle struct {
	key, code, name, unit string
	purchase, sale        float64 // 0 = none
	minStock, opening     float64
	barcode, taxGroup     string
	description           string
	inactive              bool
}

var demoArticles = []demoArticle{
	{key: "papir80", code: "PAP-80-A3", name: "Papir 80g A3", unit: "tabak", purchase: 12.5, sale: 18, minStock: 1000, opening: 6500, barcode: "3830012345011", taxGroup: "20", description: "Ofsetni papir 80 g/m², beli, 297×420 mm."},
	{key: "kunstdruk", code: "PAP-KD-135", name: "Papir kunstdruk 135g SRA3", unit: "tabak", purchase: 24, sale: 35, minStock: 500, opening: 1500, barcode: "3830012345028", taxGroup: "20", description: "Kunstdruk sjajni 135 g/m², 320×450 mm."},
	{key: "karton", code: "KAR-300", name: "Karton 300g", unit: "tabak", purchase: 38, sale: 55, minStock: 100, opening: 400, barcode: "3830012345035", taxGroup: "20"},
	{key: "boja", code: "BOJ-CMYK", name: "Boja CMYK", unit: "kg", purchase: 1800, minStock: 10, opening: 14, taxGroup: "20", description: "Set procesnih boja za offset (C, M, Y, K)."},
	{key: "ploca", code: "PLO-OFF", name: "Offset ploča", unit: "kom", purchase: 650, minStock: 40, opening: 100, taxGroup: "20"},
	{key: "toner", code: "TON-DIG", name: "Toner", unit: "kom", purchase: 9500, minStock: 5, opening: 3, barcode: "4902345678901", taxGroup: "20", description: "Toner za Konica Minolta C14000, jedan set."},
	{key: "zica", code: "ZIC-POV", name: "Žica za povez", unit: "kalem", purchase: 1400, minStock: 2, opening: 6, taxGroup: "20"},
	{key: "spirala", code: "SPI-PLA", name: "Spirala plastična 12 mm", unit: "kom", purchase: 25, sale: 60, minStock: 100, opening: 350, taxGroup: "20"},
	{key: "baner", code: "BAN-PVC-510", name: "Banner PVC 510g", unit: "m2", purchase: 420, sale: 900, minStock: 50, opening: 100, taxGroup: "20"},
	{key: "rollup", code: "KOM-ROLLUP", name: "Roll-up stalak 85×200", unit: "kom", purchase: 3200, sale: 6500, minStock: 3, opening: 5, barcode: "3830012345042", taxGroup: "20", description: "Aluminijumski roll-up mehanizam sa torbom."},
	{key: "folija", code: "FOL-LAM", name: "Folija za laminaciju 125 µ", unit: "rolna", purchase: 1100, minStock: 2, opening: 1.5, taxGroup: "20"},
	{key: "makulatura", code: "MAK-001", name: "Makulatura", unit: "tabak"},
	{key: "otpad", code: "OTP-BAN", name: "Otpad bannera", unit: "m2"},
	// Candidates for Katalog → Čišćenje (missing prices) and an inactive article.
	{key: "kesa", code: "KES-PAP", name: "Kesa papirna sa ručkom", unit: "kom", sale: 40, taxGroup: "20", description: "Nabavna cena još nije uneta."},
	{key: "papir80a4", code: "PAP-80-A4", name: "Papir 80g A4 (stari šifarnik)", unit: "ris", purchase: 480, inactive: true},
}

var demoServices = []struct {
	key, code, name, unit string
	cost, price           float64 // cost = cena rada; 0 price = missing
}{
	{"priprema", "USL-PRIPREMA", "Grafička priprema", "sat", 900, 2500},
	{"offset", "USL-OFFSET", "Offset štampa", "kom", 2.4, 6},
	{"digital", "USL-DIGITAL", "Digitalna štampa", "kom", 7, 18},
	{"knjigovez", "USL-KNJIGOVEZ", "Knjigovezivanje", "kom", 18, 45},
	{"ploter", "USL-PLOTER", "Štampa velikog formata", "m2", 650, 1500},
	{"dorada", "USL-DORADA", "Dorada (sečenje, bigovanje)", "kom", 1.2, 3},
	{"dostava", "USL-DOSTAVA", "Dostava", "kom", 600, 1200},
	{"laminacija", "USL-LAMIN", "Laminacija (stari šifarnik)", "kom", 0, 0}, // cleanup candidate
}

// catalog adds the services (with the cost of labor, so service profit shows
// on the dashboard) and the articles, then schedules a kunstdruk price rise
// two weeks out so its "Istorija cena" shows a pending period.
func (b *demoContentBuilder) catalog() error {
	for _, svc := range demoServices {
		item := domain.CatalogItem{
			ID: "cat-" + b.slug + "-" + strings.ToLower(svc.code), Code: svc.code, Name: svc.name, Unit: svc.unit,
			Kind: domain.CatalogItemKindService, IsActive: true,
		}
		if svc.cost > 0 {
			item.PurchasePrice = num(svc.cost)
		}
		if svc.price > 0 {
			item.SalePrice = num(svc.price)
		}
		saved, err := b.s.UpsertCatalogItem(b.ctx, item, "")
		if err != nil {
			return fmt.Errorf("demo service %s: %w", svc.code, err)
		}
		b.services[svc.key] = *saved
	}
	for _, a := range demoArticles {
		item := domain.CatalogItem{
			ID: "cat-" + b.slug + "-" + a.key, Code: a.code, Name: a.name, Unit: a.unit,
			Kind: domain.CatalogItemKindArticle, IsActive: !a.inactive,
		}
		if a.purchase > 0 {
			item.PurchasePrice = num(a.purchase)
		}
		if a.sale > 0 {
			item.SalePrice = num(a.sale)
		}
		if a.minStock > 0 {
			item.MinStock = num(a.minStock)
		}
		if a.barcode != "" {
			item.Barcode = str(a.barcode)
		}
		if a.taxGroup != "" {
			item.TaxGroup = str(a.taxGroup)
		}
		if a.description != "" {
			item.Description = str(a.description)
		}
		saved, err := b.s.UpsertCatalogItem(b.ctx, item, "")
		if err != nil {
			return fmt.Errorf("demo article %s: %w", a.code, err)
		}
		b.articles[a.key] = *saved
	}
	// Scheduled price change: the supplier announced a rise from two weeks on.
	kd := b.articles["kunstdruk"]
	kd.PurchasePrice, kd.SalePrice = num(26.5), num(38)
	if _, err := b.s.UpsertCatalogItem(b.ctx, kd, b.day(14)); err != nil {
		return fmt.Errorf("demo scheduled price: %w", err)
	}
	return nil
}

// stock posts the opening balance as a stock count (history shows "Početno
// stanje") and four goods receipts on different articles.
func (b *demoContentBuilder) stock() error {
	counts := make([]domain.StockCountLine, 0, len(demoArticles))
	for _, a := range demoArticles {
		if a.opening > 0 {
			counts = append(counts, domain.StockCountLine{CatalogItemID: b.articles[a.key].ID, CountedQuantity: a.opening})
		}
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
		{DocumentRef: "OT-2026-140 Papirdom", Note: "Karton i spirale", Lines: []domain.StockReceiptLine{line("karton", 200), line("spirala", 200)}},
	} {
		if _, err := b.s.PostStockReceipt(b.ctx, r, demoOperatorUsername); err != nil {
			return fmt.Errorf("demo receipt %s: %w", r.DocumentRef, err)
		}
	}
	return nil
}

// stockCount posts a monthly count after the live orders consumed stock: the
// kunstdruk count comes out short and the karton count finds a few more
// sheets, so the ledger shows adjustments next to consumption.
func (b *demoContentBuilder) stockCount() error {
	levels, err := b.s.StockLevels(b.ctx, StockLevelQuery{Limit: 500})
	if err != nil {
		return err
	}
	onHand := map[string]float64{}
	for _, level := range levels.Items {
		onHand[level.CatalogItemID] = level.OnHand
	}
	kd, karton := b.articles["kunstdruk"].ID, b.articles["karton"].ID
	if _, err := b.s.PostStockCount(b.ctx, domain.StockCountInput{Note: "Mesečni popis", Lines: []domain.StockCountLine{
		{CatalogItemID: kd, CountedQuantity: onHand[kd] - 12},
		{CatalogItemID: karton, CountedQuantity: onHand[karton] + 3},
	}}, demoAdminUsername); err != nil {
		return fmt.Errorf("demo stock count: %w", err)
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

// item adds an input (stack index above the step), byproduct (below) or
// product. qty is per unit of the order (D-028): the server multiplies it by
// the order's jobDetails.quantity wherever a planned amount is used.
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

// plan sets a step's planning fields: machine type (demo key, "" = none),
// crew size, setup minutes and minutes per unit of the order's quantity.
func (g *graphBuilder) plan(id, machineType string, crew int, setup, perUnit float64) {
	for i := range g.graph.Nodes {
		node := &g.graph.Nodes[i]
		if node.ID != id || node.Kind != domain.ProcessNodeStep {
			continue
		}
		node.MachineTypeID = g.b.machineTypes[machineType]
		node.CrewSize, node.SetupMinutes, node.MinutesPerUnit = &crew, &setup, &perUnit
		return
	}
	panic("demo graph: no step " + id)
}

// starts marks steps as starting steps; finals marks products/byproducts as
// final outputs (the flags a flow with several starts and outputs carries).
func (g *graphBuilder) starts(ids ...string) {
	g.flag(ids, func(n *domain.ProcessNode) { n.Start = true })
}
func (g *graphBuilder) finals(ids ...string) {
	g.flag(ids, func(n *domain.ProcessNode) { n.Final = true })
}

func (g *graphBuilder) flag(ids []string, set func(*domain.ProcessNode)) {
	for _, id := range ids {
		found := false
		for i := range g.graph.Nodes {
			if g.graph.Nodes[i].ID == id {
				set(&g.graph.Nodes[i])
				found = true
			}
		}
		if !found {
			panic("demo graph: no node " + id)
		}
	}
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
			g.item(in, "ploce", "Offset ploče", "ploca", 0.001, 0, lane-demoInRow)
			g.item(in, "papir", "Papir 80g A3", "papir80", 0.13, 0.63, lane-demoInRow)
			g.item(in, "boja", "Boja CMYK", "boja", 0.0005, 1.37, lane-demoInRow)
			g.item(by, "mak-stampa", "Makulatura (štampa)", "makulatura", 0.005, 1, lane+demoRow)
			g.item(by, "mak-secenje", "Makulatura (sečenje)", "makulatura", 0.003, 2, lane+demoRow)
			g.item(pr, "otisci", "Gotovi otisci", "", 0, 4, lane)
			g.edges("priprema", "stampa", "stampa", "secenje", "secenje", "pakovanje", "pakovanje", "otisci",
				"ploce", "priprema", "papir", "stampa", "boja", "stampa", "stampa", "mak-stampa", "secenje", "mak-secenje")
			g.plan("priprema", "ctp", 1, 30, 0)
			g.plan("stampa", "offset", 2, 30, 0.02)
			g.plan("secenje", "sekac", 1, 15, 0.006)
			g.plan("pakovanje", "", 1, 15, 0.004)
			g.starts("priprema")
			g.finals("otisci")
		}},
		{"digital", "Digitalna štampa", "Kratke serije na digitalnoj mašini.", false, func(g *graphBuilder) {
			g.step("priprema", "Priprema fajla", 0, lane)
			g.step("stampa", "Štampa", 1, lane)
			g.step("dorada", "Dorada", 2, lane)
			g.item(in, "papir", "Papir kunstdruk 135g", "kunstdruk", 0.1, 0.63, lane-demoInRow)
			g.item(in, "toner", "Toner", "toner", 0.002, 1.37, lane-demoInRow)
			g.item(pr, "otisci", "Digitalni otisci", "", 0, 3, lane)
			g.edges("priprema", "stampa", "stampa", "dorada", "dorada", "otisci", "papir", "stampa", "toner", "stampa")
			g.plan("priprema", "", 1, 20, 0)
			g.plan("stampa", "digital", 1, 10, 0.05)
			g.plan("dorada", "sekac", 1, 10, 0.02)
			g.starts("priprema")
			g.finals("otisci")
		}},
		{"brosura", demoBrochureTemplate, "Brošura sa međuproizvodom (štampani tabaci) i paralelnom štampom korica.", false, func(g *graphBuilder) {
			g.step("stampa-tabaka", "Štampa tabaka", 0, lane)
			g.step("savijanje", "Savijanje", 2, lane)
			g.step("sivenje", "Šivenje", 3, lane)
			g.step("obrezivanje", "Obrezivanje", 4, lane)
			g.step("stampa-korica", "Štampa korica", 1, lane+320)
			g.item(in, "papir", "Papir kunstdruk 135g", "kunstdruk", 1.2, -0.37, lane-demoInRow)
			g.item(in, "boja", "Boja CMYK", "boja", 0.012, 0.37, lane-demoInRow)
			g.item(pr, "tabaci", "Štampani tabaci", "", 0, 1, lane)
			g.item(in, "karton", "Karton 300g", "karton", 0.3, 1, lane+320-demoInRow)
			g.item(in, "zica", "Žica za povez", "zica", 0.004, 3, lane-demoInRow)
			g.item(by, "mak", "Makulatura", "makulatura", 0.024, 4, lane+demoRow)
			g.item(pr, "brosure", "Brošure", "", 0, 5, lane)
			g.edges("stampa-tabaka", "tabaci", "tabaci", "savijanje", "savijanje", "sivenje", "stampa-korica", "sivenje",
				"sivenje", "obrezivanje", "obrezivanje", "brosure", "obrezivanje", "mak",
				"papir", "stampa-tabaka", "boja", "stampa-tabaka", "karton", "stampa-korica", "zica", "sivenje")
			g.plan("stampa-tabaka", "offset", 2, 40, 0.3)
			g.plan("stampa-korica", "digital", 1, 15, 0.05)
			g.plan("savijanje", "savijacica", 1, 20, 0.12)
			g.plan("sivenje", "povez", 2, 30, 0.15)
			g.plan("obrezivanje", "sekac", 1, 10, 0.03)
			g.starts("stampa-tabaka", "stampa-korica")
			g.finals("brosure")
		}},
		{"baner", "Veliki format (baner)", "Štampa banera na PVC-u sa ojačanjem i ringlovanjem.", false, func(g *graphBuilder) {
			g.step("priprema", "Priprema", 0, lane)
			g.step("stampa", "Štampa", 1, lane)
			g.step("ojacanje", "Ojačanje i ringlovanje", 2, lane)
			g.item(in, "baner", "Banner PVC 510g", "baner", 8, 1, lane-demoInRow)
			g.item(by, "otpad", "Otpad bannera", "otpad", 0.5, 1, lane+demoRow)
			g.item(pr, "gotov", "Baner", "", 0, 3, lane)
			g.edges("priprema", "stampa", "stampa", "ojacanje", "ojacanje", "gotov", "baner", "stampa", "stampa", "otpad")
			g.plan("priprema", "", 1, 30, 0)
			g.plan("stampa", "ploter", 1, 15, 40)
			g.plan("ojacanje", "", 2, 10, 25)
			g.starts("priprema")
			g.finals("gotov")
		}},
		// Two starting steps (sheets and backing board printed in parallel) and
		// two final outputs (the calendars and the board offcuts).
		{"kalendar", "Zidni kalendar", "Dva početka (listovi i podloga) koji se spajaju na sečenju; kalendari i ostaci kartona su konačni izlazi.", false, func(g *graphBuilder) {
			g.step("stampa-listova", "Štampa listova", 0, lane)
			g.step("stampa-podloge", "Štampa podloge", 0, lane+320)
			g.step("secenje", "Sečenje", 1, lane)
			g.step("povez", "Spiralni povez", 2, lane)
			g.item(in, "papir", "Papir kunstdruk 135g", "kunstdruk", 6.5, 0, lane-demoInRow)
			g.item(in, "karton", "Karton 300g", "karton", 1, -0.37, lane+320-demoInRow)
			g.item(in, "toner", "Toner", "toner", 0.007, 0.37, lane+320-demoInRow)
			g.item(in, "spirala", "Spirala plastična", "spirala", 1, 2, lane-demoInRow)
			g.item(by, "ostaci", "Ostaci kartona", "makulatura", 0.13, 1, lane+demoRow)
			g.item(pr, "kalendari", "Kalendari", "", 0, 3, lane)
			g.edges("stampa-listova", "secenje", "stampa-podloge", "secenje", "secenje", "povez", "povez", "kalendari",
				"papir", "stampa-listova", "karton", "stampa-podloge", "toner", "stampa-podloge", "spirala", "povez", "secenje", "ostaci")
			g.plan("stampa-listova", "digital", 1, 15, 0.6)
			g.plan("stampa-podloge", "digital", 1, 10, 0.1)
			g.plan("secenje", "sekac", 1, 15, 0.2)
			g.plan("povez", "spirala", 1, 10, 0.8)
			g.starts("stampa-listova", "stampa-podloge")
			g.finals("kalendari", "ostaci")
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

// patch applies a partial update to a work order through the real update path
// (timeline diffs, cost capture, status rules).
func (b *demoContentBuilder) patch(workOrderID string, fields map[string]any) error {
	changes := domain.UpdateWorkOrderInput{}
	for key, value := range fields {
		raw, err := json.Marshal(value)
		if err != nil {
			return err
		}
		changes[key] = raw
	}
	_, err := b.s.UpdateWorkOrder(b.ctx, workOrderID, changes)
	return err
}

func (b *demoContentBuilder) setStatuses(workOrderID string, statuses []domain.WorkOrderStatus) error {
	for _, status := range statuses {
		if err := b.patch(workOrderID, map[string]any{"status": status}); err != nil {
			return fmt.Errorf("set status %s: %w", status, err)
		}
	}
	return nil
}

// describe fills the CLI summary counts that are only known at the end.
func (b *demoContentBuilder) describe(result *DemoSeedResult) error {
	result.Customers = len(b.customers)
	result.Templates = len(b.templates)
	result.BrochureTemplate = demoBrochureTemplate
	result.MachineTypes, result.Machines = len(b.machineTypes), b.machineCount
	result.HistoryOrders = len(demoHistoryOrders())
	result.Orders = len(b.liveOrders)
	result.ShortageOrder = b.orderNumbers["zbirka"]
	result.InProgressOrder = b.orderNumbers["obrasci"]
	result.BrochureOrder = b.orderNumbers["katalog"]
	result.CancelledOrder = b.orderNumbers["plakati"]
	result.CostReviewOrder = b.orderNumbers["meni"]
	result.OverdueOrder = b.orderNumbers["etikete"]
	result.DueTodayOrder = b.orderNumbers["katalog"]
	result.SignedOrder = b.orderNumbers["brosure"]
	result.InvoicedOrder = b.orderNumbers["baner"]
	result.SkippedStepOrder = b.orderNumbers["pozivnice"]
	result.PublishedPlanDates = b.publishedPlans
	result.DraftPlanDate = b.draftPlan
	levels, err := b.s.StockLevels(b.ctx, StockLevelQuery{Limit: 500})
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
