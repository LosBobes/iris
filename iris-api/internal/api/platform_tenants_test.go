package api

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

// signedInPlatform returns a Backoffice session cookie for a fresh superadmin.
func signedInPlatform(t *testing.T, server *Server) *http.Cookie {
	t.Helper()
	if err := server.store.(store.PlatformStore).UpsertPlatformAdmin(context.Background(), "ops", "correct-horse-battery"); err != nil {
		t.Fatal(err)
	}
	rec := platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login", `{"username":"ops","password":"correct-horse-battery"}`)
	cookie := platformCookie(rec, server.config.PlatformSessionCookieName)
	if cookie == nil {
		t.Fatalf("platform login = %s", rec.Body.String())
	}
	enrollPlatformTwoFactor(t, server, cookie)
	return cookie
}

func tenantLogin(t *testing.T, server *Server, org, username, password string) domain.LoginResponse {
	t.Helper()
	body, _ := json.Marshal(domain.LoginRequest{OrgSlug: org, Username: username, Password: password})
	rec := platformRequest(t, server, nil, http.MethodPost, "/auth/login", string(body))
	var response domain.LoginResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode login %s: %v", rec.Body.String(), err)
	}
	return response
}

// auditActions lists the activity log without the two-factor enrollment that
// signedInPlatform performs (mandatory before any operator route).
func auditActions(t *testing.T, server *Server, cookie *http.Cookie) []domain.PlatformAuditEvent {
	t.Helper()
	rec := platformRequest(t, server, cookie, http.MethodGet, "/platform/audit", "")
	var log domain.PlatformAuditLog
	if err := json.Unmarshal(rec.Body.Bytes(), &log); err != nil || rec.Code != http.StatusOK {
		t.Fatalf("audit = %d %s", rec.Code, rec.Body.String())
	}
	events := []domain.PlatformAuditEvent{}
	for _, event := range log.Items {
		if event.Action != domain.AuditAdminTwoFactorOn {
			events = append(events, event)
		}
	}
	return events
}

func TestPlatformTenantRoutesNeedSuperadmin(t *testing.T) {
	server, adminToken, _ := newServerWithRoles(t)
	tenantCookie := &http.Cookie{Name: server.config.SessionCookieName, Value: adminToken}
	for _, route := range []struct{ method, path string }{
		{http.MethodGet, "/platform/tenants"},
		{http.MethodPost, "/platform/tenants"},
		{http.MethodPatch, "/platform/tenants/demo"},
		{http.MethodPut, "/platform/tenants/demo/modules"},
		{http.MethodPost, "/platform/tenants/demo/suspend"},
		{http.MethodPost, "/platform/tenants/demo/reactivate"},
		{http.MethodPost, "/platform/tenants/demo/users/user-1/password"},
		{http.MethodGet, "/platform/audit"},
	} {
		if rec := platformRequest(t, server, tenantCookie, route.method, route.path, `{}`); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s with tenant session = %d, want 401", route.method, route.path, rec.Code)
		}
	}
}

func TestPlatformCreateAndEditTenant(t *testing.T) {
	server, _, _ := newServerWithRoles(t)
	cookie := signedInPlatform(t, server)

	for _, body := range []string{
		`{"name":"Nova","slug":"Nije Dobro!","adminUsername":"sef","adminPassword":"lozinka123"}`,
		`{"name":"","slug":"nova","adminUsername":"sef","adminPassword":"lozinka123"}`,
		`{"name":"Nova","slug":"nova","adminUsername":"","adminPassword":"lozinka123"}`,
		`{"name":"Nova","slug":"nova","adminUsername":"sef","adminPassword":"123"}`,
		`{"name":"Duplikat","slug":"demo","adminUsername":"sef","adminPassword":"lozinka123"}`,
	} {
		if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/tenants", body); rec.Code != http.StatusUnprocessableEntity {
			t.Errorf("create %s = %d %s, want 422", body, rec.Code, rec.Body.String())
		}
	}

	rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/tenants",
		`{"name":"Štamparija Novi Sad","slug":" Novi-Sad ","adminUsername":"sef","adminPassword":"lozinka123"}`)
	var created domain.PlatformTenant
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil || rec.Code != http.StatusCreated {
		t.Fatalf("create = %d %s", rec.Code, rec.Body.String())
	}
	if created.Slug != "novi-sad" || created.Name != "Štamparija Novi Sad" || created.Users != 1 || created.Admins != 1 || created.SuspendedAt != nil {
		t.Fatalf("created = %+v", created)
	}
	if res := tenantLogin(t, server, "novi-sad", "sef", "lozinka123"); !res.Success || res.User.Role != domain.RoleAdmin {
		t.Fatalf("first admin login = %+v", res)
	}

	rec = platformRequest(t, server, cookie, http.MethodGet, "/platform/tenants", "")
	var tenants []domain.PlatformTenant
	if err := json.Unmarshal(rec.Body.Bytes(), &tenants); err != nil || len(tenants) != 3 {
		t.Fatalf("tenants = %d %s", rec.Code, rec.Body.String())
	}

	// Rename and move the sign-in slug.
	rec = platformRequest(t, server, cookie, http.MethodPatch, "/platform/tenants/novi-sad", `{"name":"Štamparija NS","slug":"stamparija-ns"}`)
	var updated domain.PlatformTenant
	if err := json.Unmarshal(rec.Body.Bytes(), &updated); err != nil || rec.Code != http.StatusOK || updated.Slug != "stamparija-ns" || updated.Name != "Štamparija NS" {
		t.Fatalf("update = %d %s", rec.Code, rec.Body.String())
	}
	if res := tenantLogin(t, server, "novi-sad", "sef", "lozinka123"); res.Success {
		t.Fatal("old slug still signs in")
	}
	if res := tenantLogin(t, server, "stamparija-ns", "sef", "lozinka123"); !res.Success {
		t.Fatalf("new slug login = %+v", res)
	}
	if rec := platformRequest(t, server, cookie, http.MethodPatch, "/platform/tenants/stamparija-ns", `{"slug":"demo"}`); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("slug taken = %d, want 422", rec.Code)
	}
	if rec := platformRequest(t, server, cookie, http.MethodPatch, "/platform/tenants/missing", `{"name":"X"}`); rec.Code != http.StatusNotFound {
		t.Fatalf("update unknown = %d, want 404", rec.Code)
	}
	// No change, no audit row.
	platformRequest(t, server, cookie, http.MethodPatch, "/platform/tenants/stamparija-ns", `{"name":"Štamparija NS"}`)

	events := auditActions(t, server, cookie)
	if len(events) != 2 || events[0].Action != domain.AuditTenantUpdate || events[1].Action != domain.AuditTenantCreate {
		t.Fatalf("audit = %+v", events)
	}
	if events[0].Detail["fromSlug"] != "novi-sad" || events[0].Detail["toSlug"] != "stamparija-ns" ||
		events[0].Detail["toName"] != "Štamparija NS" || events[0].TenantSlug != "stamparija-ns" || events[0].AdminUsername != "ops" {
		t.Fatalf("update audit = %+v", events[0])
	}
	if events[1].TenantSlug != "novi-sad" || events[1].TargetUsername != "sef" {
		t.Fatalf("create audit = %+v", events[1])
	}
}

func TestPlatformSuspendTenant(t *testing.T) {
	server, adminToken, _ := newServerWithRoles(t)
	cookie := signedInPlatform(t, server)
	tenantCookie := &http.Cookie{Name: server.config.SessionCookieName, Value: adminToken}

	rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/tenants/demo/suspend", "")
	var suspended domain.PlatformTenant
	if err := json.Unmarshal(rec.Body.Bytes(), &suspended); err != nil || rec.Code != http.StatusOK || suspended.SuspendedAt == nil {
		t.Fatalf("suspend = %d %s", rec.Code, rec.Body.String())
	}
	// Open sessions end, and new sign-ins are refused with a clear reason.
	if rec := platformRequest(t, server, tenantCookie, http.MethodGet, "/customers", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("session after suspend = %d, want 401", rec.Code)
	}
	if res := tenantLogin(t, server, "demo", "admin", "admin123"); res.Success || res.Error != tenantSuspendedMessage {
		t.Fatalf("login while suspended = %+v", res)
	}
	// Wrong credentials still get the generic answer.
	if res := tenantLogin(t, server, "demo", "admin", "wrong"); res.Error == tenantSuspendedMessage {
		t.Fatal("suspension revealed to wrong credentials")
	}
	// The Backoffice can still look inside.
	rec = platformRequest(t, server, cookie, http.MethodPost, "/platform/tenants/demo/impersonate", `{"userId":"admin-1","reason":"Podrška: prijava greške"}`)
	impersonation := platformCookie(rec, server.config.SessionCookieName)
	if impersonation == nil {
		t.Fatalf("impersonate suspended = %d %s", rec.Code, rec.Body.String())
	}
	if rec := platformRequest(t, server, impersonation, http.MethodGet, "/customers", ""); rec.Code != http.StatusOK {
		t.Fatalf("impersonated read while suspended = %d", rec.Code)
	}
	// Suspending twice is a no-op.
	platformRequest(t, server, cookie, http.MethodPost, "/platform/tenants/demo/suspend", "")

	rec = platformRequest(t, server, cookie, http.MethodPost, "/platform/tenants/demo/reactivate", "")
	var active domain.PlatformTenant
	if err := json.Unmarshal(rec.Body.Bytes(), &active); err != nil || active.SuspendedAt != nil {
		t.Fatalf("reactivate = %d %s", rec.Code, rec.Body.String())
	}
	if res := tenantLogin(t, server, "demo", "admin", "admin123"); !res.Success {
		t.Fatalf("login after reactivate = %+v", res)
	}
	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/tenants/missing/suspend", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("suspend unknown = %d, want 404", rec.Code)
	}

	events := auditActions(t, server, cookie)
	if len(events) != 3 || events[0].Action != domain.AuditTenantReactivate ||
		events[1].Action != domain.AuditImpersonationStart || events[2].Action != domain.AuditTenantSuspend {
		t.Fatalf("audit = %+v", events)
	}
}

func TestPlatformResetUserPassword(t *testing.T) {
	server, _, userToken := newServerWithRoles(t)
	cookie := signedInPlatform(t, server)
	userCookie := &http.Cookie{Name: server.config.SessionCookieName, Value: userToken}

	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/tenants/demo/users/user-1/password", `{"password":"123"}`); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("short password = %d, want 422", rec.Code)
	}
	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/tenants/demo/users/nobody/password", `{"password":"nova-lozinka"}`); rec.Code != http.StatusNotFound {
		t.Fatalf("unknown user = %d, want 404", rec.Code)
	}
	rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/tenants/demo/users/user-1/password", `{"password":"nova-lozinka"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("reset = %d %s", rec.Code, rec.Body.String())
	}
	if res := tenantLogin(t, server, "demo", "operater", "operater123"); res.Success {
		t.Fatal("old password still works")
	}
	if res := tenantLogin(t, server, "demo", "operater", "nova-lozinka"); !res.Success {
		t.Fatalf("new password login = %+v", res)
	}
	if rec := platformRequest(t, server, userCookie, http.MethodGet, "/customers", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("old session after reset = %d, want 401", rec.Code)
	}
	events := auditActions(t, server, cookie)
	if len(events) != 1 || events[0].Action != domain.AuditUserPasswordReset || events[0].TargetUsername != "operater" || events[0].Detail != nil {
		t.Fatalf("audit = %+v", events)
	}
}
