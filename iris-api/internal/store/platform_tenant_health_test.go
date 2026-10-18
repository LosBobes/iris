package store

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func findPlatformTenant(t *testing.T, tenants []domain.PlatformTenant, id string) domain.PlatformTenant {
	t.Helper()
	for _, tenant := range tenants {
		if tenant.ID == id {
			return tenant
		}
	}
	t.Fatalf("tenant %q missing from %+v", id, tenants)
	return domain.PlatformTenant{}
}

func TestPlatformTenantHealth(t *testing.T) {
	ctx := context.Background()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	demo := testTenantContext()
	now := time.Now().UTC()

	for _, user := range []struct{ id, name string }{{"u-admin", "secret-admin"}, {"u-op", "secret-op"}, {"u-idle", "secret-idle"}} {
		if err := sqliteStore.CreateUser(demo, user.id, user.name, "password123", domain.RoleUser, false); err != nil {
			t.Fatal(err)
		}
	}
	var ids []string
	for i := 0; i < 4; i++ {
		order, err := sqliteStore.CreateWorkOrder(demo, domain.CreateWorkOrderInput{
			ClientName: "Tajni Klijent DOO", JobDescription: "Tajni posao", IssuedBy: "secret-admin", IssueDate: now.Format("2006-01-02"),
		})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, order.ID)
	}
	// One order is done, one was created long ago (and is still open).
	if _, err := sqliteStore.db.ExecContext(ctx, `UPDATE work_orders SET status = 'completed' WHERE id = ?`, ids[0]); err != nil {
		t.Fatal(err)
	}
	if _, err := sqliteStore.db.ExecContext(ctx, `UPDATE work_orders SET created_at = '2020-01-01T00:00:00Z' WHERE id = ?`, ids[1]); err != nil {
		t.Fatal(err)
	}
	lastLogin := now.Add(-time.Hour)
	for _, login := range []struct {
		user string
		at   time.Time
	}{{"u-admin", lastLogin}, {"u-admin", now.AddDate(0, 0, -3)}, {"u-op", now.AddDate(0, 0, -10)}, {"u-idle", now.AddDate(0, 0, -100)}} {
		if err := sqliteStore.RecordLogin(ctx, DemoTenantID, login.user, login.at); err != nil {
			t.Fatal(err)
		}
	}
	// u-idle has not signed in for 100 days but still holds a live session
	// (a remembered device), so it counts as active in both windows.
	if _, err := sqliteStore.CreateSession(ctx, "u-idle", now.Add(6*24*time.Hour)); err != nil {
		t.Fatal(err)
	}

	tenants, err := sqliteStore.PlatformTenants(ctx)
	if err != nil {
		t.Fatalf("PlatformTenants: %v", err)
	}
	health := findPlatformTenant(t, tenants, DemoTenantID).Health
	if health.LastLoginAt == nil || *health.LastLoginAt != lastLogin.Format(time.RFC3339) {
		t.Fatalf("lastLoginAt = %v, want %s", health.LastLoginAt, lastLogin.Format(time.RFC3339))
	}
	if health.ActiveUsers7d != 2 || health.ActiveUsers30d != 3 {
		t.Fatalf("active users 7d/30d = %d/%d, want 2/3", health.ActiveUsers7d, health.ActiveUsers30d)
	}
	if health.WorkOrdersCreated30d != 3 || health.OpenWorkOrders != 3 {
		t.Fatalf("work orders created30d/open = %d/%d, want 3/3", health.WorkOrdersCreated30d, health.OpenWorkOrders)
	}
	if health.Dormant {
		t.Fatal("active organization reported dormant")
	}

	// A brand-new organization with no sign-ins is not dormant yet; one older
	// than the window is.
	production := findPlatformTenant(t, tenants, ProductionTenantID)
	if production.Health.Dormant || production.Health.LastLoginAt != nil || production.Health.ActiveUsers30d != 0 {
		t.Fatalf("new production tenant health = %+v", production.Health)
	}
	if _, err := sqliteStore.db.ExecContext(ctx, `UPDATE tenants SET created_at = '2020-01-01 00:00:00' WHERE id = ?`, ProductionTenantID); err != nil {
		t.Fatal(err)
	}
	if tenants, err = sqliteStore.PlatformTenants(ctx); err != nil {
		t.Fatal(err)
	}
	if !findPlatformTenant(t, tenants, ProductionTenantID).Health.Dormant {
		t.Fatal("old organization without sign-ins not dormant")
	}

	// A single-organization result (after a mutation) carries the same health.
	one, err := sqliteStore.platformTenantByID(ctx, DemoTenantID)
	if err != nil || one == nil || one.Health.ActiveUsers30d != 3 || one.Health.OpenWorkOrders != 3 {
		t.Fatalf("platformTenantByID health = %+v, %v", one, err)
	}

	// Counts and dates only.
	payload, _ := json.Marshal(tenants)
	for _, secret := range []string{"secret-admin", "secret-op", "u-admin", "u-idle", "Tajni"} {
		if strings.Contains(string(payload), secret) {
			t.Fatalf("tenant list leaks %q", secret)
		}
	}
}

func TestPlatformSetTenantNotes(t *testing.T) {
	ctx := context.Background()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	actor := AuditActor{AdminID: "pa-1", AdminUsername: "ops", IP: "127.0.0.1"}

	tenant, err := sqliteStore.platformTenantByID(ctx, DemoTenantID)
	if err != nil || tenant == nil {
		t.Fatal(err)
	}
	if tenant.Notes.UpdatedAt != nil || tenant.Notes.Notes != "" {
		t.Fatalf("fresh notes = %+v, want empty", tenant.Notes)
	}

	var validation *ValidationError
	for _, bad := range []domain.PlatformTenantNotesInput{
		{ContactEmail: "not-an-email"},
		{ContactEmail: "a b@example.com"},
		{Plan: strings.Repeat("x", 201)},
		{Notes: strings.Repeat("x", 10001)},
	} {
		if _, err := sqliteStore.PlatformSetTenantNotes(ctx, actor, DemoTenantSlug, bad); !errors.As(err, &validation) {
			t.Fatalf("PlatformSetTenantNotes(%+v) = %v, want a validation error", bad, err)
		}
	}
	if missing, err := sqliteStore.PlatformSetTenantNotes(ctx, actor, "missing", domain.PlatformTenantNotesInput{}); err != nil || missing != nil {
		t.Fatalf("unknown slug = %+v, %v; want nil", missing, err)
	}

	input := domain.PlatformTenantNotesInput{
		ContactName:  "  Marko Marković ",
		ContactEmail: "marko@example.com",
		ContactPhone: "+381 64 123 4567",
		Plan:         "Godišnji",
		Notes:        "Prvi red\nDrugi red",
	}
	saved, err := sqliteStore.PlatformSetTenantNotes(ctx, actor, DemoTenantSlug, input)
	if err != nil || saved == nil {
		t.Fatalf("PlatformSetTenantNotes: %+v, %v", saved, err)
	}
	if saved.Notes.ContactName != "Marko Marković" || saved.Notes.Notes != "Prvi red\nDrugi red" || saved.Notes.Plan != "Godišnji" ||
		saved.Notes.UpdatedAt == nil || saved.Notes.UpdatedBy == nil || *saved.Notes.UpdatedBy != "ops" {
		t.Fatalf("saved notes = %+v", saved.Notes)
	}
	// Saving the same notes again changes nothing and is not audited.
	if _, err := sqliteStore.PlatformSetTenantNotes(ctx, actor, DemoTenantSlug, input); err != nil {
		t.Fatal(err)
	}
	input.Plan = "Mesečni"
	if _, err := sqliteStore.PlatformSetTenantNotes(ctx, actor, DemoTenantSlug, input); err != nil {
		t.Fatal(err)
	}

	tenants, err := sqliteStore.PlatformTenants(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if notes := findPlatformTenant(t, tenants, DemoTenantID).Notes; notes.Plan != "Mesečni" || notes.ContactEmail != "marko@example.com" {
		t.Fatalf("listed notes = %+v", notes)
	}
	if notes := findPlatformTenant(t, tenants, ProductionTenantID).Notes; notes.UpdatedAt != nil {
		t.Fatalf("other organization got notes: %+v", notes)
	}

	log, err := sqliteStore.PlatformAuditLog(ctx, 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if log.Total != 2 || log.Items[0].Action != domain.AuditTenantNotes || log.Items[0].Detail["fields"] != "plan" ||
		log.Items[1].Detail["fields"] != "contactName,contactEmail,contactPhone,plan,notes" || log.Items[0].TenantSlug != DemoTenantSlug {
		t.Fatalf("audit = %+v", log.Items)
	}
	// The audit trail names the fields, never their contents.
	payload, _ := json.Marshal(log)
	if strings.Contains(string(payload), "Marko") || strings.Contains(string(payload), "Mesečni") {
		t.Fatalf("audit leaks note contents: %s", payload)
	}

	// The notes go with the organization.
	if _, err := sqliteStore.DeleteTenant(ctx, DemoTenantSlug); err != nil {
		t.Fatal(err)
	}
	var left int
	if err := sqliteStore.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tenant_notes`).Scan(&left); err != nil || left != 0 {
		t.Fatalf("tenant_notes after delete = %d, %v", left, err)
	}
}
