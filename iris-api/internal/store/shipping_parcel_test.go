package store

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func TestSQLiteShippingPackagesAndPostage(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()

	weight := 1.5
	postage := 650.0
	created, err := sqliteStore.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName:     "Test Klijent",
		JobDescription: "Štampa",
		IssuedBy:       "admin",
		IssueDate:      "2026-06-21",
		Shipping: domain.Shipping{
			Packages:         []domain.ShippingPackage{{WeightKg: &weight}, {}},
			EstimatedPostage: &postage,
		},
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder() error: %v", err)
	}

	loaded, err := sqliteStore.WorkOrderByID(ctx, created.ID)
	if err != nil {
		t.Fatalf("WorkOrderByID() error: %v", err)
	}
	packages := loaded.Shipping.Packages
	if len(packages) != 2 || packages[0].WeightKg == nil || *packages[0].WeightKg != 1.5 || packages[1].WeightKg != nil {
		t.Fatalf("packages = %+v, want [1.5 kg, unweighed]", packages)
	}
	if loaded.Shipping.EstimatedPostage == nil || *loaded.Shipping.EstimatedPostage != 650 {
		t.Fatalf("estimatedPostage = %v, want 650", loaded.Shipping.EstimatedPostage)
	}

	for name, shipping := range map[string]string{
		"zero weight":      `{"packages":[{"weightKg":0}]}`,
		"negative weight":  `{"packages":[{"weightKg":-2}]}`,
		"negative postage": `{"estimatedPostage":-1}`,
		"too many":         `{"packages":[` + strings.Repeat(`{"weightKg":null},`, 100) + `{"weightKg":null}]}`,
	} {
		if _, err := sqliteStore.UpdateWorkOrder(ctx, created.ID, domain.UpdateWorkOrderInput{
			"shipping": json.RawMessage(shipping),
		}); err == nil {
			t.Fatalf("%s: UpdateWorkOrder() accepted it, want validation error", name)
		}
	}

	updated, err := sqliteStore.UpdateWorkOrder(ctx, created.ID, domain.UpdateWorkOrderInput{
		"shipping": json.RawMessage(`{"packages":[{"weightKg":2.25}],"estimatedPostage":720}`),
	})
	if err != nil {
		t.Fatalf("UpdateWorkOrder() error: %v", err)
	}
	labels := map[string]bool{}
	for _, event := range updated.Events {
		labels[event.Label] = true
	}
	for _, want := range []string{
		"Paketi: 2 (1,5 kg; ? kg) → 1 (2,25 kg)",
		"Okvirna poštarina: 650 RSD → 720 RSD",
	} {
		if !labels[want] {
			t.Fatalf("events %v missing %q", labels, want)
		}
	}
}

func TestShippingMarshalsMissingPackagesAsEmptyArray(t *testing.T) {
	raw, err := json.Marshal(domain.Shipping{})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(raw), `"packages":[]`) {
		t.Fatalf("shipping JSON = %s, want packages as []", raw)
	}
}
