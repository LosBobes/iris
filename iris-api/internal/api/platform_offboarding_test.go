package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func TestPlatformOffboardingRoutesNeedSuperadmin(t *testing.T) {
	server, adminToken, _ := newServerWithRoles(t)
	tenantCookie := &http.Cookie{Name: server.config.SessionCookieName, Value: adminToken}
	for _, route := range []struct{ method, path string }{
		{http.MethodGet, "/platform/tenants/demo/export"},
		{http.MethodDelete, "/platform/tenants/demo"},
	} {
		for _, cookie := range []*http.Cookie{nil, tenantCookie} {
			if rec := platformRequest(t, server, cookie, route.method, route.path, `{"confirmSlug":"demo"}`); rec.Code != http.StatusUnauthorized {
				t.Errorf("%s %s with cookie %v = %d, want 401", route.method, route.path, cookie != nil, rec.Code)
			}
		}
	}
}

func TestPlatformExportTenantDownload(t *testing.T) {
	server, _, _ := newServerWithRoles(t)
	cookie := signedInPlatform(t, server)

	rec := platformRequest(t, server, cookie, http.MethodGet, "/platform/tenants/demo/export", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("export = %d %s", rec.Code, rec.Body.String())
	}
	disposition := rec.Header().Get("Content-Disposition")
	if !strings.HasPrefix(disposition, `attachment; filename="iris-demo-`) || !strings.HasSuffix(disposition, `.json"`) {
		t.Fatalf("Content-Disposition = %q", disposition)
	}
	if strings.Contains(rec.Body.String(), "password_hash") || strings.Contains(rec.Body.String(), "$2a$") {
		t.Fatal("export leaks password hashes")
	}
	var export domain.PlatformTenantExport
	if err := json.Unmarshal(rec.Body.Bytes(), &export); err != nil {
		t.Fatal(err)
	}
	if export.Format != domain.PlatformTenantExportFormat || export.Tenant.Slug != "demo" || export.Counts["users"] != 2 {
		t.Fatalf("export = %+v", export)
	}
	if rec := platformRequest(t, server, cookie, http.MethodGet, "/platform/tenants/missing/export", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("export unknown = %d, want 404", rec.Code)
	}
	if events := auditActions(t, server, cookie); len(events) != 1 || events[0].Action != domain.AuditTenantExport || events[0].TenantSlug != "demo" {
		t.Fatalf("audit = %+v", events)
	}
}

func TestPlatformDeleteTenantGuards(t *testing.T) {
	server, adminToken, _ := newServerWithRoles(t)
	cookie := signedInPlatform(t, server)

	// An active organization cannot be deleted, even with the right slug.
	if rec := platformRequest(t, server, cookie, http.MethodDelete, "/platform/tenants/demo", `{"confirmSlug":"demo"}`); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("delete active = %d %s, want 422", rec.Code, rec.Body.String())
	}
	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/tenants/demo/suspend", ""); rec.Code != http.StatusOK {
		t.Fatalf("suspend = %d", rec.Code)
	}
	for _, body := range []string{`{}`, `{"confirmSlug":"Demo"}`, `{"confirmSlug":"dem"}`} {
		if rec := platformRequest(t, server, cookie, http.MethodDelete, "/platform/tenants/demo", body); rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("delete with %s = %d %s, want 422", body, rec.Code, rec.Body.String())
		}
	}
	if rec := platformRequest(t, server, cookie, http.MethodDelete, "/platform/tenants/missing", `{"confirmSlug":"missing"}`); rec.Code != http.StatusNotFound {
		t.Fatalf("delete unknown = %d, want 404", rec.Code)
	}

	rec := platformRequest(t, server, cookie, http.MethodDelete, "/platform/tenants/demo", `{"confirmSlug":"demo"}`)
	var deletion domain.PlatformTenantDeletion
	if err := json.Unmarshal(rec.Body.Bytes(), &deletion); err != nil || rec.Code != http.StatusOK {
		t.Fatalf("delete = %d %s", rec.Code, rec.Body.String())
	}
	if deletion.Slug != "demo" || deletion.Rows["users"] != 2 || deletion.TotalRows < 2 {
		t.Fatalf("deletion = %+v", deletion)
	}
	if res := tenantLogin(t, server, "demo", "admin", "admin123"); res.Success {
		t.Fatal("login into a deleted organization succeeded")
	}
	tenantCookie := &http.Cookie{Name: server.config.SessionCookieName, Value: adminToken}
	if rec := platformRequest(t, server, tenantCookie, http.MethodGet, "/customers", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("old session after delete = %d, want 401", rec.Code)
	}
	if rec := platformRequest(t, server, cookie, http.MethodGet, "/platform/tenants/demo/users", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("users of deleted organization = %d, want 404", rec.Code)
	}

	events := auditActions(t, server, cookie)
	if len(events) != 2 || events[0].Action != domain.AuditTenantDelete || events[0].TenantSlug != "demo" ||
		events[0].Detail["users"] != "2" || events[1].Action != domain.AuditTenantSuspend {
		t.Fatalf("audit = %+v", events)
	}
}
