package store

import (
	"context"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func TestPlatformAdminAuthAndSessions(t *testing.T) {
	ctx := context.Background()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))

	if err := sqliteStore.UpsertPlatformAdmin(ctx, "ops", "short"); err == nil {
		t.Fatal("UpsertPlatformAdmin accepted a short password")
	}
	if admin, err := sqliteStore.AuthenticatePlatformAdmin(ctx, "ops", "whatever-long-pass"); err != nil || admin != nil {
		t.Fatalf("authenticate before any admin exists = %+v, %v; want nil", admin, err)
	}
	if err := sqliteStore.UpsertPlatformAdmin(ctx, "ops", "correct-horse-battery"); err != nil {
		t.Fatalf("UpsertPlatformAdmin: %v", err)
	}
	if admin, _ := sqliteStore.AuthenticatePlatformAdmin(ctx, "ops", "wrong-password-xx"); admin != nil {
		t.Fatal("wrong password authenticated")
	}
	admin, err := sqliteStore.AuthenticatePlatformAdmin(ctx, "ops", "correct-horse-battery")
	if err != nil || admin == nil {
		t.Fatalf("authenticate = %+v, %v", admin, err)
	}

	token, err := sqliteStore.CreatePlatformSession(ctx, admin.ID, time.Now().Add(time.Hour))
	if err != nil {
		t.Fatalf("CreatePlatformSession: %v", err)
	}
	// Tokens are stored hashed, never as issued.
	var stored string
	if err := sqliteStore.db.QueryRowContext(ctx, `SELECT token_hash FROM platform_sessions`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored == token || stored != hashPlatformToken(token) {
		t.Fatalf("stored token = %q, want the hash of the issued token", stored)
	}
	if got, _ := sqliteStore.PlatformAdminBySession(ctx, token); got == nil || got.Username != "ops" {
		t.Fatalf("session lookup = %+v", got)
	}
	if err := sqliteStore.DeletePlatformSession(ctx, token); err != nil {
		t.Fatal(err)
	}
	if got, _ := sqliteStore.PlatformAdminBySession(ctx, token); got != nil {
		t.Fatal("session survived logout")
	}

	expired, _ := sqliteStore.CreatePlatformSession(ctx, admin.ID, time.Now().Add(-time.Minute))
	if got, _ := sqliteStore.PlatformAdminBySession(ctx, expired); got != nil {
		t.Fatal("expired session accepted")
	}
}

// TestPlatformMetricsAggregatesPerTenant: counts land on the right organization
// and the payload never carries names of customers or users.
func TestPlatformMetricsAggregatesPerTenant(t *testing.T) {
	ctx := context.Background()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	demo := testTenantContext()
	now := time.Date(2026, 10, 16, 12, 0, 0, 0, time.UTC)

	if err := sqliteStore.CreateUser(demo, "u-admin", "secret-admin-name", "admin12345", domain.RoleAdmin, false); err != nil {
		t.Fatal(err)
	}
	if err := sqliteStore.CreateUser(demo, "u-op", "secret-operator-name", "operator123", domain.RoleUser, false); err != nil {
		t.Fatal(err)
	}
	if _, err := sqliteStore.UpsertCustomer(demo, domain.Customer{ID: "c-1", Name: "Tajni Klijent DOO"}); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		if _, err := sqliteStore.CreateWorkOrder(demo, domain.CreateWorkOrderInput{
			ClientName: "Tajni Klijent DOO", JobDescription: "Tajni posao", IssuedBy: "secret-admin-name", IssueDate: "2026-10-16",
		}); err != nil {
			t.Fatal(err)
		}
	}
	for _, at := range []time.Time{now.Add(-time.Hour), now.Add(-2 * time.Hour), now.AddDate(0, 0, -100)} {
		if err := sqliteStore.RecordLogin(ctx, DemoTenantID, "u-admin", at); err != nil {
			t.Fatal(err)
		}
	}
	if err := sqliteStore.RecordLogin(ctx, DemoTenantID, "u-op", now.Add(-time.Hour)); err != nil {
		t.Fatal(err)
	}

	metrics, err := sqliteStore.PlatformMetrics(ctx, now, 30)
	if err != nil {
		t.Fatalf("PlatformMetrics: %v", err)
	}
	var demoMetrics, production *domain.PlatformTenantMetrics
	for i := range metrics.Tenants {
		switch metrics.Tenants[i].ID {
		case DemoTenantID:
			demoMetrics = &metrics.Tenants[i]
		case ProductionTenantID:
			production = &metrics.Tenants[i]
		}
	}
	if demoMetrics == nil || production == nil {
		t.Fatalf("tenants = %+v, want demo and production", metrics.Tenants)
	}
	if demoMetrics.Users != 2 || demoMetrics.Admins != 1 || demoMetrics.Customers != 1 {
		t.Fatalf("demo users/admins/customers = %d/%d/%d, want 2/1/1", demoMetrics.Users, demoMetrics.Admins, demoMetrics.Customers)
	}
	if demoMetrics.WorkOrders != 3 || demoMetrics.OpenWorkOrders != 3 {
		t.Fatalf("demo work orders = %d (open %d), want 3 (3)", demoMetrics.WorkOrders, demoMetrics.OpenWorkOrders)
	}
	// The 100-day-old login is outside the 30-day window.
	if demoMetrics.LoginsInRange != 3 || demoMetrics.ActiveUsersInRange != 2 {
		t.Fatalf("demo logins/active = %d/%d, want 3/2", demoMetrics.LoginsInRange, demoMetrics.ActiveUsersInRange)
	}
	if production.WorkOrders != 0 || production.Users != 0 || !production.HasLoginLogo {
		t.Fatalf("production = %+v, want empty with its seeded logo", production)
	}
	if len(metrics.Daily) != 30 || metrics.Daily[29].Date != "2026-10-16" {
		t.Fatalf("daily = %d points ending %q, want 30 ending 2026-10-16", len(metrics.Daily), metrics.Daily[len(metrics.Daily)-1].Date)
	}
	if got := metrics.Daily[29].Logins[DemoTenantSlug]; got != 3 {
		t.Fatalf("today's demo logins = %d, want 3", got)
	}
	if got, ok := metrics.Daily[0].WorkOrders[ProductionTenantSlug]; !ok || got != 0 {
		t.Fatalf("series not zero-filled: %v", metrics.Daily[0].WorkOrders)
	}
	if metrics.Totals.Tenants != 2 || metrics.Totals.WorkOrders != 3 || metrics.Totals.DatabaseBytes <= 0 {
		t.Fatalf("totals = %+v", metrics.Totals)
	}

	payload, _ := json.Marshal(metrics)
	for _, secret := range []string{"secret-admin-name", "secret-operator-name", "Tajni", "u-admin", "u-op"} {
		if strings.Contains(string(payload), secret) {
			t.Fatalf("metrics payload leaks %q", secret)
		}
	}
}
