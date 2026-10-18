package store

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// TestOrganizationSettingsBypassCacheForModulesAndUpdates: a write from
// another process (irisctl, raw SQL) is invisible to the settings cache, but
// modules must still be current and an update must not write back the stale
// cached copy of keys it did not touch.
func TestOrganizationSettingsBypassCacheForModulesAndUpdates(t *testing.T) {
	ctx := context.Background()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer s.Close()
	tctx := testTenantContext()

	if _, err := s.OrganizationSettings(tctx); err != nil { // warm the cache
		t.Fatal(err)
	}
	for key, value := range map[string]string{
		modulesSettingKey:  `{"stock":true,"processes":false}`,
		firmNameSettingKey: "Spolja d.o.o.",
	} {
		if _, err := s.db.Exec(`INSERT INTO app_settings(tenant_id, key, value) VALUES (?, ?, ?)
			ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value`, DemoTenantID, key, value); err != nil {
			t.Fatal(err)
		}
	}

	settings, err := s.OrganizationSettings(tctx)
	if err != nil {
		t.Fatal(err)
	}
	if !settings.Modules.Stock {
		t.Fatalf("modules = %+v, want stock on right after an out-of-process switch", settings.Modules)
	}

	show := true
	updated, err := s.UpdateOrganizationSettings(tctx, domain.OrganizationSettingsUpdate{ShowShippingOptions: &show})
	if err != nil {
		t.Fatal(err)
	}
	if updated.FirmName != "Spolja d.o.o." {
		t.Fatalf("update returned firm name %q, want the stored one", updated.FirmName)
	}
	var stored string
	if err := s.db.QueryRow(`SELECT value FROM app_settings WHERE tenant_id = ? AND key = ?`, DemoTenantID, firmNameSettingKey).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored != "Spolja d.o.o." {
		t.Fatalf("firm name clobbered by the update: %q", stored)
	}
	if after, _ := s.OrganizationSettings(tctx); !after.ShowShippingOptions || after.FirmName != "Spolja d.o.o." {
		t.Fatalf("settings after update = %+v", after)
	}
}
