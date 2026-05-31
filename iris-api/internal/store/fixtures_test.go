package store

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/testutil"
)

func TestFixtureStoreUsers(t *testing.T) {
	store := NewFixtureStore(testutil.FixtureDir(t))

	users, err := store.Users()
	if err != nil {
		t.Fatalf("Users() returned error: %v", err)
	}

	if len(users) != 1 {
		t.Fatalf("Users() length = %d, want 1", len(users))
	}

	if users[0].Username != "admin" {
		t.Fatalf("Users()[0].Username = %q, want %q", users[0].Username, "admin")
	}
}

func TestFixtureStoreOperatorsSortedUnique(t *testing.T) {
	store := NewFixtureStore(testutil.FixtureDir(t))

	operators, err := store.Operators()
	if err != nil {
		t.Fatalf("Operators() returned error: %v", err)
	}

	want := []string{"ana.jovic", "jelena.markovic", "marko.petrovic", "stefan.nikolic"}
	if len(operators) != len(want) {
		t.Fatalf("Operators() length = %d, want %d", len(operators), len(want))
	}

	for i := range want {
		if operators[i] != want[i] {
			t.Fatalf("Operators()[%d] = %q, want %q", i, operators[i], want[i])
		}
	}
}

func TestFixtureStoreCustomersAndLocations(t *testing.T) {
	store := NewFixtureStore(testutil.FixtureDir(t))

	customers, err := store.Customers()
	if err != nil {
		t.Fatalf("Customers() returned error: %v", err)
	}
	if len(customers) == 0 {
		t.Fatal("Customers() length = 0, want fixture-backed customers")
	}

	locations, err := store.Locations()
	if err != nil {
		t.Fatalf("Locations() returned error: %v", err)
	}
	if len(locations) == 0 {
		t.Fatal("Locations() length = 0, want fixture-backed locations")
	}
	if locations[0].CustomerID == "" {
		t.Fatalf("Locations()[0] = %#v, want customer linkage", locations[0])
	}
}

func TestFixtureStoreWorkOrderByID(t *testing.T) {
	store := NewFixtureStore(testutil.FixtureDir(t))

	workOrder, err := store.WorkOrderByID("1")
	if err != nil {
		t.Fatalf("WorkOrderByID() returned error: %v", err)
	}
	if workOrder == nil {
		t.Fatal("WorkOrderByID() = nil, want non-nil")
	}
	if workOrder.OrderNumber != "RN-2024-0001" {
		t.Fatalf("OrderNumber = %q, want %q", workOrder.OrderNumber, "RN-2024-0001")
	}

	missing, err := store.WorkOrderByID("missing")
	if err != nil {
		t.Fatalf("WorkOrderByID(missing) returned error: %v", err)
	}
	if missing != nil {
		t.Fatalf("WorkOrderByID(missing) = %#v, want nil", missing)
	}
}

func TestFixtureStoreNormalizesCollectionFields(t *testing.T) {
	store := NewFixtureStore(testutil.FixtureDir(t))

	workOrder, err := store.WorkOrderByID("13")
	if err != nil {
		t.Fatalf("WorkOrderByID() returned error: %v", err)
	}
	if workOrder == nil {
		t.Fatal("WorkOrderByID() = nil, want non-nil")
	}

	if workOrder.InternalNotes == nil {
		t.Fatal("InternalNotes = nil, want empty slice")
	}
	if workOrder.CustomerNotes == nil {
		t.Fatal("CustomerNotes = nil, want empty slice")
	}
	if workOrder.Attachments == nil {
		t.Fatal("Attachments = nil, want empty slice")
	}
	if workOrder.MaterialUsage == nil {
		t.Fatal("MaterialUsage = nil, want empty slice")
	}
	if workOrder.TimeEntries == nil {
		t.Fatal("TimeEntries = nil, want empty slice")
	}
	if workOrder.InvoiceDraft.LineItems == nil {
		t.Fatal("InvoiceDraft.LineItems = nil, want empty slice")
	}
}

func TestFixtureStoreCreateUpdateDeleteWorkOrder(t *testing.T) {
	store := NewFixtureStore(testutil.FixtureDir(t))

	created, err := store.CreateWorkOrder(domain.CreateWorkOrderInput{
		ClientName:     "Novi klijent",
		ContactPerson:  nil,
		JobDescription: "Štampa brošure",
		JobDetails:     nil,
		Shipping: domain.Shipping{
			DeliveryMethod:    nil,
			HasPackaging:      false,
			HasLabeling:       false,
			IsFragile:         false,
			RequiresSignature: false,
			HasInsurance:      false,
			ShippingAddress:   nil,
		},
		IssuedBy:  "admin",
		IssueDate: "2026-04-25",
		DueDate:   nil,
		Price:     nil,
		Note:      nil,
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder() returned error: %v", err)
	}
	if created == nil {
		t.Fatal("CreateWorkOrder() = nil, want non-nil")
	}
	if created.Status != domain.WorkOrderStatusNew {
		t.Fatalf("Status = %q, want %q", created.Status, domain.WorkOrderStatusNew)
	}
	if created.Assignment.Priority != domain.WorkOrderPriorityNormal {
		t.Fatalf("Assignment.Priority = %q, want normal", created.Assignment.Priority)
	}
	if created.Communication.PublicToken == "" {
		t.Fatal("Communication.PublicToken = empty, want generated public token")
	}
	if !strings.HasPrefix(created.OrderNumber, "RN-") {
		t.Fatalf("OrderNumber = %q, want RN- prefix", created.OrderNumber)
	}

	updated, err := store.UpdateWorkOrder(created.ID, domain.UpdateWorkOrderInput{
		"status": json.RawMessage(`"assigned"`),
	})
	if err != nil {
		t.Fatalf("UpdateWorkOrder() returned error: %v", err)
	}
	if updated == nil {
		t.Fatal("UpdateWorkOrder() = nil, want non-nil")
	}
	if updated.Status != domain.WorkOrderStatusAssigned || updated.IsCompleted {
		t.Fatalf("updated = %#v, want assigned work order", updated)
	}

	deleted, err := store.DeleteWorkOrder(created.ID)
	if err != nil {
		t.Fatalf("DeleteWorkOrder() returned error: %v", err)
	}
	if !deleted.Success {
		t.Fatalf("DeleteWorkOrder().Success = %v, want true", deleted.Success)
	}

	afterDelete, err := store.WorkOrderByID(created.ID)
	if err != nil {
		t.Fatalf("WorkOrderByID(after delete) returned error: %v", err)
	}
	if afterDelete != nil {
		t.Fatalf("WorkOrderByID(after delete) = %#v, want nil", afterDelete)
	}

	missingDelete, err := store.DeleteWorkOrder("missing")
	if err != nil {
		t.Fatalf("DeleteWorkOrder(missing) returned error: %v", err)
	}
	if missingDelete.Success {
		t.Fatalf("DeleteWorkOrder(missing).Success = %v, want false", missingDelete.Success)
	}
	if missingDelete.Message != "Radni nalog nije pronađen." {
		t.Fatalf("DeleteWorkOrder(missing).Message = %q, want not-found message", missingDelete.Message)
	}
}

func TestFixtureStoreRejectsInvalidStatusTransition(t *testing.T) {
	store := NewFixtureStore(testutil.FixtureDir(t))

	updated, err := store.UpdateWorkOrder("3", domain.UpdateWorkOrderInput{
		"status": json.RawMessage(`"invoiced"`),
	})
	if err == nil {
		t.Fatal("UpdateWorkOrder() error = nil, want invalid transition error")
	}
	if updated != nil {
		t.Fatalf("UpdateWorkOrder() = %#v, want nil on invalid transition", updated)
	}
	if err.Error() != "Promena statusa nije dozvoljena." {
		t.Fatalf("error = %q, want invalid transition message", err.Error())
	}
}

func TestFixtureStoreRejectsInvalidUpdateField(t *testing.T) {
	store := NewFixtureStore(testutil.FixtureDir(t))

	updated, err := store.UpdateWorkOrder("1", domain.UpdateWorkOrderInput{
		"unknownField": json.RawMessage(`true`),
	})
	if err == nil {
		t.Fatal("UpdateWorkOrder() error = nil, want validation error")
	}
	if updated != nil {
		t.Fatalf("UpdateWorkOrder() = %#v, want nil on validation error", updated)
	}
}

func TestFixtureStoreMissingFile(t *testing.T) {
	tempDir := t.TempDir()
	store := NewFixtureStore(tempDir)

	_, err := store.Users()
	if err == nil {
		t.Fatal("Users() error = nil, want non-nil for missing file")
	}
}
