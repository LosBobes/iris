package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
	"github.com/LosBobes/iris/iris-api/internal/testutil"
)

func TestLoginEndpoints(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		wantStatus int
		assertBody func(t *testing.T, body []byte)
	}{
		{
			name:       "login success",
			body:       `{"orgSlug":"demo","username":"admin","password":"admin123"}`,
			wantStatus: http.StatusOK,
			assertBody: func(t *testing.T, body []byte) {
				t.Helper()
				var response domain.LoginResponse
				if err := json.Unmarshal(body, &response); err != nil {
					t.Fatalf("decode response: %v", err)
				}
				if !response.Success || response.User == nil || response.User.Username != "admin" {
					t.Fatalf("response = %#v, want successful admin login", response)
				}
			},
		},
		{
			name:       "login failure",
			body:       `{"orgSlug":"demo","username":"wrong","password":"wrong"}`,
			wantStatus: http.StatusOK,
			assertBody: func(t *testing.T, body []byte) {
				t.Helper()
				var response domain.LoginResponse
				if err := json.Unmarshal(body, &response); err != nil {
					t.Fatalf("decode response: %v", err)
				}
				if response.Success || response.Error != "Neispravna organizacija, korisničko ime ili lozinka." {
					t.Fatalf("response = %#v, want failed auth with Serbian message", response)
				}
			},
		},
		{
			name:       "login bad json",
			body:       `{"username":`,
			wantStatus: http.StatusBadRequest,
			assertBody: func(t *testing.T, body []byte) {
				t.Helper()
				assertErrorResponse(t, body, "invalid JSON body")
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := performRequest(t, newTestServer(t), http.MethodPost, "/auth/login", test.body)
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d", response.Code, test.wantStatus)
			}
			test.assertBody(t, response.Body.Bytes())
		})
	}
}

func TestWorkOrderReadEndpoints(t *testing.T) {
	t.Run("list work orders", func(t *testing.T) {
		response := performRequest(t, newTestServer(t), http.MethodGet, "/work-orders", "")
		if response.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
		}

		var workOrders store.WorkOrderListResult
		if err := json.Unmarshal(response.Body.Bytes(), &workOrders); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if len(workOrders.Items) != 43 || workOrders.Total != 43 {
			t.Fatalf("workOrders = %#v, want 43 items and total", workOrders)
		}
	})

	t.Run("list operators", func(t *testing.T) {
		response := performRequest(t, newTestServer(t), http.MethodGet, "/work-orders/operators", "")
		if response.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
		}

		var operators []string
		if err := json.Unmarshal(response.Body.Bytes(), &operators); err != nil {
			t.Fatalf("decode response: %v", err)
		}

		// Admins are assignable too, so "admin" is included (sorted first).
		want := []string{"admin", "ana.jovic", "jelena.markovic", "marko.petrovic", "stefan.nikolic"}
		if len(operators) != len(want) {
			t.Fatalf("len(operators) = %d, want %d", len(operators), len(want))
		}
		for i := range want {
			if operators[i] != want[i] {
				t.Fatalf("operators[%d] = %q, want %q", i, operators[i], want[i])
			}
		}
	})

	t.Run("get work order by id", func(t *testing.T) {
		response := performRequest(t, newTestServer(t), http.MethodGet, "/work-orders/1", "")
		if response.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
		}

		var workOrder domain.WorkOrder
		if err := json.Unmarshal(response.Body.Bytes(), &workOrder); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if workOrder.OrderNumber != "RN-2024-00001" {
			t.Fatalf("OrderNumber = %q, want %q", workOrder.OrderNumber, "RN-2024-00001")
		}
	})

	t.Run("get work order by id not found", func(t *testing.T) {
		response := performRequest(t, newTestServer(t), http.MethodGet, "/work-orders/missing", "")
		if response.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want %d", response.Code, http.StatusNotFound)
		}
		assertErrorResponse(t, response.Body.Bytes(), "Radni nalog nije pronađen.")
	})
}

func TestCustomerLocationEndpoints(t *testing.T) {
	t.Run("list customers", func(t *testing.T) {
		response := performRequest(t, newTestServer(t), http.MethodGet, "/customers", "")
		if response.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
		}

		customers := decodeCustomerList(t, response.Body.Bytes())
		if len(customers) == 0 {
			t.Fatal("len(customers) = 0, want fixture-backed customers")
		}
		if customers[0].Name == "" {
			t.Fatalf("customers[0] = %#v, want named customer", customers[0])
		}
	})

	t.Run("list locations", func(t *testing.T) {
		response := performRequest(t, newTestServer(t), http.MethodGet, "/locations", "")
		if response.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
		}

		var locations []domain.Location
		if err := json.Unmarshal(response.Body.Bytes(), &locations); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if len(locations) == 0 {
			t.Fatal("len(locations) = 0, want fixture-backed locations")
		}
		if locations[0].CustomerID == "" {
			t.Fatalf("locations[0] = %#v, want customer linkage", locations[0])
		}
	})

	t.Run("list locations filtered by customerId", func(t *testing.T) {
		server := newTestServer(t)

		all := performRequest(t, server, http.MethodGet, "/locations", "")
		var allLocations []domain.Location
		if err := json.Unmarshal(all.Body.Bytes(), &allLocations); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if len(allLocations) == 0 {
			t.Fatal("len(allLocations) = 0, want fixture-backed locations")
		}
		customerID := allLocations[0].CustomerID

		filtered := performRequest(t, server, http.MethodGet, "/locations?customerId="+customerID, "")
		if filtered.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", filtered.Code, http.StatusOK)
		}
		var filteredLocations []domain.Location
		if err := json.Unmarshal(filtered.Body.Bytes(), &filteredLocations); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if len(filteredLocations) == 0 {
			t.Fatal("len(filteredLocations) = 0, want the customer's locations")
		}
		for _, location := range filteredLocations {
			if location.CustomerID != customerID {
				t.Fatalf("location.CustomerID = %q, want %q", location.CustomerID, customerID)
			}
		}
	})

	t.Run("create and delete customer and location update subsequent lists", func(t *testing.T) {
		server := newTestServer(t)

		customerPayload := `{"id":"cust-codex","name":"Codex Test","contactName":"Mina","email":"codex@example.test","phone":"+381 60 111 222"}`
		customerResponse := performRequest(t, server, http.MethodPut, "/customers/cust-codex", customerPayload)
		if customerResponse.Code != http.StatusOK {
			t.Fatalf("create customer status = %d, want %d", customerResponse.Code, http.StatusOK)
		}

		locationPayload := `{"id":"loc-codex","customerId":"cust-codex","name":"Codex Test Lokacija","address":"Bulevar testiranja 1"}`
		locationResponse := performRequest(t, server, http.MethodPut, "/locations/loc-codex", locationPayload)
		if locationResponse.Code != http.StatusOK {
			t.Fatalf("create location status = %d, want %d", locationResponse.Code, http.StatusOK)
		}

		customersResponse := performRequest(t, server, http.MethodGet, "/customers", "")
		customers := decodeCustomerList(t, customersResponse.Body.Bytes())
		assertCustomerPresence(t, customers, "cust-codex", true)

		locationsResponse := performRequest(t, server, http.MethodGet, "/locations", "")
		var locations []domain.Location
		if err := json.Unmarshal(locationsResponse.Body.Bytes(), &locations); err != nil {
			t.Fatalf("decode locations response: %v", err)
		}
		assertLocationPresence(t, locations, "loc-codex", true)

		deleteLocationResponse := performRequest(t, server, http.MethodDelete, "/locations/loc-codex", "")
		if deleteLocationResponse.Code != http.StatusOK {
			t.Fatalf("delete location status = %d, want %d", deleteLocationResponse.Code, http.StatusOK)
		}

		locationsResponse = performRequest(t, server, http.MethodGet, "/locations", "")
		if err := json.Unmarshal(locationsResponse.Body.Bytes(), &locations); err != nil {
			t.Fatalf("decode locations after delete: %v", err)
		}
		assertLocationPresence(t, locations, "loc-codex", false)

		deleteCustomerResponse := performRequest(t, server, http.MethodDelete, "/customers/cust-codex", "")
		if deleteCustomerResponse.Code != http.StatusOK {
			t.Fatalf("delete customer status = %d, want %d", deleteCustomerResponse.Code, http.StatusOK)
		}

		customersResponse = performRequest(t, server, http.MethodGet, "/customers", "")
		customers = decodeCustomerList(t, customersResponse.Body.Bytes())
		assertCustomerPresence(t, customers, "cust-codex", false)
	})

	t.Run("delete customer and location update subsequent lists", func(t *testing.T) {
		server := newTestServer(t)

		deleteLocationResponse := performRequest(t, server, http.MethodDelete, "/locations/loc-5", "")
		if deleteLocationResponse.Code != http.StatusOK {
			t.Fatalf("delete location status = %d, want %d", deleteLocationResponse.Code, http.StatusOK)
		}

		locationsResponse := performRequest(t, server, http.MethodGet, "/locations", "")
		var locations []domain.Location
		if err := json.Unmarshal(locationsResponse.Body.Bytes(), &locations); err != nil {
			t.Fatalf("decode locations response: %v", err)
		}
		for _, location := range locations {
			if location.ID == "loc-5" {
				t.Fatalf("locations still contains deleted location %#v", location)
			}
		}

		deleteCustomerResponse := performRequest(t, server, http.MethodDelete, "/customers/cust-4", "")
		if deleteCustomerResponse.Code != http.StatusOK {
			t.Fatalf("delete customer status = %d, want %d", deleteCustomerResponse.Code, http.StatusOK)
		}

		customersResponse := performRequest(t, server, http.MethodGet, "/customers", "")
		customers := decodeCustomerList(t, customersResponse.Body.Bytes())
		for _, customer := range customers {
			if customer.ID == "cust-4" {
				t.Fatalf("customers still contains deleted customer %#v", customer)
			}
		}

		locationsResponse = performRequest(t, server, http.MethodGet, "/locations", "")
		if err := json.Unmarshal(locationsResponse.Body.Bytes(), &locations); err != nil {
			t.Fatalf("decode locations after customer delete: %v", err)
		}
		for _, location := range locations {
			if location.CustomerID == "cust-4" {
				t.Fatalf("locations still contains cascade-deleted customer location %#v", location)
			}
		}
	})
}

func TestCORSMiddlewareAllowsAlternateLocalhostPort(t *testing.T) {
	server := NewServer(store.NewFixtureStore(testutil.FixtureDir(t)), Config{
		AllowedOrigins: []string{
			"http://localhost:5173",
			"http://127.0.0.1:5173",
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Origin", "http://localhost:5174")

	rec := httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5174" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, "http://localhost:5174")
	}
}

func TestCORSMiddlewareAllowsWebClientMutations(t *testing.T) {
	tests := []struct {
		name   string
		method string
		path   string
	}{
		{name: "upsert customer", method: http.MethodPut, path: "/customers/cust-cors"},
		{name: "upsert location", method: http.MethodPut, path: "/locations/loc-cors"},
		{name: "delete customer", method: http.MethodDelete, path: "/customers/cust-cors"},
		{name: "delete location", method: http.MethodDelete, path: "/locations/loc-cors"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodOptions, test.path, nil)
			req.Header.Set("Origin", "http://localhost:5173")
			req.Header.Set("Access-Control-Request-Method", test.method)
			req.Header.Set("Access-Control-Request-Headers", "content-type")

			rec := httptest.NewRecorder()
			newTestServer(t).Routes().ServeHTTP(rec, req)

			if rec.Code != http.StatusNoContent {
				t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
			}
			methods := rec.Header().Get("Access-Control-Allow-Methods")
			if !strings.Contains(methods, test.method) {
				t.Fatalf("Access-Control-Allow-Methods = %q, want to include %s", methods, test.method)
			}
		})
	}
}

func decodeCustomerList(t *testing.T, body []byte) []domain.Customer {
	t.Helper()
	var result struct {
		Items []domain.Customer `json:"items"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatalf("decode customer list: %v", err)
	}
	return result.Items
}

func decodeCatalogList(t *testing.T, body []byte) []domain.CatalogItem {
	t.Helper()
	var result struct {
		Items []domain.CatalogItem `json:"items"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatalf("decode catalog list: %v", err)
	}
	return result.Items
}

func assertCustomerPresence(t *testing.T, customers []domain.Customer, id string, want bool) {
	t.Helper()
	for _, customer := range customers {
		if customer.ID == id {
			if !want {
				t.Fatalf("customers still contains %q: %#v", id, customer)
			}
			return
		}
	}
	if want {
		t.Fatalf("customers does not contain %q", id)
	}
}

func assertLocationPresence(t *testing.T, locations []domain.Location, id string, want bool) {
	t.Helper()
	for _, location := range locations {
		if location.ID == id {
			if !want {
				t.Fatalf("locations still contains %q: %#v", id, location)
			}
			return
		}
	}
	if want {
		t.Fatalf("locations does not contain %q", id)
	}
}

func TestCreateWorkOrderEndpoint(t *testing.T) {
	server := newTestServer(t)
	payload := `{"clientName":"Novi klijent","contactPerson":null,"jobDescription":"Štampa brošure","jobDetails":null,"billingDocumentType":null,"billingDocumentNumber":null,"shipping":{"deliveryMethod":null,"hasPackaging":false,"hasLabeling":false,"isFragile":false,"requiresSignature":false,"hasInsurance":false,"shippingAddress":null},"issuedBy":"admin","issueDate":"2026-04-25","dueDate":null,"price":null,"note":null}`

	response := performRequest(t, server, http.MethodPost, "/work-orders", payload)
	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusCreated)
	}

	var created domain.WorkOrder
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if created.ClientName != "Novi klijent" || created.Status != domain.WorkOrderStatusNew {
		t.Fatalf("created = %#v, want new created work order", created)
	}
	if !strings.HasPrefix(created.OrderNumber, "RN-") {
		t.Fatalf("OrderNumber = %q, want RN- prefix", created.OrderNumber)
	}

	listResponse := performRequest(t, server, http.MethodGet, "/work-orders", "")
	var workOrders store.WorkOrderListResult
	if err := json.Unmarshal(listResponse.Body.Bytes(), &workOrders); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(workOrders.Items) != 44 || workOrders.Total != 44 {
		t.Fatalf("workOrders = %#v, want 44 after create", workOrders)
	}
}

func TestReserveOrderNumberEndpoint(t *testing.T) {
	server := newTestServer(t)

	first := performRequest(t, server, http.MethodPost, "/work-orders/reserve-number", "")
	if first.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (%s)", first.Code, http.StatusOK, first.Body.String())
	}
	var reservedA domain.ReservedOrderNumber
	if err := json.Unmarshal(first.Body.Bytes(), &reservedA); err != nil {
		t.Fatalf("decode reservation: %v", err)
	}
	if !strings.HasPrefix(reservedA.OrderNumber, "RN-") || reservedA.ExpiresAt == "" {
		t.Fatalf("reservedA = %#v, want RN- number and expiry", reservedA)
	}

	// A second reservation (a concurrent operator) must get a distinct number.
	second := performRequest(t, server, http.MethodPost, "/work-orders/reserve-number", "")
	var reservedB domain.ReservedOrderNumber
	if err := json.Unmarshal(second.Body.Bytes(), &reservedB); err != nil {
		t.Fatalf("decode reservation: %v", err)
	}
	if reservedB.OrderNumber == reservedA.OrderNumber {
		t.Fatalf("second reservation = %q, collided with first", reservedB.OrderNumber)
	}

	// Creating with the reserved number consumes it and keeps that exact number.
	payload := `{"orderNumber":"` + reservedA.OrderNumber + `","clientName":"Novi klijent","contactPerson":null,"jobDescription":"Štampa","jobDetails":null,"billingDocumentType":null,"billingDocumentNumber":null,"shipping":{"deliveryMethod":null,"hasPackaging":false,"hasLabeling":false,"isFragile":false,"requiresSignature":false,"hasInsurance":false,"shippingAddress":null},"issuedBy":"admin","issueDate":"2026-04-25","dueDate":null,"price":null,"note":null}`
	createResp := performRequest(t, server, http.MethodPost, "/work-orders", payload)
	if createResp.Code != http.StatusCreated {
		t.Fatalf("create status = %d, want %d (%s)", createResp.Code, http.StatusCreated, createResp.Body.String())
	}
	var created domain.WorkOrder
	if err := json.Unmarshal(createResp.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created: %v", err)
	}
	if created.OrderNumber != reservedA.OrderNumber {
		t.Fatalf("created OrderNumber = %q, want reserved %q", created.OrderNumber, reservedA.OrderNumber)
	}
}

func TestReleaseOrderNumberEndpoint(t *testing.T) {
	server := newTestServer(t)

	reserveResp := performRequest(t, server, http.MethodPost, "/work-orders/reserve-number", "")
	var reserved domain.ReservedOrderNumber
	if err := json.Unmarshal(reserveResp.Body.Bytes(), &reserved); err != nil {
		t.Fatalf("decode reservation: %v", err)
	}

	release := performRequest(t, server, http.MethodPost, "/work-orders/release-number",
		`{"orderNumber":"`+reserved.OrderNumber+`"}`)
	if release.Code != http.StatusNoContent {
		t.Fatalf("release status = %d, want %d (%s)", release.Code, http.StatusNoContent, release.Body.String())
	}

	// After releasing, the next reservation reclaims the same number instead of
	// leaving a gap.
	reReserveResp := performRequest(t, server, http.MethodPost, "/work-orders/reserve-number", "")
	var reReserved domain.ReservedOrderNumber
	if err := json.Unmarshal(reReserveResp.Body.Bytes(), &reReserved); err != nil {
		t.Fatalf("decode re-reservation: %v", err)
	}
	if reReserved.OrderNumber != reserved.OrderNumber {
		t.Fatalf("re-reserved = %q, want reclaimed %q", reReserved.OrderNumber, reserved.OrderNumber)
	}

	// Releasing an unknown number is a no-op success.
	noop := performRequest(t, server, http.MethodPost, "/work-orders/release-number",
		`{"orderNumber":"RN-2099-00001"}`)
	if noop.Code != http.StatusNoContent {
		t.Fatalf("no-op release status = %d, want %d", noop.Code, http.StatusNoContent)
	}
}

func TestEditLockEndpoint(t *testing.T) {
	server := newTestServer(t)

	acquire := performRequest(t, server, http.MethodPost, "/work-orders/1/edit-lock", "")
	if acquire.Code != http.StatusOK {
		t.Fatalf("acquire status = %d, want %d (%s)", acquire.Code, http.StatusOK, acquire.Body.String())
	}
	var lock domain.EditLock
	if err := json.Unmarshal(acquire.Body.Bytes(), &lock); err != nil {
		t.Fatalf("decode lock: %v", err)
	}
	if lock.LockedBy != "admin" || lock.WorkOrderID != "1" || lock.ExpiresAt == "" {
		t.Fatalf("lock = %#v, want admin holding work order 1 with expiry", lock)
	}

	// The same operator re-acquiring (heartbeat) keeps holding the lock.
	refresh := performRequest(t, server, http.MethodPost, "/work-orders/1/edit-lock", "")
	if refresh.Code != http.StatusOK {
		t.Fatalf("refresh status = %d, want %d (%s)", refresh.Code, http.StatusOK, refresh.Body.String())
	}

	release := performRequest(t, server, http.MethodDelete, "/work-orders/1/edit-lock", "")
	if release.Code != http.StatusNoContent {
		t.Fatalf("release status = %d, want %d (%s)", release.Code, http.StatusNoContent, release.Body.String())
	}

	// After release the lock is free to acquire again.
	reacquire := performRequest(t, server, http.MethodPost, "/work-orders/1/edit-lock", "")
	if reacquire.Code != http.StatusOK {
		t.Fatalf("reacquire status = %d, want %d (%s)", reacquire.Code, http.StatusOK, reacquire.Body.String())
	}
}

func TestCreateWorkOrderAcceptsDecimalPrice(t *testing.T) {
	server := newTestServer(t)
	payload := `{"clientName":"Novi klijent","contactPerson":null,"jobDescription":"Štampa brošure","jobDetails":null,"billingDocumentType":null,"billingDocumentNumber":null,"shipping":{"deliveryMethod":null,"hasPackaging":false,"hasLabeling":false,"isFragile":false,"requiresSignature":false,"hasInsurance":false,"shippingAddress":null},"issuedBy":"admin","issueDate":"2026-04-25","dueDate":null,"price":12000.5,"note":null}`

	response := performRequest(t, server, http.MethodPost, "/work-orders", payload)
	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d; body = %s", response.Code, http.StatusCreated, response.Body.String())
	}

	var created map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if created["price"] != 12000.5 {
		t.Fatalf("price = %#v, want 12000.5", created["price"])
	}
}

func TestCreateWorkOrderValidationError(t *testing.T) {
	response := performRequest(
		t,
		newTestServer(t),
		http.MethodPost,
		"/work-orders",
		`{"clientName":"","contactPerson":null,"jobDescription":"","jobDetails":null,"billingDocumentType":null,"billingDocumentNumber":null,"shipping":{"deliveryMethod":null,"hasPackaging":false,"hasLabeling":false,"isFragile":false,"requiresSignature":false,"hasInsurance":false,"shippingAddress":null},"issuedBy":"","issueDate":"","dueDate":null,"price":null,"note":null}`,
	)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusUnprocessableEntity)
	}
	assertErrorResponse(t, response.Body.Bytes(), "Prosleđeni podaci nisu ispravni.")
}

func TestUpdateWorkOrderEndpoint(t *testing.T) {
	response := performRequest(
		t,
		newTestServer(t),
		http.MethodPatch,
		"/work-orders/3",
		`{"status":"cancelled"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}

	var updated domain.WorkOrder
	if err := json.Unmarshal(response.Body.Bytes(), &updated); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if updated.Status != domain.WorkOrderStatusCancelled || updated.IsCompleted {
		t.Fatalf("updated = %#v, want cancelled order", updated)
	}
}

func TestUpdateWorkOrderRejectsInvalidTransition(t *testing.T) {
	response := performRequest(
		t,
		newTestServer(t),
		http.MethodPatch,
		"/work-orders/3",
		`{"status":"invoiced"}`,
	)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusUnprocessableEntity)
	}
	assertErrorResponse(t, response.Body.Bytes(), "Promena statusa nije dozvoljena.")
}

func TestWorkOrderPreviewEndpoint(t *testing.T) {
	server := newTestServer(t)

	body := `{"orderNumber":"RN-2026-9","clientName":"Pregled Klijent","jobDescription":"Štampa plakata","shipping":{},"issueDate":"2026-06-23","invoiceDraft":{"status":"none","lineItems":[]}}`
	response := performRequest(t, server, http.MethodPost, "/work-orders/preview", body)
	if response.Code != http.StatusOK {
		t.Fatalf("preview status = %d, want %d (%s)", response.Code, http.StatusOK, response.Body.String())
	}
	if contentType := response.Header().Get("Content-Type"); !strings.HasPrefix(contentType, "text/html") {
		t.Fatalf("Content-Type = %q, want text/html", contentType)
	}
	html := response.Body.String()
	if !strings.Contains(html, "RADNI NALOG") || !strings.Contains(html, "work-order-print-sheet") {
		t.Fatalf("preview html missing expected content; got %d bytes", len(html))
	}
	// The client name is uppercased in the print template.
	if !strings.Contains(html, "PREGLED KLIJENT") {
		t.Fatalf("preview html missing client name; got %d bytes", len(html))
	}
}

func TestReportAndPublicTrackingEndpoints(t *testing.T) {
	server := newTestServer(t)

	reportResponse := performRequest(t, server, http.MethodGet, "/work-orders/1/report", "")
	if reportResponse.Code != http.StatusOK {
		t.Fatalf("report status = %d, want %d", reportResponse.Code, http.StatusOK)
	}
	if contentType := reportResponse.Header().Get("Content-Type"); contentType != "application/pdf" {
		t.Fatalf("Content-Type = %q, want application/pdf", contentType)
	}
	if !bytes.HasPrefix(reportResponse.Body.Bytes(), []byte("%PDF-")) {
		t.Fatalf("report body prefix = %q, want PDF header", reportResponse.Body.String()[:5])
	}

	reportHTMLResponse := performRequestWithHeaders(
		t,
		server,
		http.MethodGet,
		"/work-orders/1/report",
		"",
		map[string]string{"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"},
	)
	if reportHTMLResponse.Code != http.StatusOK {
		t.Fatalf("report html accept status = %d, want %d", reportHTMLResponse.Code, http.StatusOK)
	}
	if contentType := reportHTMLResponse.Header().Get("Content-Type"); contentType != "application/pdf" {
		t.Fatalf("Content-Type with html accept = %q, want application/pdf", contentType)
	}
	if !bytes.HasPrefix(reportHTMLResponse.Body.Bytes(), []byte("%PDF-")) {
		t.Fatalf("report html accept body prefix = %q, want PDF header", reportHTMLResponse.Body.String()[:5])
	}

	workOrderResponse := performRequest(t, server, http.MethodGet, "/work-orders/1", "")
	var workOrder domain.WorkOrder
	if err := json.Unmarshal(workOrderResponse.Body.Bytes(), &workOrder); err != nil {
		t.Fatalf("decode work order: %v", err)
	}
	if workOrder.Communication.PublicToken == "" {
		t.Fatal("PublicToken = empty, want public tracking token")
	}

	publicResponse := performRequest(
		t,
		server,
		http.MethodGet,
		"/public/work-orders/"+workOrder.Communication.PublicToken,
		"",
	)
	if publicResponse.Code != http.StatusOK {
		t.Fatalf("public status = %d, want %d", publicResponse.Code, http.StatusOK)
	}
	var publicStatus domain.PublicWorkOrderStatus
	if err := json.Unmarshal(publicResponse.Body.Bytes(), &publicStatus); err != nil {
		t.Fatalf("decode public status: %v", err)
	}
	if publicStatus.OrderNumber != workOrder.OrderNumber || publicStatus.InternalNoteCount != 0 {
		t.Fatalf("public status = %#v, want sanitized status for %s", publicStatus, workOrder.OrderNumber)
	}
}

func TestUpdateWorkOrderNotFound(t *testing.T) {
	response := performRequest(
		t,
		newTestServer(t),
		http.MethodPatch,
		"/work-orders/missing",
		`{"status":"completed"}`,
	)
	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNotFound)
	}
	assertErrorResponse(t, response.Body.Bytes(), "Radni nalog nije pronađen.")
}

func TestDeleteWorkOrderEndpoint(t *testing.T) {
	t.Run("delete success", func(t *testing.T) {
		server := newTestServer(t)
		response := performRequest(t, server, http.MethodDelete, "/work-orders/3", "")
		if response.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
		}

		var result domain.DeleteWorkOrderResponse
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if !result.Success {
			t.Fatalf("result = %#v, want success true", result)
		}

		getResponse := performRequest(t, server, http.MethodGet, "/work-orders/3", "")
		if getResponse.Code != http.StatusNotFound {
			t.Fatalf("status after delete = %d, want %d", getResponse.Code, http.StatusNotFound)
		}
	})

	t.Run("delete missing returns business failure", func(t *testing.T) {
		response := performRequest(t, newTestServer(t), http.MethodDelete, "/work-orders/missing", "")
		if response.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
		}

		var result domain.DeleteWorkOrderResponse
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if result.Success || result.Message != "Radni nalog nije pronađen." {
			t.Fatalf("result = %#v, want not-found business response", result)
		}
	})
}

func performRequest(t *testing.T, server *Server, method string, path string, body string) *httptest.ResponseRecorder {
	return performRequestWithHeaders(t, server, method, path, body, nil)
}

func performRequestWithHeaders(
	t *testing.T,
	server *Server,
	method string,
	path string,
	body string,
	headers map[string]string,
) *httptest.ResponseRecorder {
	t.Helper()

	requestBody := bytes.NewBufferString(body)
	if body == "" {
		requestBody = bytes.NewBuffer(nil)
	}

	req := httptest.NewRequest(method, path, requestBody)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	if needsTestSession(path) {
		user, err := server.store.AuthenticateUser(context.Background(), store.DemoTenantID, "admin", "admin123")
		if err != nil {
			t.Fatalf("authenticate test user: %v", err)
		}
		token, err := server.store.CreateSession(
			context.Background(),
			user.ID,
			time.Now().Add(time.Hour),
		)
		if err != nil {
			t.Fatalf("create test session: %v", err)
		}
		req.AddCookie(&http.Cookie{Name: server.config.SessionCookieName, Value: token})
	}

	rec := httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	return rec
}

func needsTestSession(path string) bool {
	return !strings.HasPrefix(path, "/auth/") &&
		!strings.HasPrefix(path, "/public/") &&
		path != "/healthz"
}

func assertErrorResponse(t *testing.T, body []byte, want string) {
	t.Helper()

	var response map[string]string
	if err := json.Unmarshal(body, &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response["error"] != want {
		t.Fatalf("error = %q, want %q", response["error"], want)
	}
}

func newTestServer(t *testing.T) *Server {
	t.Helper()
	return NewServer(store.NewFixtureStore(testutil.FixtureDir(t)))
}

// TestCatalogItemEffectiveFromValidation covers the API-layer validation of the
// optional price effective date. The future-dating behaviour itself is SQLite-only
// and is exercised in the store package; the fixture-backed server here just
// enforces the contract: past dates rejected, malformed dates rejected, today or
// future accepted.
func TestCatalogItemEffectiveFromValidation(t *testing.T) {
	server := newTestServer(t)
	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")
	tomorrow := time.Now().UTC().AddDate(0, 0, 1).Format("2006-01-02")

	cases := []struct {
		name          string
		code          string
		effectiveFrom string
		wantStatus    int
	}{
		{"past date rejected", "EFF-PAST", yesterday, http.StatusBadRequest},
		{"malformed date rejected", "EFF-BAD", "23.07.2026", http.StatusBadRequest},
		{"future date accepted", "EFF-FUTURE", tomorrow, http.StatusCreated},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			payload := fmt.Sprintf(
				`{"code":%q,"name":"Usluga","kind":"service","unit":"kom","purchasePrice":100,"salePrice":200,"isActive":true,"effectiveFrom":%q}`,
				tc.code, tc.effectiveFrom,
			)
			r := performRequest(t, server, http.MethodPost, "/catalog-items", payload)
			if r.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d (%s)", r.Code, tc.wantStatus, r.Body.String())
			}
		})
	}
}

func TestCatalogItemEndpoints(t *testing.T) {
	server := newTestServer(t)

	t.Run("create, list, filter, update and delete", func(t *testing.T) {
		createPayload := `{"code":"SVC-001","name":"Štampa vizit karata","kind":"service","unit":"Set","purchasePrice":700,"salePrice":1200.5,"isActive":true}`
		createResponse := performRequest(t, server, http.MethodPost, "/catalog-items", createPayload)
		if createResponse.Code != http.StatusCreated {
			t.Fatalf("create status = %d, want %d (%s)", createResponse.Code, http.StatusCreated, createResponse.Body.String())
		}
		var created domain.CatalogItem
		if err := json.Unmarshal(createResponse.Body.Bytes(), &created); err != nil {
			t.Fatalf("decode created: %v", err)
		}
		if created.ID == "" || created.Unit != "set" || created.Kind != domain.CatalogItemKindService {
			t.Fatalf("created = %#v, want generated id, lowercased unit, service kind", created)
		}
		if created.PurchasePrice == nil || *created.PurchasePrice != 700 || created.SalePrice == nil || *created.SalePrice != 1200.5 {
			t.Fatalf("created prices = %#v, want purchase 700 / sale 1200.5", created)
		}

		articlePayload := `{"code":"ART-001","name":"USB memorija 32GB","kind":"article","unit":"kom","purchasePrice":400,"salePrice":620,"isActive":true}`
		if r := performRequest(t, server, http.MethodPost, "/catalog-items", articlePayload); r.Code != http.StatusCreated {
			t.Fatalf("create article status = %d, want %d", r.Code, http.StatusCreated)
		}

		listResponse := performRequest(t, server, http.MethodGet, "/catalog-items", "")
		all := decodeCatalogList(t, listResponse.Body.Bytes())
		if len(all) != 2 {
			t.Fatalf("len(all) = %d, want 2", len(all))
		}

		servicesResponse := performRequest(t, server, http.MethodGet, "/catalog-items?kind=service", "")
		services := decodeCatalogList(t, servicesResponse.Body.Bytes())
		if len(services) != 1 || services[0].Kind != domain.CatalogItemKindService {
			t.Fatalf("services = %#v, want only the service item", services)
		}

		searchResponse := performRequest(t, server, http.MethodGet, "/catalog-items?q=usb", "")
		matches := decodeCatalogList(t, searchResponse.Body.Bytes())
		if len(matches) != 1 || matches[0].Code != "ART-001" {
			t.Fatalf("matches = %#v, want only the USB article", matches)
		}

		byIDResponse := performRequest(t, server, http.MethodGet, "/catalog-items/"+created.ID, "")
		if byIDResponse.Code != http.StatusOK {
			t.Fatalf("by-id status = %d, want %d", byIDResponse.Code, http.StatusOK)
		}
		var fetched domain.CatalogItem
		if err := json.Unmarshal(byIDResponse.Body.Bytes(), &fetched); err != nil {
			t.Fatalf("decode by-id: %v", err)
		}
		if fetched.ID != created.ID {
			t.Fatalf("fetched.ID = %q, want %q", fetched.ID, created.ID)
		}
		if missing := performRequest(t, server, http.MethodGet, "/catalog-items/does-not-exist", ""); missing.Code != http.StatusNotFound {
			t.Fatalf("missing by-id status = %d, want %d", missing.Code, http.StatusNotFound)
		}

		updatePayload := `{"code":"SVC-001","name":"Štampa vizit karata (lux)","kind":"service","unit":"set","purchasePrice":800,"salePrice":1500,"isActive":false}`
		updateResponse := performRequest(t, server, http.MethodPut, "/catalog-items/"+created.ID, updatePayload)
		if updateResponse.Code != http.StatusOK {
			t.Fatalf("update status = %d, want %d", updateResponse.Code, http.StatusOK)
		}
		var updated domain.CatalogItem
		if err := json.Unmarshal(updateResponse.Body.Bytes(), &updated); err != nil {
			t.Fatalf("decode updated: %v", err)
		}
		if updated.Name != "Štampa vizit karata (lux)" || updated.IsActive {
			t.Fatalf("updated = %#v, want renamed inactive item", updated)
		}

		deleteResponse := performRequest(t, server, http.MethodDelete, "/catalog-items/"+created.ID, "")
		if deleteResponse.Code != http.StatusOK {
			t.Fatalf("delete status = %d, want %d", deleteResponse.Code, http.StatusOK)
		}
		afterDelete := performRequest(t, server, http.MethodGet, "/catalog-items", "")
		remaining := decodeCatalogList(t, afterDelete.Body.Bytes())
		if len(remaining) != 1 {
			t.Fatalf("len(remaining) = %d, want 1", len(remaining))
		}
	})

	t.Run("duplicate code is rejected", func(t *testing.T) {
		dupServer := newTestServer(t)
		payload := `{"code":"DUP-1","name":"Prva","kind":"service","unit":"kom","isActive":true}`
		if r := performRequest(t, dupServer, http.MethodPost, "/catalog-items", payload); r.Code != http.StatusCreated {
			t.Fatalf("first create status = %d", r.Code)
		}
		second := `{"code":"DUP-1","name":"Druga","kind":"service","unit":"kom","isActive":true}`
		response := performRequest(t, dupServer, http.MethodPost, "/catalog-items", second)
		if response.Code != http.StatusUnprocessableEntity {
			t.Fatalf("duplicate status = %d, want %d", response.Code, http.StatusUnprocessableEntity)
		}
	})

	t.Run("limit and offset paginate while total reflects all matches", func(t *testing.T) {
		pageServer := newTestServer(t)
		for i := 0; i < 5; i++ {
			payload := fmt.Sprintf(`{"code":"PG-%d","name":"Usluga %d","kind":"service","unit":"kom","isActive":true}`, i, i)
			if r := performRequest(t, pageServer, http.MethodPost, "/catalog-items", payload); r.Code != http.StatusCreated {
				t.Fatalf("seed item %d status = %d", i, r.Code)
			}
		}

		response := performRequest(t, pageServer, http.MethodGet, "/catalog-items?limit=2&offset=0", "")
		var result struct {
			Items []domain.CatalogItem `json:"items"`
			Total int                  `json:"total"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatalf("decode page: %v", err)
		}
		if len(result.Items) != 2 {
			t.Fatalf("len(items) = %d, want 2 (page size)", len(result.Items))
		}
		if result.Total != 5 {
			t.Fatalf("total = %d, want 5 (all matches)", result.Total)
		}

		page2 := performRequest(t, pageServer, http.MethodGet, "/catalog-items?limit=2&offset=4", "")
		var result2 struct {
			Items []domain.CatalogItem `json:"items"`
			Total int                  `json:"total"`
		}
		if err := json.Unmarshal(page2.Body.Bytes(), &result2); err != nil {
			t.Fatalf("decode page 2: %v", err)
		}
		if len(result2.Items) != 1 {
			t.Fatalf("last page len = %d, want 1", len(result2.Items))
		}
	})
}

func TestUpsertCustomerValidatesIdentifiers(t *testing.T) {
	server := newTestServer(t)

	t.Run("valid PIB and MB accepted", func(t *testing.T) {
		payload := `{"id":"cust-pib-ok","name":"Validna Firma","pib":"100197914","mb":"53671888"}`
		response := performRequest(t, server, http.MethodPut, "/customers/cust-pib-ok", payload)
		if response.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d (%s)", response.Code, http.StatusOK, response.Body.String())
		}
	})

	t.Run("invalid PIB rejected", func(t *testing.T) {
		payload := `{"id":"cust-pib-bad","name":"Neispravna Firma","pib":"123456789"}`
		response := performRequest(t, server, http.MethodPut, "/customers/cust-pib-bad", payload)
		if response.Code != http.StatusUnprocessableEntity {
			t.Fatalf("status = %d, want %d", response.Code, http.StatusUnprocessableEntity)
		}
	})

	t.Run("invalid MB rejected", func(t *testing.T) {
		payload := `{"id":"cust-mb-bad","name":"Neispravan MB","mb":"1234567"}`
		response := performRequest(t, server, http.MethodPut, "/customers/cust-mb-bad", payload)
		if response.Code != http.StatusUnprocessableEntity {
			t.Fatalf("status = %d, want %d", response.Code, http.StatusUnprocessableEntity)
		}
	})
}

func TestWebFallbackRejectsPathTraversal(t *testing.T) {
	base := t.TempDir()
	webDir := filepath.Join(base, "web")
	if err := os.MkdirAll(webDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(webDir, "index.html"), []byte("<html>app</html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(base, "secret.txt"), []byte("top secret"), 0o600); err != nil {
		t.Fatal(err)
	}

	server := NewServer(store.NewFixtureStore(testutil.FixtureDir(t)), Config{WebDir: webDir})
	router := server.Routes()

	// Simulate an encoded "%2e%2e" path that arrives decoded in URL.Path.
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.URL.Path = "/../secret.txt"
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNotFound)
	}
	if strings.Contains(recorder.Body.String(), "top secret") {
		t.Fatal("response leaked file contents outside WebDir")
	}
}
