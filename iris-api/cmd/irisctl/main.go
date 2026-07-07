package main

import (
	"context"
	"encoding/csv"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

const defaultDatabasePath = "./data/iris.db"

func main() {
	log.SetFlags(0)
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	ctx := context.Background()
	switch os.Args[1] {
	case "migrate":
		sqliteStore := mustOpen(ctx, dbPathFromEnv())
		defer sqliteStore.Close()
		fmt.Println("Migracije su primenjene.")
	case "seed-demo":
		cmd := flag.NewFlagSet("seed-demo", flag.ExitOnError)
		fixtureDir := cmd.String("fixtures", "testdata/fixtures", "putanja do JSON demo podataka")
		_ = cmd.Parse(os.Args[2:])
		sqliteStore := mustOpen(ctx, dbPathFromEnv())
		defer sqliteStore.Close()
		must(store.SeedDemoFromFixtures(ctx, sqliteStore, *fixtureDir))
		fmt.Println("Demo podaci su upisani u SQLite bazu.")
	case "create-tenant":
		cmd := flag.NewFlagSet("create-tenant", flag.ExitOnError)
		slug := cmd.String("slug", "", "oznaka organizacije (za prijavu)")
		name := cmd.String("name", "", "naziv organizacije")
		id := cmd.String("id", "", "ID organizacije (opciono)")
		adminUsername := cmd.String("admin-username", "", "korisničko ime prvog administratora")
		adminPassword := cmd.String("admin-password", "", "lozinka prvog administratora")
		_ = cmd.Parse(os.Args[2:])
		if *slug == "" || *name == "" {
			log.Fatal("koristite --slug i --name")
		}
		sqliteStore := mustOpen(ctx, dbPathFromEnv())
		defer sqliteStore.Close()
		if *id == "" {
			*id = "tenant-" + strings.ToLower(strings.TrimSpace(*slug))
		}
		tenant, err := sqliteStore.CreateTenant(ctx, *id, *slug, *name)
		must(err)
		fmt.Printf("Organizacija %q (%s) je kreirana.\n", tenant.Name, tenant.Slug)
		if *adminUsername != "" && *adminPassword != "" {
			tenantCtx := store.ContextWithTenant(ctx, tenant.ID)
			adminID := userID(tenant.Slug, *adminUsername)
			must(sqliteStore.CreateUser(tenantCtx, adminID, *adminUsername, *adminPassword, domain.RoleAdmin, false))
			fmt.Printf("Administrator %s je sačuvan.\n", *adminUsername)
		}
	case "create-user":
		cmd := flag.NewFlagSet("create-user", flag.ExitOnError)
		tenantSlug := cmd.String("tenant", "", "oznaka organizacije")
		id := cmd.String("id", "", "ID korisnika")
		username := cmd.String("username", "", "korisničko ime")
		password := cmd.String("password", "", "lozinka")
		role := cmd.String("role", "user", "admin ili user")
		_ = cmd.Parse(os.Args[2:])
		sqliteStore := mustOpen(ctx, dbPathFromEnv())
		defer sqliteStore.Close()
		tenantCtx := mustTenantContext(ctx, sqliteStore, *tenantSlug)
		if *id == "" {
			*id = userID(strings.TrimSpace(*tenantSlug), *username)
		}
		must(sqliteStore.CreateUser(tenantCtx, *id, *username, *password, domain.UserRole(*role), false))
		fmt.Printf("Korisnik %s je sačuvan.\n", *username)
	case "backup":
		cmd := flag.NewFlagSet("backup", flag.ExitOnError)
		out := cmd.String("out", "", "putanja izlazne .db kopije")
		_ = cmd.Parse(os.Args[2:])
		if *out == "" {
			*out = filepath.Join("backups", "iris-"+time.Now().UTC().Format("20060102-150405")+".db")
		}
		sqliteStore := mustOpen(ctx, dbPathFromEnv())
		defer sqliteStore.Close()
		must(sqliteStore.Backup(ctx, *out))
		fmt.Printf("Backup je sačuvan: %s\n", *out)
	case "import-csv":
		cmd := flag.NewFlagSet("import-csv", flag.ExitOnError)
		tenantSlug := cmd.String("tenant", "", "oznaka organizacije")
		dir := cmd.String("dir", ".", "folder sa CSV fajlovima")
		dryRun := cmd.Bool("dry-run", false, "samo proveri CSV podatke")
		apply := cmd.Bool("apply", false, "upiši CSV podatke u bazu")
		_ = cmd.Parse(os.Args[2:])
		if !*dryRun && !*apply {
			log.Fatal("koristite --dry-run ili --apply")
		}
		sqliteStore := mustOpen(ctx, dbPathFromEnv())
		defer sqliteStore.Close()
		// A dry-run only validates CSV shape and never touches the DB, so it does
		// not need a tenant; --apply writes rows and requires one.
		importCtx := ctx
		if *apply {
			importCtx = mustTenantContext(ctx, sqliteStore, *tenantSlug)
		}
		report, err := importCSV(importCtx, sqliteStore, *dir, *apply)
		must(err)
		fmt.Print(report)
	default:
		usage()
		os.Exit(2)
	}
}

func importCSV(ctx context.Context, sqliteStore *store.SQLiteStore, dir string, apply bool) (string, error) {
	var report strings.Builder
	customers, err := readCustomersCSV(filepath.Join(dir, "customers.csv"))
	if err != nil {
		return "", err
	}
	locations, err := readLocationsCSV(filepath.Join(dir, "locations.csv"))
	if err != nil {
		return "", err
	}
	workOrders, err := readWorkOrdersCSV(filepath.Join(dir, "work_orders.csv"))
	if err != nil {
		return "", err
	}

	fmt.Fprintf(&report, "CSV validacija: %d klijenata, %d lokacija, %d radnih naloga.\n", len(customers), len(locations), len(workOrders))
	if !apply {
		report.WriteString("Dry-run završen. Baza nije promenjena.\n")
		return report.String(), nil
	}

	for _, customer := range customers {
		if _, err := sqliteStore.UpsertCustomer(ctx, customer); err != nil {
			return "", err
		}
	}
	for _, location := range locations {
		if _, err := sqliteStore.UpsertLocation(ctx, location); err != nil {
			return "", err
		}
	}
	for _, workOrder := range workOrders {
		if err := sqliteStore.PutWorkOrder(ctx, workOrder); err != nil {
			return "", err
		}
	}
	report.WriteString("CSV podaci su upisani u bazu.\n")
	return report.String(), nil
}

func readCustomersCSV(path string) ([]domain.Customer, error) {
	rows, err := readCSV(path, []string{"id", "name", "contactName", "email", "phone"})
	if err != nil {
		return nil, err
	}
	customers := make([]domain.Customer, 0, len(rows))
	for index, row := range rows {
		if row["id"] == "" || row["name"] == "" {
			return nil, rowError(path, index, "id i name su obavezni")
		}
		customers = append(customers, domain.Customer{
			ID:          row["id"],
			Name:        row["name"],
			ContactName: emptyStringToPtr(row["contactName"]),
			Email:       emptyStringToPtr(row["email"]),
			Phone:       emptyStringToPtr(row["phone"]),
		})
	}
	return customers, nil
}

func readLocationsCSV(path string) ([]domain.Location, error) {
	rows, err := readCSV(path, []string{"id", "customerId", "name", "address"})
	if err != nil {
		return nil, err
	}
	locations := make([]domain.Location, 0, len(rows))
	for index, row := range rows {
		if row["id"] == "" || row["customerId"] == "" || row["name"] == "" {
			return nil, rowError(path, index, "id, customerId i name su obavezni")
		}
		locations = append(locations, domain.Location{
			ID:         row["id"],
			CustomerID: row["customerId"],
			Name:       row["name"],
			Address:    emptyStringToPtr(row["address"]),
		})
	}
	return locations, nil
}

func readWorkOrdersCSV(path string) ([]domain.WorkOrder, error) {
	rows, err := readCSV(path, []string{
		"id", "orderNumber", "customerId", "locationId", "clientName", "contactPerson",
		"jobDescription", "issuedBy", "issueDate", "dueDate", "status", "price", "note",
	})
	if err != nil {
		return nil, err
	}
	workOrders := make([]domain.WorkOrder, 0, len(rows))
	for index, row := range rows {
		if row["id"] == "" || row["orderNumber"] == "" || row["clientName"] == "" ||
			row["jobDescription"] == "" || row["issuedBy"] == "" || row["issueDate"] == "" {
			return nil, rowError(path, index, "id, orderNumber, clientName, jobDescription, issuedBy i issueDate su obavezni")
		}
		price, err := parseOptionalFloat(row["price"])
		if err != nil {
			return nil, rowError(path, index, "price mora biti broj")
		}
		status := domain.WorkOrderStatus(row["status"])
		if status == "" {
			status = domain.WorkOrderStatusNew
		}
		now := time.Now().UTC().Format(time.RFC3339)
		workOrders = append(workOrders, domain.WorkOrder{
			ID:             row["id"],
			OrderNumber:    row["orderNumber"],
			CustomerID:     emptyStringToPtr(row["customerId"]),
			LocationID:     emptyStringToPtr(row["locationId"]),
			ClientName:     row["clientName"],
			ContactPerson:  emptyStringToPtr(row["contactPerson"]),
			JobDescription: row["jobDescription"],
			Shipping:       domain.Shipping{},
			IssuedBy:       row["issuedBy"],
			Assignment: domain.Assignment{
				Priority: domain.WorkOrderPriorityNormal,
			},
			IssueDate:     row["issueDate"],
			DueDate:       emptyStringToPtr(row["dueDate"]),
			Status:        status,
			IsCompleted:   status == domain.WorkOrderStatusCompleted || status == domain.WorkOrderStatusInvoiced,
			Price:         price,
			Note:          emptyStringToPtr(row["note"]),
			CreatedAt:     now,
			UpdatedAt:     now,
			StatusHistory: []domain.WorkOrderStatusHistory{{Status: status, ChangedAt: now, ChangedBy: row["issuedBy"]}},
			InternalNotes: []domain.WorkOrderNote{},
			CustomerNotes: []domain.WorkOrderNote{},
			Events:        []domain.WorkOrderEvent{{ID: "event-created", Kind: "created", Label: "Nalog uvezen", Actor: row["issuedBy"], CreatedAt: now}},
			Attachments:   []domain.Attachment{},
			MaterialUsage: []domain.MaterialUsage{},
			TimeEntries:   []domain.TimeEntry{},
			InvoiceDraft:  domain.InvoiceDraft{Status: domain.InvoiceDraftStatusNone, LineItems: []domain.InvoiceLineItem{}},
			Communication: domain.CustomerCommunication{PublicToken: "wo-" + row["id"]},
		})
	}
	return workOrders, nil
}

func readCSV(path string, requiredHeaders []string) ([]map[string]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("otvaranje %s: %w", path, err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.TrimLeadingSpace = true
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("čitanje %s: %w", path, err)
	}
	if len(records) == 0 {
		return nil, fmt.Errorf("%s nema header red", path)
	}
	header := map[string]int{}
	for index, name := range records[0] {
		header[name] = index
	}
	for _, name := range requiredHeaders {
		if _, ok := header[name]; !ok {
			return nil, fmt.Errorf("%s nema kolonu %s", path, name)
		}
	}

	rows := make([]map[string]string, 0, len(records)-1)
	for _, record := range records[1:] {
		row := make(map[string]string, len(requiredHeaders))
		for _, name := range requiredHeaders {
			value := ""
			if header[name] < len(record) {
				value = strings.TrimSpace(record[header[name]])
			}
			row[name] = value
		}
		rows = append(rows, row)
	}
	return rows, nil
}

func rowError(path string, index int, message string) error {
	return fmt.Errorf("%s red %d: %s", path, index+2, message)
}

func parseOptionalFloat(value string) (*float64, error) {
	if value == "" {
		return nil, nil
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

func emptyStringToPtr(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func dbPathFromEnv() string {
	if value := strings.TrimSpace(os.Getenv("DATABASE_PATH")); value != "" {
		return value
	}
	if value := strings.TrimSpace(os.Getenv("IRIS_DB_PATH")); value != "" {
		return value
	}
	return defaultDatabasePath
}

func mustOpen(ctx context.Context, path string) *store.SQLiteStore {
	sqliteStore, err := store.OpenSQLite(ctx, path)
	must(err)
	return sqliteStore
}

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}

// userID builds a globally unique, human-readable account id namespaced by the
// tenant slug, since users.id is a global primary key shared across tenants.
func userID(tenantSlug, username string) string {
	slug := strings.ToLower(strings.TrimSpace(tenantSlug))
	name := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(username), ".", "-"))
	return "user-" + slug + "-" + name
}

// mustTenantContext resolves an organization slug to a tenant-scoped context,
// exiting with an error when the slug is empty or unknown. Used by the CLI
// commands that write tenant-owned data.
func mustTenantContext(ctx context.Context, sqliteStore *store.SQLiteStore, slug string) context.Context {
	if strings.TrimSpace(slug) == "" {
		log.Fatal("koristite --tenant <oznaka organizacije>")
	}
	tenant, err := sqliteStore.TenantBySlug(ctx, slug)
	must(err)
	if tenant == nil {
		log.Fatalf("organizacija %q ne postoji", slug)
	}
	return store.ContextWithTenant(ctx, tenant.ID)
}

func usage() {
	fmt.Println(`Korišćenje:
  irisctl migrate
  irisctl seed-demo [-fixtures testdata/fixtures]
  irisctl create-tenant -slug oznaka -name "Naziv" [-id tenant-id] [-admin-username ime -admin-password lozinka]
  irisctl create-user -tenant oznaka -username ime -password lozinka [-role admin|user] [-id user-id]
  irisctl import-csv -tenant oznaka --dry-run --dir import/
  irisctl import-csv -tenant oznaka --apply --dir import/
  irisctl backup [-out backups/iris.db]

DATABASE_PATH podešava putanju SQLite baze; podrazumevano je ./data/iris.db.`)
}
