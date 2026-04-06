package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
	"github.com/LosBobes/iris/iris-api/internal/testutil"
)

func TestAPIEndpoints(t *testing.T) {
	server := newTestServer(t)

	tests := []struct {
		name           string
		method         string
		path           string
		body           string
		contentType    string
		wantStatus     int
		assertResponse func(t *testing.T, body []byte)
	}{
		{
			name:        "login success",
			method:      http.MethodPost,
			path:        "/auth/login",
			body:        `{"username":"admin","password":"admin123"}`,
			contentType: "application/json",
			wantStatus:  http.StatusOK,
			assertResponse: func(t *testing.T, body []byte) {
				t.Helper()

				var response domain.LoginResponse
				if err := json.Unmarshal(body, &response); err != nil {
					t.Fatalf("decode response: %v", err)
				}

				if !response.Success {
					t.Fatalf("Success = %v, want true", response.Success)
				}

				if response.User == nil || response.User.Username != "admin" {
					t.Fatalf("User = %#v, want admin user", response.User)
				}
			},
		},
		{
			name:        "login failure",
			method:      http.MethodPost,
			path:        "/auth/login",
			body:        `{"username":"wrong","password":"wrong"}`,
			contentType: "application/json",
			wantStatus:  http.StatusOK,
			assertResponse: func(t *testing.T, body []byte) {
				t.Helper()

				var response domain.LoginResponse
				if err := json.Unmarshal(body, &response); err != nil {
					t.Fatalf("decode response: %v", err)
				}

				if response.Success {
					t.Fatalf("Success = %v, want false", response.Success)
				}

				if response.Error != "Neispravno korisničko ime ili lozinka." {
					t.Fatalf("Error = %q, want Serbian user-facing auth message", response.Error)
				}
			},
		},
		{
			name:        "login bad json",
			method:      http.MethodPost,
			path:        "/auth/login",
			body:        `{"username":`,
			contentType: "application/json",
			wantStatus:  http.StatusBadRequest,
			assertResponse: func(t *testing.T, body []byte) {
				t.Helper()

				var response map[string]string
				if err := json.Unmarshal(body, &response); err != nil {
					t.Fatalf("decode response: %v", err)
				}

				if response["error"] != "invalid JSON body" {
					t.Fatalf("error = %q, want %q", response["error"], "invalid JSON body")
				}
			},
		},
		{
			name:       "work orders endpoint",
			method:     http.MethodGet,
			path:       "/work-orders",
			wantStatus: http.StatusOK,
			assertResponse: func(t *testing.T, body []byte) {
				t.Helper()

				var workOrders []domain.WorkOrder
				if err := json.Unmarshal(body, &workOrders); err != nil {
					t.Fatalf("decode response: %v", err)
				}

				if len(workOrders) != 25 {
					t.Fatalf("len(workOrders) = %d, want 25", len(workOrders))
				}
			},
		},
		{
			name:       "operators endpoint",
			method:     http.MethodGet,
			path:       "/work-orders/operators",
			wantStatus: http.StatusOK,
			assertResponse: func(t *testing.T, body []byte) {
				t.Helper()

				var operators []string
				if err := json.Unmarshal(body, &operators); err != nil {
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
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var body *bytes.Buffer
			if test.body == "" {
				body = bytes.NewBuffer(nil)
			} else {
				body = bytes.NewBufferString(test.body)
			}

			req := httptest.NewRequest(test.method, test.path, body)
			if test.contentType != "" {
				req.Header.Set("Content-Type", test.contentType)
			}

			rec := httptest.NewRecorder()
			server.Routes().ServeHTTP(rec, req)

			if rec.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, test.wantStatus)
			}

			if test.assertResponse != nil {
				test.assertResponse(t, rec.Body.Bytes())
			}
		})
	}
}

func newTestServer(t *testing.T) *Server {
	t.Helper()
	return NewServer(store.NewFixtureStore(testutil.FixtureDir(t)))
}
