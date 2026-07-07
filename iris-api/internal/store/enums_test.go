package store

import (
	"path/filepath"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func TestSQLiteEnumValuesCRUDAndValidation(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()

	// Built-ins are present even with no custom values.
	values, err := sqliteStore.EnumValues(ctx)
	if err != nil {
		t.Fatalf("EnumValues() error: %v", err)
	}
	if len(values) != len(domain.BuiltinEnumValues()) {
		t.Fatalf("len(values) = %d, want %d built-ins", len(values), len(domain.BuiltinEnumValues()))
	}

	// Redefining a built-in value is rejected.
	if _, err := sqliteStore.CreateEnumValue(ctx, domain.EnumValueInput{
		Field: domain.EnumFieldDeliveryMethod, Value: "pickup", Label: "Drugačije",
	}); err == nil {
		t.Fatal("CreateEnumValue() accepted a built-in value, want validation error")
	}

	// Create a custom delivery method.
	created, err := sqliteStore.CreateEnumValue(ctx, domain.EnumValueInput{
		Field: domain.EnumFieldDeliveryMethod, Value: "droneDelivery", Label: "Dostava dronom",
	})
	if err != nil {
		t.Fatalf("CreateEnumValue() error: %v", err)
	}

	// A work order using the custom value must validate and persist.
	method := domain.DeliveryMethod("droneDelivery")
	if _, err := sqliteStore.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName:     "Test Klijent",
		JobDescription: "Štampa",
		IssuedBy:       "admin",
		IssueDate:      "2026-06-21",
		Shipping:       domain.Shipping{DeliveryMethod: &method},
	}); err != nil {
		t.Fatalf("CreateWorkOrder() with custom delivery method error: %v", err)
	}

	// An unknown value is still rejected.
	unknown := domain.DeliveryMethod("teleport")
	if _, err := sqliteStore.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName:     "Test",
		JobDescription: "Štampa",
		IssuedBy:       "admin",
		IssueDate:      "2026-06-21",
		Shipping:       domain.Shipping{DeliveryMethod: &unknown},
	}); err == nil {
		t.Fatal("CreateWorkOrder() accepted unknown delivery method, want validation error")
	}

	// Delete the custom value.
	if err := sqliteStore.DeleteEnumValue(ctx, created.ID); err != nil {
		t.Fatalf("DeleteEnumValue() error: %v", err)
	}
	after, err := sqliteStore.EnumValues(ctx)
	if err != nil {
		t.Fatalf("EnumValues() error: %v", err)
	}
	if len(after) != len(domain.BuiltinEnumValues()) {
		t.Fatalf("after delete len = %d, want only built-ins", len(after))
	}
}

func TestSQLiteCustomInvoiceUnit(t *testing.T) {
	ctx := testTenantContext()
	sqliteStore := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	defer sqliteStore.Close()

	// An unknown invoice unit is rejected before any custom value exists.
	unknownLine := domain.InvoiceDraft{
		Status: domain.InvoiceDraftStatusDraft,
		LineItems: []domain.InvoiceLineItem{
			{ID: "l1", Kind: domain.InvoiceLineItemKindService, Description: "X", Quantity: 1, Unit: "tabak", UnitPrice: 100},
		},
	}
	if _, err := sqliteStore.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName: "Test", JobDescription: "Štampa", IssuedBy: "admin", IssueDate: "2026-06-21",
		InvoiceDraft: unknownLine,
	}); err == nil {
		t.Fatal("CreateWorkOrder() accepted unknown invoice unit, want validation error")
	}

	// Register a custom unit; a work order using it must now validate.
	if _, err := sqliteStore.CreateEnumValue(ctx, domain.EnumValueInput{
		Field: domain.EnumFieldInvoiceUnit, Value: "tabak", Label: "Tabak",
	}); err != nil {
		t.Fatalf("CreateEnumValue() error: %v", err)
	}
	if _, err := sqliteStore.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName: "Test", JobDescription: "Štampa", IssuedBy: "admin", IssueDate: "2026-06-21",
		InvoiceDraft: unknownLine,
	}); err != nil {
		t.Fatalf("CreateWorkOrder() with custom invoice unit error: %v", err)
	}

	// The built-in `set` stays service-only regardless of custom values.
	goodsSet := domain.InvoiceDraft{
		Status: domain.InvoiceDraftStatusDraft,
		LineItems: []domain.InvoiceLineItem{
			{ID: "l1", Kind: domain.InvoiceLineItemKindGoods, Description: "X", Quantity: 1, Unit: domain.InvoiceUnitSet, UnitPrice: 100},
		},
	}
	if _, err := sqliteStore.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName: "Test", JobDescription: "Štampa", IssuedBy: "admin", IssueDate: "2026-06-21",
		InvoiceDraft: goodsSet,
	}); err == nil {
		t.Fatal("CreateWorkOrder() accepted set unit on goods, want validation error")
	}
}
