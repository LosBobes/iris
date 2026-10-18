package store

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// TestTenantDataTablesCoverSchema fails when a migration adds a table that the
// organization export/delete does not know about. Add the table to
// tenantDataTables (with how its rows reach the tenant) or, if it holds no
// organization data, to platformOnlyTables.
func TestTenantDataTablesCoverSchema(t *testing.T) {
	s, ctx := openDemoStore(t)
	listed := map[string]bool{}
	for _, table := range tenantDataTables {
		if listed[table.name] {
			t.Errorf("table %s listed twice", table.name)
		}
		listed[table.name] = true
		if platformOnlyTables[table.name] {
			t.Errorf("table %s is both tenant data and platform-only", table.name)
		}
	}
	tables := schemaTables(t, ctx, s)
	present := map[string]bool{}
	for _, table := range tables {
		present[table] = true
		if !listed[table] && !platformOnlyTables[table] {
			t.Errorf("table %s is not covered by organization export/delete: add it to tenantDataTables or platformOnlyTables", table)
		}
		if listed[table] || table == "platform_audit_events" {
			continue
		}
		if tableHasColumn(t, ctx, s, table, "tenant_id") {
			t.Errorf("table %s has a tenant_id column but is marked platform-only", table)
		}
	}
	for name := range listed {
		if !present[name] {
			t.Errorf("tenantDataTables lists %s, which the schema does not have", name)
		}
	}
}

func schemaTables(t *testing.T, ctx context.Context, s *SQLiteStore) []string {
	t.Helper()
	rows, err := s.db.QueryContext(ctx, `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		tables = append(tables, name)
	}
	return tables
}

func tableHasColumn(t *testing.T, ctx context.Context, s *SQLiteStore, table, column string) bool {
	t.Helper()
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('`+table+`') WHERE name = ?`, column).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count > 0
}

// tenantRowCounts counts each tenant data table's rows for the tenant.
func tenantRowCounts(t *testing.T, ctx context.Context, s *SQLiteStore, tenantID string) map[string]int {
	t.Helper()
	counts := map[string]int{}
	for _, table := range tenantDataTables {
		var count int
		if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM `+table.name+` WHERE `+table.where, tenantID).Scan(&count); err != nil {
			t.Fatalf("count %s: %v", table.name, err)
		}
		counts[table.name] = count
	}
	return counts
}

// offboardingFixture seeds the demo organization (fixtures, processes, stock,
// sessions and an impersonation with a recorded action) and a second
// organization with a customer, and returns the superadmin actor.
func offboardingFixture(t *testing.T) (*SQLiteStore, context.Context, AuditActor, *domain.PlatformTenant) {
	t.Helper()
	s, ctx := openDemoStore(t)
	if _, err := SeedDemoFromFixtures(ctx, s, demoFixtureDir, "", "", ""); err != nil {
		t.Fatal(err)
	}
	demo, _ := s.TenantBySlug(ctx, DemoTenantSlug)
	user, err := s.AuthenticateUser(ctx, demo.ID, "admin", "admin123")
	if err != nil || user == nil {
		t.Fatal(err)
	}
	if _, err := s.CreateSession(ctx, user.ID, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err := s.UpsertPlatformAdmin(ctx, "ops", "correct-horse-battery"); err != nil {
		t.Fatal(err)
	}
	admin, err := s.AuthenticatePlatformAdmin(ctx, "ops", "correct-horse-battery")
	if err != nil || admin == nil {
		t.Fatal(err)
	}
	actor := AuditActor{AdminID: admin.ID, AdminUsername: admin.Username, IP: "127.0.0.1"}
	if _, _, err := s.CreateImpersonationSession(ctx, ImpersonationInput{
		AdminID: admin.ID, AdminUsername: admin.Username, TenantID: demo.ID, UserID: user.ID, ExpiresAt: time.Now().Add(time.Hour),
		Reason: "Podrška pri gašenju naloga",
	}); err != nil {
		t.Fatal(err)
	}
	var impersonationID int64
	if err := s.db.QueryRowContext(ctx, `SELECT MAX(id) FROM impersonation_events`).Scan(&impersonationID); err != nil {
		t.Fatal(err)
	}
	if err := s.RecordImpersonationAction(ctx, impersonationID, domain.PlatformImpersonationAction{
		At: time.Now().UTC().Format(time.RFC3339), Method: "PUT", Route: "/customers/{id}", Path: "/customers/cust-1", Status: 200,
	}); err != nil {
		t.Fatal(err)
	}

	other, err := s.PlatformCreateTenant(ctx, actor, domain.PlatformCreateTenantInput{
		Name: "Druga", Slug: "druga", AdminUsername: "sef", AdminPassword: "lozinka123",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.UpsertCustomer(ContextWithTenant(ctx, other.ID), domain.Customer{ID: "cust-druga-1", Name: "Klijent druge firme"}); err != nil {
		t.Fatal(err)
	}
	return s, ctx, actor, other
}

func TestPlatformExportTenant(t *testing.T) {
	s, ctx, actor, _ := offboardingFixture(t)
	demo, _ := s.TenantBySlug(ctx, DemoTenantSlug)
	want := tenantRowCounts(t, ctx, s, demo.ID)

	export, err := s.PlatformExportTenant(ctx, actor, DemoTenantSlug)
	if err != nil || export == nil {
		t.Fatalf("export = %v, %v", export, err)
	}
	if export.Format != domain.PlatformTenantExportFormat || export.FormatVersion != domain.PlatformTenantExportVersion ||
		export.ExportedAt == "" || export.SchemaVersion < 25 || export.Tenant.Slug != DemoTenantSlug {
		t.Fatalf("export header = %+v", export)
	}
	for _, table := range tenantDataTables {
		rows, ok := export.Tables[table.name]
		if table.noExport {
			if ok {
				t.Errorf("table %s must not be exported", table.name)
			}
			continue
		}
		if !ok || len(rows) != want[table.name] || export.Counts[table.name] != want[table.name] {
			t.Errorf("export %s = %d rows (count %d), want %d", table.name, len(rows), export.Counts[table.name], want[table.name])
		}
	}
	// The demo seed fills the tables that matter.
	for _, table := range []string{"users", "customers", "locations", "work_orders", "catalog_items", "stock_movements",
		"process_templates", "work_order_processes", "app_settings", "impersonation_events", "impersonation_actions"} {
		if len(export.Tables[table]) == 0 {
			t.Errorf("export has no %s", table)
		}
	}
	for _, user := range export.Tables["users"] {
		if _, ok := user["password_hash"]; ok {
			t.Fatal("export leaks password hashes")
		}
	}
	for _, customer := range export.Tables["customers"] {
		if customer["tenant_id"] != demo.ID {
			t.Fatalf("export holds another tenant's customer: %v", customer)
		}
	}

	// JSON columns are embedded as JSON; the whole document round-trips.
	raw, err := json.Marshal(export)
	if err != nil {
		t.Fatal(err)
	}
	var decoded struct {
		Tables map[string][]map[string]any `json:"tables"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	if _, ok := decoded.Tables["work_orders"][0]["payload"].(map[string]any); !ok {
		t.Fatalf("work order payload not embedded as JSON: %T", decoded.Tables["work_orders"][0]["payload"])
	}

	log, err := s.PlatformAuditLog(ctx, 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if latest := log.Items[0]; latest.Action != domain.AuditTenantExport || latest.TenantSlug != DemoTenantSlug || latest.Detail["totalRows"] == "" {
		t.Fatalf("export audit = %+v", latest)
	}
	if missing, err := s.PlatformExportTenant(ctx, actor, "missing"); err != nil || missing != nil {
		t.Fatalf("export unknown = %v, %v", missing, err)
	}
}

func TestPlatformDeleteTenant(t *testing.T) {
	s, ctx, actor, other := offboardingFixture(t)
	demo, _ := s.TenantBySlug(ctx, DemoTenantSlug)
	otherBefore := tenantRowCounts(t, ctx, s, other.ID)
	var auditBefore int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM platform_audit_events`).Scan(&auditBefore); err != nil {
		t.Fatal(err)
	}

	var validation *ValidationError
	if _, err := s.PlatformDeleteTenant(ctx, actor, DemoTenantSlug, DemoTenantSlug); !errors.As(err, &validation) || err.Error() != tenantDeleteNotSuspendedMessage {
		t.Fatalf("delete active organization = %v, want not-suspended error", err)
	}
	if _, err := s.PlatformSetTenantSuspended(ctx, actor, DemoTenantSlug, true); err != nil {
		t.Fatal(err)
	}
	// Suspension ended the ordinary session; the impersonation one remains.
	before := tenantRowCounts(t, ctx, s, demo.ID)
	if before["sessions"] != 1 || before["impersonation_actions"] != 1 {
		t.Fatalf("fixture rows = %+v", before)
	}
	for _, confirm := range []string{"", "dem", "DEMO", "druga"} {
		if _, err := s.PlatformDeleteTenant(ctx, actor, DemoTenantSlug, confirm); !errors.As(err, &validation) || err.Error() != tenantDeleteConfirmMessage {
			t.Fatalf("delete with confirm %q = %v, want confirmation error", confirm, err)
		}
	}
	if gone, _ := s.TenantBySlug(ctx, DemoTenantSlug); gone == nil {
		t.Fatal("a refused delete removed the organization")
	}

	deletion, err := s.PlatformDeleteTenant(ctx, actor, DemoTenantSlug, DemoTenantSlug)
	if err != nil || deletion == nil {
		t.Fatalf("delete = %v, %v", deletion, err)
	}
	total := 0
	for _, table := range tenantDataTables {
		count := before[table.name]
		if table.keepOnDelete {
			if _, ok := deletion.Rows[table.name]; ok {
				t.Errorf("deletion reports %s, which is kept", table.name)
			}
			continue
		}
		total += count
		if deletion.Rows[table.name] != count {
			t.Errorf("deleted %s = %d, want %d", table.name, deletion.Rows[table.name], count)
		}
	}
	if deletion.TotalRows != total || deletion.Slug != DemoTenantSlug || deletion.Name != demo.Name {
		t.Fatalf("deletion = %+v, want total %d", deletion, total)
	}
	if gone, _ := s.TenantBySlug(ctx, DemoTenantSlug); gone != nil {
		t.Fatal("organization still exists")
	}
	for table, count := range tenantRowCounts(t, ctx, s, demo.ID) {
		if count != 0 {
			t.Errorf("table %s still has %d rows of the deleted organization", table, count)
		}
	}
	// Nothing of the deleted tenant is left in any table with a tenant_id
	// (including ones a cascade would have reached).
	for _, table := range schemaTables(t, ctx, s) {
		if table == "platform_audit_events" || !tableHasColumn(t, ctx, s, table, "tenant_id") {
			continue
		}
		var count int
		if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM `+table+` WHERE tenant_id = ?`, demo.ID).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Errorf("table %s still has %d rows of the deleted organization", table, count)
		}
	}
	// The other organization is untouched.
	otherAfter := tenantRowCounts(t, ctx, s, other.ID)
	for table, count := range otherBefore {
		if otherAfter[table] != count {
			t.Errorf("other organization's %s: %d rows, want %d", table, otherAfter[table], count)
		}
	}
	if otherBefore["customers"] != 1 || otherBefore["users"] != 1 {
		t.Fatalf("other organization fixture = %+v", otherBefore)
	}

	// The activity log keeps every earlier event plus the deletion, by name.
	var auditAfter, linked int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM platform_audit_events`).Scan(&auditAfter); err != nil {
		t.Fatal(err)
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM platform_audit_events WHERE tenant_id = ?`, demo.ID).Scan(&linked); err != nil {
		t.Fatal(err)
	}
	// +1 suspend, +1 delete.
	if auditAfter != auditBefore+2 || linked != 0 {
		t.Fatalf("audit rows = %d (linked %d), want %d", auditAfter, linked, auditBefore+2)
	}
	log, err := s.PlatformAuditLog(ctx, 50, 0)
	if err != nil {
		t.Fatal(err)
	}
	latest := log.Items[0]
	if latest.Action != domain.AuditTenantDelete || latest.TenantSlug != DemoTenantSlug || latest.TenantName != demo.Name ||
		latest.Detail["workOrders"] != itoa(before["work_orders"]) || latest.Detail["users"] != itoa(before["users"]) {
		t.Fatalf("delete audit = %+v", latest)
	}
	impersonations := 0
	for _, event := range log.Items {
		if event.Action == domain.AuditImpersonationStart && event.TenantSlug == DemoTenantSlug {
			impersonations++
			// The impersonation itself survives (v30): status, reason and trail.
			if event.Impersonation == nil || event.Impersonation.ActionCount != 1 || event.Impersonation.Reason != "Podrška pri gašenju naloga" {
				t.Fatalf("impersonation of the deleted organization = %+v", event.Impersonation)
			}
			actions, found, err := s.ImpersonationActions(ctx, event.Impersonation.ID)
			if err != nil || !found || len(actions) != 1 || actions[0].Path != "/customers/cust-1" {
				t.Fatalf("impersonation trail after delete = %+v, %v, %v", actions, found, err)
			}
		}
	}
	if impersonations != 1 {
		t.Fatalf("impersonation audit rows of the deleted organization = %d, want 1", impersonations)
	}
	var kept int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM impersonation_events WHERE tenant_id IS NULL AND tenant_slug = ? AND tenant_name = ?`,
		DemoTenantSlug, demo.Name,
	).Scan(&kept); err != nil {
		t.Fatal(err)
	}
	if kept != before["impersonation_events"] || kept == 0 {
		t.Fatalf("detached impersonation events = %d, want %d", kept, before["impersonation_events"])
	}

	if again, err := s.PlatformDeleteTenant(ctx, actor, DemoTenantSlug, DemoTenantSlug); err != nil || again != nil {
		t.Fatalf("second delete = %v, %v", again, err)
	}
}

func itoa(n int) string {
	raw, _ := json.Marshal(n)
	return string(raw)
}
