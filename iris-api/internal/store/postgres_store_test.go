package store

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// The scenarios in this file run identically against SQLite and Postgres. They
// exist to prove that translateToPostgres is faithful: every case below is one
// the translator rewrites (case-insensitive collation, ILIKE, ON CONFLICT DO
// NOTHING, the GLOB-based id sequence) or one where the Postgres column type
// differs from SQLite's (NUMERIC money, smallint flags, identity columns).
//
// The Postgres half is skipped unless IRIS_TEST_POSTGRES_DSN points at a
// throwaway database — the tests DROP the public schema, so never aim it at
// anything you care about. See deploy/POSTGRES.md.
const postgresTestDSNEnv = "IRIS_TEST_POSTGRES_DSN"

type storeScenario struct {
	name string
	run  func(t *testing.T, ctx context.Context, store *SQLStore)
}

func storeScenarios() []storeScenario {
	return []storeScenario{
		{name: "TenantLookupIsCaseInsensitive", run: scenarioTenantLookupIsCaseInsensitive},
		{name: "UserListingOrdersCaseInsensitively", run: scenarioUserListingOrdersCaseInsensitively},
		{name: "AuthenticateAndSession", run: scenarioAuthenticateAndSession},
		{name: "CustomerSearchIsCaseInsensitive", run: scenarioCustomerSearchIsCaseInsensitive},
		{name: "CatalogSearchFoldsDiacritics", run: scenarioCatalogSearchFoldsDiacritics},
		{name: "CatalogPricesRoundTripExactly", run: scenarioCatalogPricesRoundTripExactly},
		{name: "WorkOrderCreateListAndSearch", run: scenarioWorkOrderCreateListAndSearch},
		{name: "WorkOrderPublicTokenLookup", run: scenarioWorkOrderPublicTokenLookup},
		{name: "OrderNumberReservationIsUnique", run: scenarioOrderNumberReservationIsUnique},
		{name: "EditLockIsExclusive", run: scenarioEditLockIsExclusive},
		{name: "EnumValuesRoundTrip", run: scenarioEnumValuesRoundTrip},
		{name: "OrganizationSettingsRoundTrip", run: scenarioOrganizationSettingsRoundTrip},
	}
}

func TestSQLiteStoreScenarios(t *testing.T) {
	for _, scenario := range storeScenarios() {
		t.Run(scenario.name, func(t *testing.T) {
			ctx := testTenantContext()
			store := newSQLiteStoreForTest(t, ctx, t.TempDir()+"/iris.db")
			defer store.Close()
			scenario.run(t, ctx, store)
		})
	}
}

func TestPostgresStoreScenarios(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv(postgresTestDSNEnv))
	if dsn == "" {
		t.Skipf("%s is not set; skipping Postgres store scenarios", postgresTestDSNEnv)
	}

	for _, scenario := range storeScenarios() {
		t.Run(scenario.name, func(t *testing.T) {
			ctx := testTenantContext()
			store := newPostgresStoreForTest(t, ctx, dsn)
			defer store.Close()
			scenario.run(t, ctx, store)
		})
	}
}

// TestPostgresStoreAppliesBaselineSchemaVersion checks that a fresh Postgres
// database is stamped at postgresSchemaVersion, so the shared migration runner
// does not later try to replay the SQLite-only migrations onto it.
func TestPostgresStoreAppliesBaselineSchemaVersion(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv(postgresTestDSNEnv))
	if dsn == "" {
		t.Skipf("%s is not set; skipping Postgres store scenarios", postgresTestDSNEnv)
	}

	ctx := testTenantContext()
	store := newPostgresStoreForTest(t, ctx, dsn)
	defer store.Close()

	var applied int
	if err := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations`).Scan(&applied); err != nil {
		t.Fatalf("count schema_migrations returned error: %v", err)
	}
	if applied != postgresSchemaVersion {
		t.Fatalf("schema_migrations has %d rows, want %d", applied, postgresSchemaVersion)
	}

	// Re-opening must be a no-op rather than a duplicate-key failure.
	reopened, err := OpenPostgres(ctx, dsn)
	if err != nil {
		t.Fatalf("OpenPostgres() on an existing database returned error: %v", err)
	}
	defer reopened.Close()
}

func newPostgresStoreForTest(t *testing.T, ctx context.Context, dsn string) *SQLStore {
	t.Helper()
	resetPostgresSchema(t, dsn)

	postgresStore, err := OpenPostgres(ctx, dsn)
	if err != nil {
		t.Fatalf("OpenPostgres() returned error: %v", err)
	}
	if err := postgresStore.EnsureTenant(ctx, DemoTenantID, DemoTenantSlug, DemoTenantName); err != nil {
		t.Fatalf("EnsureTenant() returned error: %v", err)
	}
	return postgresStore
}

// resetPostgresSchema drops everything the store owns so each scenario starts
// from an empty database, mirroring the fresh temp file the SQLite tests get.
func resetPostgresSchema(t *testing.T, dsn string) {
	t.Helper()
	db, err := sql.Open(postgresDriverName, dsn)
	if err != nil {
		t.Fatalf("open postgres for reset returned error: %v", err)
	}
	defer db.Close()

	if _, err := db.Exec(`DROP SCHEMA IF EXISTS public CASCADE`); err != nil {
		t.Fatalf("drop schema returned error: %v", err)
	}
	if _, err := db.Exec(`CREATE SCHEMA public`); err != nil {
		t.Fatalf("create schema returned error: %v", err)
	}
}

// --- scenarios ---------------------------------------------------------------

// TenantBySlug matches with COLLATE NOCASE so an operator typing "Demo" reaches
// the "demo" organization.
func scenarioTenantLookupIsCaseInsensitive(t *testing.T, ctx context.Context, store *SQLStore) {
	for _, slug := range []string{DemoTenantSlug, strings.ToUpper(DemoTenantSlug), "DeMo"} {
		tenant, err := store.TenantBySlug(ctx, slug)
		if err != nil {
			t.Fatalf("TenantBySlug(%q) returned error: %v", slug, err)
		}
		if tenant == nil || tenant.ID != DemoTenantID {
			t.Fatalf("TenantBySlug(%q) = %#v, want the demo tenant", slug, tenant)
		}
	}

	missing, err := store.TenantBySlug(ctx, "nepostojeci")
	if err != nil {
		t.Fatalf("TenantBySlug() returned error: %v", err)
	}
	if missing != nil {
		t.Fatalf("TenantBySlug() = %#v, want nil for an unknown slug", missing)
	}
}

// ListUsers orders by username COLLATE NOCASE, so case must not split the list
// into two alphabetical runs the way a byte-ordered sort would.
func scenarioUserListingOrdersCaseInsensitively(t *testing.T, ctx context.Context, store *SQLStore) {
	for _, username := range []string{"zeta", "Alpha", "beta"} {
		if _, err := store.CreateUserAccount(ctx, domain.CreateUserInput{
			Username: username,
			Password: "lozinka123",
			Role:     domain.RoleUser,
		}); err != nil {
			t.Fatalf("CreateUserAccount(%q) returned error: %v", username, err)
		}
	}

	users, err := store.ListUsers(ctx)
	if err != nil {
		t.Fatalf("ListUsers() returned error: %v", err)
	}

	var got []string
	for _, user := range users {
		got = append(got, user.Username)
	}
	want := []string{"Alpha", "beta", "zeta"}
	if len(got) != len(want) {
		t.Fatalf("ListUsers() = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("ListUsers() = %v, want %v", got, want)
		}
	}
}

func scenarioAuthenticateAndSession(t *testing.T, ctx context.Context, store *SQLStore) {
	created, err := store.CreateUserAccount(ctx, domain.CreateUserInput{
		Username: "operater",
		Password: "lozinka123",
		Role:     domain.RoleAdmin,
	})
	if err != nil {
		t.Fatalf("CreateUserAccount() returned error: %v", err)
	}

	authenticated, err := store.AuthenticateUser(ctx, DemoTenantID, "operater", "lozinka123")
	if err != nil {
		t.Fatalf("AuthenticateUser() returned error: %v", err)
	}
	if authenticated == nil || authenticated.ID != created.ID {
		t.Fatalf("AuthenticateUser() = %#v, want the created user", authenticated)
	}

	rejected, err := store.AuthenticateUser(ctx, DemoTenantID, "operater", "pogresna")
	if err != nil {
		t.Fatalf("AuthenticateUser() with a bad password returned error: %v", err)
	}
	if rejected != nil {
		t.Fatalf("AuthenticateUser() = %#v, want nil for a bad password", rejected)
	}

	token, err := store.CreateSession(ctx, created.ID, time.Now().UTC().Add(time.Hour))
	if err != nil {
		t.Fatalf("CreateSession() returned error: %v", err)
	}

	sessionUser, err := store.UserBySessionToken(ctx, token)
	if err != nil {
		t.Fatalf("UserBySessionToken() returned error: %v", err)
	}
	if sessionUser == nil || sessionUser.ID != created.ID {
		t.Fatalf("UserBySessionToken() = %#v, want the session's user", sessionUser)
	}

	if err := store.DeleteSession(ctx, token); err != nil {
		t.Fatalf("DeleteSession() returned error: %v", err)
	}
	deleted, err := store.UserBySessionToken(ctx, token)
	if err != nil {
		t.Fatalf("UserBySessionToken() after delete returned error: %v", err)
	}
	if deleted != nil {
		t.Fatalf("UserBySessionToken() = %#v, want nil after the session was deleted", deleted)
	}
}

// Customer search runs through LIKE, which SQLite treats case-insensitively.
// Postgres needs ILIKE to match, which is what the translator emits.
func scenarioCustomerSearchIsCaseInsensitive(t *testing.T, ctx context.Context, store *SQLStore) {
	email := "prodaja@primer.rs"
	if _, err := store.UpsertCustomer(ctx, domain.Customer{
		ID:   "cust-ns",
		Name: "Štamparija Novi Sad",
		Contacts: []domain.CustomerContact{
			{ID: "contact-1", Name: "Marko Marković", Email: &email, SortOrder: 0},
		},
		Emails: []domain.CustomerEmail{
			{ID: "email-1", Email: email, SortOrder: 0},
		},
	}); err != nil {
		t.Fatalf("UpsertCustomer() returned error: %v", err)
	}

	// Child collections are loaded by a separate IN (...) query per customer.
	fetched, err := store.CustomerByID(ctx, "cust-ns")
	if err != nil {
		t.Fatalf("CustomerByID() returned error: %v", err)
	}
	if fetched == nil || len(fetched.Contacts) != 1 || len(fetched.Emails) != 1 {
		t.Fatalf("CustomerByID() = %#v, want one contact and one email", fetched)
	}

	if _, err := store.UpsertLocation(ctx, domain.Location{
		ID:         "loc-1",
		CustomerID: "cust-ns",
		Name:       "Magacin",
	}); err != nil {
		t.Fatalf("UpsertLocation() returned error: %v", err)
	}
	locations, err := store.Locations(ctx, "cust-ns")
	if err != nil {
		t.Fatalf("Locations() returned error: %v", err)
	}
	if len(locations) != 1 {
		t.Fatalf("Locations() returned %d rows, want 1", len(locations))
	}

	for _, search := range []string{"novi sad", "NOVI SAD", "Novi Sad"} {
		result, err := store.Customers(ctx, CustomerQuery{Search: search})
		if err != nil {
			t.Fatalf("Customers(%q) returned error: %v", search, err)
		}
		if result.Total != 1 || len(result.Items) != 1 {
			t.Fatalf("Customers(%q) total = %d, want 1", search, result.Total)
		}
	}

	empty, err := store.Customers(ctx, CustomerQuery{Search: "beograd"})
	if err != nil {
		t.Fatalf("Customers() returned error: %v", err)
	}
	if empty.Total != 0 {
		t.Fatalf("Customers() total = %d, want 0 for a non-matching search", empty.Total)
	}
}

// Catalog search folds Serbian diacritics with a nested REPLACE() chain and then
// matches case-insensitively, so "stampa" must find "Štampa".
func scenarioCatalogSearchFoldsDiacritics(t *testing.T, ctx context.Context, store *SQLStore) {
	if _, err := store.UpsertCatalogItem(ctx, domain.CatalogItem{
		Code:     "USL-STP",
		Name:     "Štampa plakata",
		Kind:     domain.CatalogItemKindService,
		Unit:     "kom",
		IsActive: true,
	}, ""); err != nil {
		t.Fatalf("UpsertCatalogItem() returned error: %v", err)
	}

	for _, search := range []string{"stampa", "STAMPA", "Štampa", "plakata"} {
		result, err := store.CatalogItems(ctx, CatalogItemQuery{Search: search})
		if err != nil {
			t.Fatalf("CatalogItems(%q) returned error: %v", search, err)
		}
		if result.Total != 1 {
			t.Fatalf("CatalogItems(%q) total = %d, want 1", search, result.Total)
		}
	}
}

// Money is NUMERIC on Postgres and REAL on SQLite. This pins the values that a
// binary float cannot hold exactly, which is the reason for the column change.
func scenarioCatalogPricesRoundTripExactly(t *testing.T, ctx context.Context, store *SQLStore) {
	purchase := 1234.56
	sale := 2345.67

	created, err := store.UpsertCatalogItem(ctx, domain.CatalogItem{
		Code:          "ART-CENA",
		Name:          "Papir A4",
		Kind:          domain.CatalogItemKindArticle,
		Unit:          "kom",
		PurchasePrice: &purchase,
		SalePrice:     &sale,
		IsActive:      true,
	}, "")
	if err != nil {
		t.Fatalf("UpsertCatalogItem() returned error: %v", err)
	}

	fetched, err := store.CatalogItemByID(ctx, created.ID)
	if err != nil {
		t.Fatalf("CatalogItemByID() returned error: %v", err)
	}
	if fetched == nil || fetched.PurchasePrice == nil || fetched.SalePrice == nil {
		t.Fatalf("CatalogItemByID() = %#v, want both prices populated", fetched)
	}
	if *fetched.PurchasePrice != purchase {
		t.Fatalf("PurchasePrice = %v, want %v", *fetched.PurchasePrice, purchase)
	}
	if *fetched.SalePrice != sale {
		t.Fatalf("SalePrice = %v, want %v", *fetched.SalePrice, sale)
	}
	if !fetched.IsActive {
		t.Fatalf("IsActive = false, want true (flag column round-trip)")
	}
}

func scenarioWorkOrderCreateListAndSearch(t *testing.T, ctx context.Context, store *SQLStore) {
	year := time.Now().UTC().Year()
	issueDate := time.Now().UTC().Format("2006-01-02")

	// A non-numeric id, which the id sequence must skip over. This is the query
	// that used GLOB and is now a NOT GLOB the translator turns into !~.
	if err := store.PutWorkOrder(ctx, domain.WorkOrder{
		ID:             "wo-cob-1",
		OrderNumber:    formatOrderNumber(year, 1),
		ClientName:     "Delta Štampa",
		JobDescription: "vizit karte",
		IssuedBy:       "admin",
		IssueDate:      issueDate,
		Status:         domain.WorkOrderStatusNew,
	}); err != nil {
		t.Fatalf("PutWorkOrder() returned error: %v", err)
	}

	created, err := store.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName:     "Alpha Print",
		JobDescription: "katalozi",
		IssuedBy:       "admin",
		IssueDate:      issueDate,
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder() returned error: %v", err)
	}
	if created.OrderNumber == formatOrderNumber(year, 1) {
		t.Fatalf("CreateWorkOrder() reused order number %q", created.OrderNumber)
	}

	all, err := store.WorkOrders(ctx, WorkOrderListQuery{})
	if err != nil {
		t.Fatalf("WorkOrders() returned error: %v", err)
	}
	if all.Total != 2 {
		t.Fatalf("WorkOrders() total = %d, want 2", all.Total)
	}

	// Search runs LOWER(...) LIKE ?, translated to ILIKE.
	for _, search := range []string{"alpha", "ALPHA", "katalozi"} {
		found, err := store.WorkOrders(ctx, WorkOrderListQuery{Search: search})
		if err != nil {
			t.Fatalf("WorkOrders(search=%q) returned error: %v", search, err)
		}
		if found.Total != 1 {
			t.Fatalf("WorkOrders(search=%q) total = %d, want 1", search, found.Total)
		}
	}

	byStatus, err := store.WorkOrders(ctx, WorkOrderListQuery{Status: domain.WorkOrderStatusNew})
	if err != nil {
		t.Fatalf("WorkOrders(status) returned error: %v", err)
	}
	if byStatus.Total == 0 {
		t.Fatalf("WorkOrders(status=new) total = 0, want the seeded order")
	}

	byDate, err := store.WorkOrders(ctx, WorkOrderListQuery{DateFrom: issueDate, DateTo: issueDate})
	if err != nil {
		t.Fatalf("WorkOrders(date range) returned error: %v", err)
	}
	if byDate.Total != 2 {
		t.Fatalf("WorkOrders(date range) total = %d, want 2", byDate.Total)
	}

	fetched, err := store.WorkOrderByID(ctx, created.ID)
	if err != nil {
		t.Fatalf("WorkOrderByID() returned error: %v", err)
	}
	if fetched == nil || fetched.ClientName != "Alpha Print" {
		t.Fatalf("WorkOrderByID() = %#v, want the created order", fetched)
	}

	deleted, err := store.DeleteWorkOrder(ctx, created.ID)
	if err != nil {
		t.Fatalf("DeleteWorkOrder() returned error: %v", err)
	}
	if !deleted.Success {
		t.Fatalf("DeleteWorkOrder() = %#v, want success", deleted)
	}
}

func scenarioWorkOrderPublicTokenLookup(t *testing.T, ctx context.Context, store *SQLStore) {
	created, err := store.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName:     "Javni Klijent",
		JobDescription: "plakati",
		IssuedBy:       "admin",
		IssueDate:      time.Now().UTC().Format("2006-01-02"),
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder() returned error: %v", err)
	}
	token := created.Communication.PublicToken
	if token == "" {
		t.Fatalf("CreateWorkOrder() produced no public token")
	}

	// Deliberately cross-tenant: the public tracking page has no session.
	found, err := store.WorkOrderByPublicToken(context.Background(), token)
	if err != nil {
		t.Fatalf("WorkOrderByPublicToken() returned error: %v", err)
	}
	if found == nil || found.ID != created.ID {
		t.Fatalf("WorkOrderByPublicToken() = %#v, want the created order", found)
	}

	missing, err := store.WorkOrderByPublicToken(context.Background(), "nepostojeci-token")
	if err != nil {
		t.Fatalf("WorkOrderByPublicToken() returned error: %v", err)
	}
	if missing != nil {
		t.Fatalf("WorkOrderByPublicToken() = %#v, want nil for an unknown token", missing)
	}
}

func scenarioOrderNumberReservationIsUnique(t *testing.T, ctx context.Context, store *SQLStore) {
	first, err := store.ReserveOrderNumber(ctx, "operater-a")
	if err != nil {
		t.Fatalf("ReserveOrderNumber() returned error: %v", err)
	}
	second, err := store.ReserveOrderNumber(ctx, "operater-b")
	if err != nil {
		t.Fatalf("ReserveOrderNumber() returned error: %v", err)
	}
	if first.OrderNumber == second.OrderNumber {
		t.Fatalf("ReserveOrderNumber() handed out %q twice", first.OrderNumber)
	}

	if err := store.ReleaseOrderNumber(ctx, first.OrderNumber); err != nil {
		t.Fatalf("ReleaseOrderNumber() returned error: %v", err)
	}
	// Releasing an unknown number is a documented no-op.
	if err := store.ReleaseOrderNumber(ctx, "RN-1900-00001"); err != nil {
		t.Fatalf("ReleaseOrderNumber() on an unknown number returned error: %v", err)
	}
}

func scenarioEditLockIsExclusive(t *testing.T, ctx context.Context, store *SQLStore) {
	created, err := store.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName:     "Zaključan Nalog",
		JobDescription: "brošure",
		IssuedBy:       "admin",
		IssueDate:      time.Now().UTC().Format("2006-01-02"),
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder() returned error: %v", err)
	}

	lock, acquired, err := store.AcquireEditLock(ctx, created.ID, "operater-a")
	if err != nil {
		t.Fatalf("AcquireEditLock() returned error: %v", err)
	}
	if !acquired || lock.LockedBy != "operater-a" {
		t.Fatalf("AcquireEditLock() = (%#v, %v), want the lock held by operater-a", lock, acquired)
	}

	// A heartbeat from the holder refreshes rather than conflicts.
	if _, refreshed, err := store.AcquireEditLock(ctx, created.ID, "operater-a"); err != nil || !refreshed {
		t.Fatalf("AcquireEditLock() heartbeat = (%v, %v), want a refresh", refreshed, err)
	}

	holder, acquired, err := store.AcquireEditLock(ctx, created.ID, "operater-b")
	if err != nil {
		t.Fatalf("AcquireEditLock() returned error: %v", err)
	}
	if acquired {
		t.Fatalf("AcquireEditLock() granted operater-b a lock held by operater-a")
	}
	if holder.LockedBy != "operater-a" {
		t.Fatalf("AcquireEditLock() holder = %q, want operater-a", holder.LockedBy)
	}

	// A stale caller must not be able to drop the current holder's lock.
	if err := store.ReleaseEditLock(ctx, created.ID, "operater-b"); err != nil {
		t.Fatalf("ReleaseEditLock() returned error: %v", err)
	}
	if _, acquired, _ := store.AcquireEditLock(ctx, created.ID, "operater-b"); acquired {
		t.Fatalf("ReleaseEditLock() by a non-holder released the lock")
	}

	if err := store.ReleaseEditLock(ctx, created.ID, "operater-a"); err != nil {
		t.Fatalf("ReleaseEditLock() returned error: %v", err)
	}
	if _, acquired, _ := store.AcquireEditLock(ctx, created.ID, "operater-b"); !acquired {
		t.Fatalf("AcquireEditLock() denied operater-b after the lock was released")
	}
}

func scenarioEnumValuesRoundTrip(t *testing.T, ctx context.Context, store *SQLStore) {
	created, err := store.CreateEnumValue(ctx, domain.EnumValueInput{
		Field:     domain.EnumFieldDeliveryMethod,
		Value:     "dostava-biciklom",
		Label:     "Dostava biciklom",
		SortOrder: 5,
	})
	if err != nil {
		t.Fatalf("CreateEnumValue() returned error: %v", err)
	}

	values, err := store.EnumValues(ctx)
	if err != nil {
		t.Fatalf("EnumValues() returned error: %v", err)
	}
	if !containsEnumValue(values, "dostava-biciklom") {
		t.Fatalf("EnumValues() is missing the created value")
	}

	if _, err := store.UpdateEnumValue(ctx, created.ID, domain.EnumValueInput{
		Field:     domain.EnumFieldDeliveryMethod,
		Value:     "dostava-biciklom",
		Label:     "Dostava biciklom (brzo)",
		SortOrder: 6,
	}); err != nil {
		t.Fatalf("UpdateEnumValue() returned error: %v", err)
	}

	if err := store.DeleteEnumValue(ctx, created.ID); err != nil {
		t.Fatalf("DeleteEnumValue() returned error: %v", err)
	}

	afterDelete, err := store.EnumValues(ctx)
	if err != nil {
		t.Fatalf("EnumValues() returned error: %v", err)
	}
	if containsEnumValue(afterDelete, "dostava-biciklom") {
		t.Fatalf("EnumValues() still contains the deleted value")
	}
}

func containsEnumValue(values []domain.EnumValue, value string) bool {
	for _, enumValue := range values {
		if enumValue.Value == value {
			return true
		}
	}
	return false
}

// Settings live in the key/value app_settings table, whose upsert is an
// ON CONFLICT (tenant_id, key) DO UPDATE.
func scenarioOrganizationSettingsRoundTrip(t *testing.T, ctx context.Context, store *SQLStore) {
	firmName := "Štamparija Čobanović"
	showShipping := false

	updated, err := store.UpdateOrganizationSettings(ctx, domain.OrganizationSettingsUpdate{
		FirmName:            &firmName,
		ShowShippingOptions: &showShipping,
	})
	if err != nil {
		t.Fatalf("UpdateOrganizationSettings() returned error: %v", err)
	}
	if updated.FirmName != firmName {
		t.Fatalf("FirmName = %q, want %q", updated.FirmName, firmName)
	}
	if updated.ShowShippingOptions {
		t.Fatalf("ShowShippingOptions = true, want false")
	}

	reread, err := store.OrganizationSettings(ctx)
	if err != nil {
		t.Fatalf("OrganizationSettings() returned error: %v", err)
	}
	if reread.FirmName != firmName {
		t.Fatalf("FirmName = %q, want %q", reread.FirmName, firmName)
	}
	if reread.ShowShippingOptions {
		t.Fatalf("ShowShippingOptions = true, want false")
	}
}
