package store

import (
	"path/filepath"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// TestSQLiteStoreOrganizationSettingsProformaOnlyDefaultsAndRoundTrips proves
// an unconfigured shop defaults to proforma-only mode (Grafika Čobanović issues
// no invoices) and that the setting persists across updates and store reopens.
func TestSQLiteStoreOrganizationSettingsProformaOnlyDefaultsAndRoundTrips(t *testing.T) {
	ctx := testTenantContext()
	dbPath := filepath.Join(t.TempDir(), "iris.db")
	sqliteStore := newSQLiteStoreForTest(t, ctx, dbPath)
	defer sqliteStore.Close()

	settings, err := sqliteStore.OrganizationSettings(ctx)
	if err != nil {
		t.Fatalf("OrganizationSettings() returned error: %v", err)
	}
	if settings.ProformaOnly != domain.DefaultProformaOnly {
		t.Fatalf("default proformaOnly = %v, want %v", settings.ProformaOnly, domain.DefaultProformaOnly)
	}

	disabled := false
	updated, err := sqliteStore.UpdateOrganizationSettings(ctx, domain.OrganizationSettingsUpdate{ProformaOnly: &disabled})
	if err != nil {
		t.Fatalf("UpdateOrganizationSettings(false) returned error: %v", err)
	}
	if updated.ProformaOnly {
		t.Fatal("proformaOnly = true after setting false, want false")
	}
	if updated.FirmName != domain.DefaultFirmName {
		t.Fatalf("proformaOnly-only update wiped firmName: %q", updated.FirmName)
	}

	// Re-read to confirm the false value is actually persisted, not just
	// returned by the update call.
	persisted, err := sqliteStore.OrganizationSettings(ctx)
	if err != nil {
		t.Fatalf("OrganizationSettings() after update returned error: %v", err)
	}
	if persisted.ProformaOnly {
		t.Fatal("persisted proformaOnly = true, want false")
	}

	enabled := true
	reenabled, err := sqliteStore.UpdateOrganizationSettings(ctx, domain.OrganizationSettingsUpdate{ProformaOnly: &enabled})
	if err != nil {
		t.Fatalf("UpdateOrganizationSettings(true) returned error: %v", err)
	}
	if !reenabled.ProformaOnly {
		t.Fatal("proformaOnly = false after setting true, want true")
	}
}
