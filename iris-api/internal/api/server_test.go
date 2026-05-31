package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
			body:       `{"username":"admin","password":"admin123"}`,
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
			body:       `{"username":"wrong","password":"wrong"}`,
			wantStatus: http.StatusOK,
			assertBody: func(t *testing.T, body []byte) {
				t.Helper()
				var response domain.LoginResponse
				if err := json.Unmarshal(body, &response); err != nil {
					t.Fatalf("decode response: %v", err)
				}
				if response.Success || response.Error != "Neispravno korisničko ime ili lozinka." {
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
		if len(workOrders.Items) != 25 || workOrders.Total != 25 {
			t.Fatalf("workOrders = %#v, want 25 items and total", workOrders)
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

		want := []string{"ana.jovic", "jelena.markovic", "marko.petrovic", "stefan.nikolic"}
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
		if workOrder.OrderNumber != "RN-2024-0001" {
			t.Fatalf("OrderNumber = %q, want %q", workOrder.OrderNumber, "RN-2024-0001")
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

		var customers []domain.Customer
		if err := json.Unmarshal(response.Body.Bytes(), &customers); err != nil {
			t.Fatalf("decode response: %v", err)
		}
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
	if len(workOrders.Items) != 26 || workOrders.Total != 26 {
		t.Fatalf("workOrders = %#v, want 26 after create", workOrders)
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
		`{"status":"waitingForMaterials"}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}

	var updated domain.WorkOrder
	if err := json.Unmarshal(response.Body.Bytes(), &updated); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if updated.Status != domain.WorkOrderStatusWaitingForMaterials || updated.IsCompleted {
		t.Fatalf("updated = %#v, want waiting-for-materials order", updated)
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
	t.Helper()

	requestBody := bytes.NewBufferString(body)
	if body == "" {
		requestBody = bytes.NewBuffer(nil)
	}

	req := httptest.NewRequest(method, path, requestBody)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if needsTestSession(path) {
		user, err := server.store.AuthenticateUser(context.Background(), "admin", "admin123")
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
