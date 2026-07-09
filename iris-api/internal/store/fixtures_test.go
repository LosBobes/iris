package store

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/testutil"
)

func TestUpdateWorkOrderAllowsBlankIssuedBy(t *testing.T) {
	ctx := testTenantContext()
	st := newSQLiteStoreForTest(t, ctx, t.TempDir()+"/iris.db")
	defer st.Close()

	created, err := st.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName:     "Klijent",
		JobDescription: "Posao",
		Shipping:       domain.Shipping{},
		Assignment:     domain.Assignment{Priority: domain.WorkOrderPriorityNormal},
		IssuedBy:       "admin",
		IssueDate:      "2026-06-21",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	// Simulate a seeded/legacy order that has no issuer recorded.
	legacy := *created
	legacy.IssuedBy = ""
	if err := st.PutWorkOrder(ctx, legacy); err != nil {
		t.Fatalf("put legacy: %v", err)
	}

	updated, err := st.UpdateWorkOrder(ctx, created.ID, domain.UpdateWorkOrderInput{
		"status":      json.RawMessage(`"assigned"`),
		"isCompleted": json.RawMessage(`false`),
	})
	if err != nil {
		t.Fatalf("update on blank-issuedBy order must succeed, got: %v", err)
	}
	if updated.Status != domain.WorkOrderStatusAssigned {
		t.Fatalf("status = %q, want assigned", updated.Status)
	}
}

func TestFixtureStoreUsers(t *testing.T) {
	store := NewFixtureStore(testutil.FixtureDir(t))

	users, err := store.Users(context.Background())
	if err != nil {
		t.Fatalf("Users() returned error: %v", err)
	}

	if len(users) != 5 {
		t.Fatalf("Users() length = %d, want 5", len(users))
	}

	byName := make(map[string]domain.UserRole, len(users))
	for _, user := range users {
		byName[user.Username] = user.Role
	}
	if byName["admin"] != domain.RoleAdmin {
		t.Fatalf("expected admin user with admin role, got %q", byName["admin"])
	}
	if byName["ana.jovic"] != domain.RoleUser {
		t.Fatalf("expected ana.jovic with user role, got %q", byName["ana.jovic"])
	}
}

func TestFixtureStoreOperatorsSortedUnique(t *testing.T) {
	store := NewFixtureStore(testutil.FixtureDir(t))

	operators, err := store.Operators(context.Background())
	if err != nil {
		t.Fatalf("Operators() returned error: %v", err)
	}

	// Admins are assignable too, so "admin" is included (sorted first).
	want := []string{"admin", "ana.jovic", "jelena.markovic", "marko.petrovic", "stefan.nikolic"}
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

	customers, err := store.Customers(context.Background(), CustomerQuery{})
	if err != nil {
		t.Fatalf("Customers() returned error: %v", err)
	}
	if len(customers.Items) == 0 {
		t.Fatal("Customers().Items length = 0, want fixture-backed customers")
	}

	locations, err := store.Locations(context.Background(), "")
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

	workOrder, err := store.WorkOrderByID(context.Background(), "1")
	if err != nil {
		t.Fatalf("WorkOrderByID() returned error: %v", err)
	}
	if workOrder == nil {
		t.Fatal("WorkOrderByID() = nil, want non-nil")
	}
	if workOrder.OrderNumber != "RN-2024-00001" {
		t.Fatalf("OrderNumber = %q, want %q", workOrder.OrderNumber, "RN-2024-00001")
	}

	missing, err := store.WorkOrderByID(context.Background(), "missing")
	if err != nil {
		t.Fatalf("WorkOrderByID(missing) returned error: %v", err)
	}
	if missing != nil {
		t.Fatalf("WorkOrderByID(missing) = %#v, want nil", missing)
	}
}

func TestFixtureStoreNormalizesCollectionFields(t *testing.T) {
	store := NewFixtureStore(testutil.FixtureDir(t))

	workOrder, err := store.WorkOrderByID(context.Background(), "13")
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

	created, err := store.CreateWorkOrder(context.Background(), domain.CreateWorkOrderInput{
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

	updated, err := store.UpdateWorkOrder(context.Background(), created.ID, domain.UpdateWorkOrderInput{
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
	lastEvent := updated.Events[len(updated.Events)-1]
	if lastEvent.Label != "Status promenjen na Dodeljen" {
		t.Fatalf("last event label = %q, want Serbian status label", lastEvent.Label)
	}

	deleted, err := store.DeleteWorkOrder(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("DeleteWorkOrder() returned error: %v", err)
	}
	if !deleted.Success {
		t.Fatalf("DeleteWorkOrder().Success = %v, want true", deleted.Success)
	}

	afterDelete, err := store.WorkOrderByID(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("WorkOrderByID(after delete) returned error: %v", err)
	}
	if afterDelete != nil {
		t.Fatalf("WorkOrderByID(after delete) = %#v, want nil", afterDelete)
	}

	missingDelete, err := store.DeleteWorkOrder(context.Background(), "missing")
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

// The clients advance status by sending only {"status": ...} and rely on the
// store to own the completion date: stamp it on the move into "completed",
// preserve it through "invoiced", and clear it if the order leaves the done
// state. This guards that contract.
func TestFixtureStoreStampsCompletionDateFromStatus(t *testing.T) {
	store := NewFixtureStore(testutil.FixtureDir(t))
	ctx := context.Background()

	created, err := store.CreateWorkOrder(ctx, domain.CreateWorkOrderInput{
		ClientName:     "Klijent",
		JobDescription: "Štampa",
		Shipping:       domain.Shipping{},
		IssuedBy:       "admin",
		IssueDate:      "2026-04-25",
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder() returned error: %v", err)
	}
	if created.CompletionDate != nil {
		t.Fatalf("new order CompletionDate = %v, want nil", created.CompletionDate)
	}

	today := time.Now().UTC().Format("2006-01-02")

	// Walk the valid status graph up to "completed".
	for _, status := range []string{"assigned", "inProgress", "completed"} {
		if _, err := store.UpdateWorkOrder(ctx, created.ID, domain.UpdateWorkOrderInput{
			"status": json.RawMessage(`"` + status + `"`),
		}); err != nil {
			t.Fatalf("UpdateWorkOrder(%s) returned error: %v", status, err)
		}
	}
	completed, err := store.WorkOrderByID(ctx, created.ID)
	if err != nil {
		t.Fatalf("WorkOrderByID(completed) returned error: %v", err)
	}
	if !completed.IsCompleted {
		t.Fatal("completed.IsCompleted = false, want true")
	}
	if completed.CompletionDate == nil || *completed.CompletionDate != today {
		t.Fatalf("completed.CompletionDate = %v, want %q", completed.CompletionDate, today)
	}

	// Moving on to "invoiced" must keep the original completion date, not
	// re-stamp it.
	invoiced, err := store.UpdateWorkOrder(ctx, completed.ID, domain.UpdateWorkOrderInput{
		"status": json.RawMessage(`"invoiced"`),
	})
	if err != nil {
		t.Fatalf("UpdateWorkOrder(invoiced) returned error: %v", err)
	}
	if invoiced.CompletionDate == nil || *invoiced.CompletionDate != today {
		t.Fatalf("invoiced.CompletionDate = %v, want preserved %q", invoiced.CompletionDate, today)
	}
}

func TestFixtureStoreLogsFieldChangeEvents(t *testing.T) {
	store := NewFixtureStore(testutil.FixtureDir(t))

	created, err := store.CreateWorkOrder(context.Background(), domain.CreateWorkOrderInput{
		ClientName:     "Stari naziv",
		JobDescription: "Štampa brošure",
		Shipping:       domain.Shipping{},
		IssuedBy:       "admin",
		IssueDate:      "2026-04-25",
	})
	if err != nil {
		t.Fatalf("CreateWorkOrder() returned error: %v", err)
	}

	before := len(created.Events)

	updated, err := store.UpdateWorkOrder(context.Background(), created.ID, domain.UpdateWorkOrderInput{
		"clientName": json.RawMessage(`"Novi naziv"`),
		"price":      json.RawMessage(`67000`),
	})
	if err != nil {
		t.Fatalf("UpdateWorkOrder() returned error: %v", err)
	}

	newEvents := updated.Events[before:]
	if len(newEvents) != 2 {
		t.Fatalf("new events = %d, want 2 change events; got %#v", len(newEvents), newEvents)
	}

	labels := map[string]bool{}
	for _, e := range newEvents {
		if e.Kind != "change" {
			t.Fatalf("event kind = %q, want change", e.Kind)
		}
		labels[e.Label] = true
	}
	if !labels["Naziv klijenta: Stari naziv → Novi naziv"] {
		t.Fatalf("missing client-name diff; got labels %v", labels)
	}
	if !labels["Cena: — → 67.000 RSD"] {
		t.Fatalf("missing price diff; got labels %v", labels)
	}

	// Re-saving identical values must not generate further change events.
	again, err := store.UpdateWorkOrder(context.Background(), created.ID, domain.UpdateWorkOrderInput{
		"clientName": json.RawMessage(`"Novi naziv"`),
	})
	if err != nil {
		t.Fatalf("UpdateWorkOrder() returned error: %v", err)
	}
	if len(again.Events) != len(updated.Events) {
		t.Fatalf("events grew on no-op update: %d -> %d", len(updated.Events), len(again.Events))
	}
}

func TestFixtureStoreRejectsInvalidStatusTransition(t *testing.T) {
	store := NewFixtureStore(testutil.FixtureDir(t))

	updated, err := store.UpdateWorkOrder(context.Background(), "3", domain.UpdateWorkOrderInput{
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

	updated, err := store.UpdateWorkOrder(context.Background(), "1", domain.UpdateWorkOrderInput{
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

	_, err := store.Users(context.Background())
	if err == nil {
		t.Fatal("Users() error = nil, want non-nil for missing file")
	}
}
