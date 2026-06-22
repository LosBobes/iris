package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

// newServerWithRoles builds a real SQLite-backed server seeded with one admin
// and one non-admin ("user") account, returning a session token for each.
func newServerWithRoles(t *testing.T) (server *Server, adminToken, userToken string) {
	t.Helper()
	ctx := context.Background()

	sqliteStore, err := store.OpenSQLite(ctx, filepath.Join(t.TempDir(), "iris.db"))
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = sqliteStore.Close() })

	if err := sqliteStore.CreateUser(ctx, "admin-1", "admin", "admin123", domain.RoleAdmin, false); err != nil {
		t.Fatalf("create admin: %v", err)
	}
	if err := sqliteStore.CreateUser(ctx, "user-1", "operater", "operater123", domain.RoleUser, false); err != nil {
		t.Fatalf("create user: %v", err)
	}

	server = NewServer(sqliteStore)
	return server, roleSessionToken(t, sqliteStore, "admin", "admin123"), roleSessionToken(t, sqliteStore, "operater", "operater123")
}

func roleSessionToken(t *testing.T, s store.Store, username, password string) string {
	t.Helper()
	ctx := context.Background()
	user, err := s.AuthenticateUser(ctx, username, password)
	if err != nil || user == nil {
		t.Fatalf("authenticate %s: user=%v err=%v", username, user, err)
	}
	token, err := s.CreateSession(ctx, user.ID, time.Now().Add(time.Hour))
	if err != nil {
		t.Fatalf("create session for %s: %v", username, err)
	}
	return token
}

func roleRequest(t *testing.T, server *Server, token, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader("")
	} else {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, reader)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.AddCookie(&http.Cookie{Name: server.config.SessionCookieName, Value: token})
	}
	rec := httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	return rec
}

// TestAdminRoutesRejectNonAdmin proves the destructive/admin routes are gated by
// role: a non-admin session is forbidden, while an admin session clears the gate.
func TestAdminRoutesRejectNonAdmin(t *testing.T) {
	server, adminToken, userToken := newServerWithRoles(t)

	adminRoutes := []struct {
		method string
		path   string
		body   string
	}{
		{http.MethodDelete, "/work-orders/does-not-exist", ""},
		{http.MethodDelete, "/customers/does-not-exist", ""},
		{http.MethodDelete, "/locations/does-not-exist", ""},
		{http.MethodPost, "/enum-values", `{"field":"priority","value":"rush","label":"Rush"}`},
		{http.MethodPut, "/enum-values/does-not-exist", `{"field":"priority","value":"rush","label":"Rush"}`},
		{http.MethodDelete, "/enum-values/does-not-exist", ""},
	}

	for _, route := range adminRoutes {
		// A non-admin must be forbidden by requireAdmin before the handler runs.
		if rec := roleRequest(t, server, userToken, route.method, route.path, route.body); rec.Code != http.StatusForbidden {
			t.Errorf("%s %s as user = %d, want %d", route.method, route.path, rec.Code, http.StatusForbidden)
		}
		// An admin must clear the gate (any status other than 401/403).
		if rec := roleRequest(t, server, adminToken, route.method, route.path, route.body); rec.Code == http.StatusForbidden || rec.Code == http.StatusUnauthorized {
			t.Errorf("%s %s as admin = %d, want the admin gate to pass", route.method, route.path, rec.Code)
		}
	}
}

// TestSharedRoutesAllowNonAdmin proves non-admins retain the operator workflow:
// they can list and create work orders, while an anonymous request is rejected.
func TestSharedRoutesAllowNonAdmin(t *testing.T) {
	server, _, userToken := newServerWithRoles(t)

	if rec := roleRequest(t, server, userToken, http.MethodGet, "/work-orders", ""); rec.Code != http.StatusOK {
		t.Errorf("GET /work-orders as user = %d, want %d", rec.Code, http.StatusOK)
	}

	createBody := `{"clientName":"Novi klijent","jobDescription":"Štampa brošure","shipping":{},"issuedBy":"operater","issueDate":"2026-06-22"}`
	if rec := roleRequest(t, server, userToken, http.MethodPost, "/work-orders", createBody); rec.Code != http.StatusCreated {
		t.Errorf("POST /work-orders as user = %d, want %d", rec.Code, http.StatusCreated)
	}

	// No session at all must be unauthorized, not merely forbidden.
	if rec := roleRequest(t, server, "", http.MethodGet, "/work-orders", ""); rec.Code != http.StatusUnauthorized {
		t.Errorf("GET /work-orders anonymous = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}
