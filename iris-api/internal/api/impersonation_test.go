package api

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

func TestPlatformImpersonation(t *testing.T) {
	server, adminToken, _ := newServerWithRoles(t)
	sqliteStore := server.store.(*store.SQLiteStore)
	ctx := context.Background()
	if err := sqliteStore.UpsertPlatformAdmin(ctx, "ops", "correct-horse-battery"); err != nil {
		t.Fatal(err)
	}
	// A second organization whose account must not be reachable through demo.
	if err := sqliteStore.EnsureTenant(ctx, "tenant-other", "other", "Other"); err != nil {
		t.Fatal(err)
	}
	if err := sqliteStore.CreateUser(store.ContextWithTenant(ctx, "tenant-other"), "user-other", "drugi", "drugi123", domain.RoleUser, false); err != nil {
		t.Fatal(err)
	}

	tenantCookie := &http.Cookie{Name: server.config.SessionCookieName, Value: adminToken}
	if rec := platformRequest(t, server, tenantCookie, http.MethodGet, "/platform/tenants/demo/users", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("users with tenant session = %d, want 401", rec.Code)
	}
	if rec := platformRequest(t, server, tenantCookie, http.MethodPost, "/platform/tenants/demo/impersonate", `{"userId":"user-1"}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("impersonate with tenant session = %d, want 401", rec.Code)
	}

	login := platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login", `{"username":"ops","password":"correct-horse-battery"}`)
	platformSession := platformCookie(login, server.config.PlatformSessionCookieName)
	if platformSession == nil {
		t.Fatalf("login = %s", login.Body.String())
	}

	rec := platformRequest(t, server, platformSession, http.MethodGet, "/platform/tenants/demo/users", "")
	var listed domain.PlatformTenantUsers
	if err := json.Unmarshal(rec.Body.Bytes(), &listed); err != nil || rec.Code != http.StatusOK {
		t.Fatalf("users = %d %s", rec.Code, rec.Body.String())
	}
	if listed.Tenant.Slug != "demo" || len(listed.Users) != 2 {
		t.Fatalf("users = %+v", listed)
	}
	if rec := platformRequest(t, server, platformSession, http.MethodGet, "/platform/tenants/missing/users", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("unknown tenant users = %d, want 404", rec.Code)
	}
	if rec := platformRequest(t, server, platformSession, http.MethodPost, "/platform/tenants/demo/impersonate", `{"userId":"user-other"}`); rec.Code != http.StatusNotFound {
		t.Fatalf("impersonate user of another tenant = %d, want 404", rec.Code)
	}

	rec = platformRequest(t, server, platformSession, http.MethodPost, "/platform/tenants/demo/impersonate", `{"userId":"user-1"}`)
	var started domain.PlatformImpersonationResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &started); err != nil || !started.Success || started.OrgSlug != "demo" ||
		started.User == nil || started.User.Username != "operater" || started.User.ImpersonatedBy == nil || *started.User.ImpersonatedBy != "ops" {
		t.Fatalf("impersonate = %d %s", rec.Code, rec.Body.String())
	}
	session := platformCookie(rec, server.config.SessionCookieName)
	if session == nil || !session.HttpOnly {
		t.Fatalf("impersonation cookie = %+v", session)
	}

	// The session is the operator's own: same data, same limits.
	rec = platformRequest(t, server, session, http.MethodGet, "/auth/session", "")
	var current domain.LoginResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &current); err != nil || !current.Success ||
		current.User.Username != "operater" || current.User.ImpersonatedBy == nil || *current.User.ImpersonatedBy != "ops" {
		t.Fatalf("session = %s", rec.Body.String())
	}
	if rec := platformRequest(t, server, session, http.MethodGet, "/customers", ""); rec.Code != http.StatusOK {
		t.Fatalf("customers as impersonated operator = %d", rec.Code)
	}
	if rec := platformRequest(t, server, session, http.MethodGet, "/users", ""); rec.Code != http.StatusForbidden {
		t.Fatalf("admin route as impersonated operator = %d, want 403", rec.Code)
	}
	// An ordinary session reports no impersonator.
	current = domain.LoginResponse{}
	rec = platformRequest(t, server, tenantCookie, http.MethodGet, "/auth/session", "")
	if err := json.Unmarshal(rec.Body.Bytes(), &current); err != nil || current.User.ImpersonatedBy != nil {
		t.Fatalf("ordinary session = %s", rec.Body.String())
	}

	// Audited, and not counted as a login or an active session.
	events, err := sqliteStore.ImpersonationEvents(ctx, 10)
	if err != nil || len(events) != 1 || events[0].AdminUsername != "ops" || events[0].Username != "operater" {
		t.Fatalf("events = %+v, err %v", events, err)
	}
	rec = platformRequest(t, server, platformSession, http.MethodGet, "/platform/metrics", "")
	var metrics domain.PlatformMetrics
	if err := json.Unmarshal(rec.Body.Bytes(), &metrics); err != nil {
		t.Fatal(err)
	}
	if metrics.Totals.LoginsInRange != 0 || metrics.Totals.ActiveSessions != 2 {
		t.Fatalf("metrics totals = %+v, want 0 logins and only the 2 ordinary sessions", metrics.Totals)
	}

	// Signing out of the Backoffice ends the impersonation too.
	platformRequest(t, server, platformSession, http.MethodPost, "/platform/auth/logout", "")
	rec = platformRequest(t, server, session, http.MethodGet, "/auth/session", "")
	if err := json.Unmarshal(rec.Body.Bytes(), &current); err != nil || current.Success {
		t.Fatalf("session after platform logout = %s", rec.Body.String())
	}
	rec = platformRequest(t, server, tenantCookie, http.MethodGet, "/auth/session", "")
	if err := json.Unmarshal(rec.Body.Bytes(), &current); err != nil || !current.Success {
		t.Fatalf("ordinary session after platform logout = %s", rec.Body.String())
	}
}
