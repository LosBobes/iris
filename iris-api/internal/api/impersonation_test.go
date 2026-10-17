package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

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

	// Change requests are traced to the impersonation; reads are not.
	if rec := platformRequest(t, server, session, http.MethodPost, "/work-orders/reserve-number", ""); rec.Code >= 300 {
		t.Fatalf("reserve number as impersonated operator = %d %s", rec.Code, rec.Body.String())
	}
	if rec := platformRequest(t, server, session, http.MethodDelete, "/customers/nope", ""); rec.Code != http.StatusForbidden {
		t.Fatalf("admin delete as impersonated operator = %d, want 403", rec.Code)
	}
	// Edit-lock heartbeats are not traced.
	platformRequest(t, server, session, http.MethodPost, "/work-orders/nope/edit-lock", "")
	// The same requests from an ordinary session leave no trail.
	platformRequest(t, server, tenantCookie, http.MethodPost, "/work-orders/reserve-number", "")

	rec = platformRequest(t, server, platformSession, http.MethodGet, "/platform/impersonations", "")
	var log domain.PlatformImpersonationLog
	if err := json.Unmarshal(rec.Body.Bytes(), &log); err != nil || rec.Code != http.StatusOK {
		t.Fatalf("log = %d %s", rec.Code, rec.Body.String())
	}
	if log.Total != 1 || len(log.Items) != 1 {
		t.Fatalf("log = %+v", log)
	}
	entry := log.Items[0]
	if entry.AdminUsername != "ops" || entry.Username != "operater" || entry.TenantSlug != "demo" ||
		entry.ActionCount != 2 || entry.EndedAt != nil || entry.ExpiresAt == "" {
		t.Fatalf("log entry = %+v", entry)
	}
	rec = platformRequest(t, server, platformSession, http.MethodGet, fmt.Sprintf("/platform/impersonations/%d/actions", entry.ID), "")
	var actions []domain.PlatformImpersonationAction
	if err := json.Unmarshal(rec.Body.Bytes(), &actions); err != nil || len(actions) != 2 {
		t.Fatalf("actions = %d %s", rec.Code, rec.Body.String())
	}
	if actions[0].Method != http.MethodPost || actions[0].Route != "/work-orders/reserve-number" || actions[0].Status >= 300 ||
		actions[1].Method != http.MethodDelete || actions[1].Route != "/customers/{id}" || actions[1].Path != "/customers/nope" ||
		actions[1].Status != http.StatusForbidden {
		t.Fatalf("actions = %+v", actions)
	}
	if rec := platformRequest(t, server, platformSession, http.MethodGet, "/platform/impersonations/999/actions", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("unknown impersonation actions = %d, want 404", rec.Code)
	}
	if rec := platformRequest(t, server, tenantCookie, http.MethodGet, "/platform/impersonations", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("log with tenant session = %d, want 401", rec.Code)
	}

	// Not counted as a login or an active session.
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
	// ...and the log shows it ended.
	ended, err := sqliteStore.ImpersonationLog(ctx, 10, 0)
	if err != nil || ended.Items[0].EndedAt == nil {
		t.Fatalf("log after platform logout = %+v, err %v", ended, err)
	}
}

func TestImpersonationEndsOnTenantLogout(t *testing.T) {
	server, _, _ := newServerWithRoles(t)
	sqliteStore := server.store.(*store.SQLiteStore)
	ctx := context.Background()
	token, user, err := sqliteStore.CreateImpersonationSession(ctx, store.ImpersonationInput{
		AdminID: "platform-admin", AdminUsername: "admin", TenantID: store.DemoTenantID, UserID: "user-1",
		ExpiresAt: time.Now().Add(time.Hour),
	})
	if err != nil || user == nil {
		t.Fatalf("impersonate: user=%v err=%v", user, err)
	}
	platformRequest(t, server, &http.Cookie{Name: server.config.SessionCookieName, Value: token}, http.MethodPost, "/auth/logout", "")
	log, err := sqliteStore.ImpersonationLog(ctx, 10, 0)
	if err != nil || len(log.Items) != 1 || log.Items[0].EndedAt == nil || log.Items[0].ActionCount != 0 {
		t.Fatalf("log after logout = %+v, err %v", log, err)
	}
}
