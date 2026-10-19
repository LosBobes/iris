package main

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

func TestSetModules(t *testing.T) {
	ctx := context.Background()
	dataStore := mustOpenSQLite(ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer dataStore.Close()
	if err := dataStore.EnsureTenant(ctx, "t1", "prva", "Prva"); err != nil {
		t.Fatal(err)
	}
	on, off := true, false

	// Planning needs processes, which needs stock.
	if _, err := setModules(ctx, dataStore, "prva", domain.OrganizationModulesUpdate{Planning: &on}); err == nil ||
		!strings.Contains(err.Error(), "Planiranje") {
		t.Fatalf("planning alone = %v", err)
	}
	report, err := setModules(ctx, dataStore, "prva", domain.OrganizationModulesUpdate{Stock: &on, Processes: &on, Planning: &on})
	if err != nil || !strings.Contains(report, "Planiranje on") || !strings.Contains(report, "Magacin on") {
		t.Fatalf("all on = %q, %v", report, err)
	}
	// An omitted flag stays as it is.
	report, err = setModules(ctx, dataStore, "prva", domain.OrganizationModulesUpdate{Planning: &off})
	if err != nil || !strings.Contains(report, "Planiranje off") || !strings.Contains(report, "Procesi rada on") {
		t.Fatalf("planning off = %q, %v", report, err)
	}
	modules, err := dataStore.OrganizationModules(store.ContextWithTenant(ctx, "t1"))
	if err != nil || modules != (domain.OrganizationModules{Stock: true, Processes: true}) {
		t.Fatalf("stored modules = %+v, %v", modules, err)
	}
	if _, err := setModules(ctx, dataStore, "nepoznata", domain.OrganizationModulesUpdate{Stock: &on}); err == nil {
		t.Fatal("unknown organization accepted")
	}
}
