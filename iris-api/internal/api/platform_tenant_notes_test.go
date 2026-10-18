package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func TestPlatformTenantNotesAndHealth(t *testing.T) {
	server, adminToken, _ := newServerWithRoles(t)
	tenantCookie := &http.Cookie{Name: server.config.SessionCookieName, Value: adminToken}
	body := `{"contactName":"Marko Marković","contactEmail":"marko@example.com","contactPhone":"064 123","plan":"Godišnji","notes":"Plaća do 15.\nZove ujutru."}`

	// Organization sessions never reach the notes.
	if rec := platformRequest(t, server, tenantCookie, http.MethodPut, "/platform/tenants/demo/notes", body); rec.Code != http.StatusUnauthorized {
		t.Fatalf("notes with tenant session = %d, want 401", rec.Code)
	}

	cookie := signedInPlatform(t, server)
	if rec := platformRequest(t, server, cookie, http.MethodPut, "/platform/tenants/missing/notes", body); rec.Code != http.StatusNotFound {
		t.Fatalf("notes of unknown organization = %d, want 404", rec.Code)
	}
	if rec := platformRequest(t, server, cookie, http.MethodPut, "/platform/tenants/demo/notes", `{"contactEmail":"nije-adresa"}`); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid contact email = %d, want 422", rec.Code)
	}

	rec := platformRequest(t, server, cookie, http.MethodPut, "/platform/tenants/demo/notes", body)
	var saved domain.PlatformTenant
	if err := json.Unmarshal(rec.Body.Bytes(), &saved); err != nil || rec.Code != http.StatusOK {
		t.Fatalf("save notes = %d %s", rec.Code, rec.Body.String())
	}
	if saved.Notes.ContactName != "Marko Marković" || saved.Notes.Notes != "Plaća do 15.\nZove ujutru." || saved.Notes.UpdatedBy == nil || *saved.Notes.UpdatedBy != "ops" {
		t.Fatalf("saved notes = %+v", saved.Notes)
	}

	// The list carries notes and health for every organization.
	tenantLogin(t, server, "demo", "admin", "admin123")
	rec = platformRequest(t, server, cookie, http.MethodGet, "/platform/tenants", "")
	var tenants []domain.PlatformTenant
	if err := json.Unmarshal(rec.Body.Bytes(), &tenants); err != nil || rec.Code != http.StatusOK {
		t.Fatalf("list = %d %s", rec.Code, rec.Body.String())
	}
	var demo *domain.PlatformTenant
	for i := range tenants {
		if tenants[i].Slug == "demo" {
			demo = &tenants[i]
		}
	}
	if demo == nil || demo.Notes.Plan != "Godišnji" {
		t.Fatalf("listed demo = %+v", demo)
	}
	if demo.Health.LastLoginAt == nil || demo.Health.ActiveUsers7d < 1 || demo.Health.Dormant {
		t.Fatalf("demo health after a sign-in = %+v", demo.Health)
	}
	if !strings.Contains(rec.Body.String(), `"health":{`) || !strings.Contains(rec.Body.String(), `"activeUsers30d"`) {
		t.Fatalf("list lacks health: %s", rec.Body.String())
	}

	events := auditActions(t, server, cookie)
	if len(events) == 0 || events[0].Action != domain.AuditTenantNotes || events[0].TenantSlug != "demo" ||
		events[0].Detail["fields"] != "contactName,contactEmail,contactPhone,plan,notes" {
		t.Fatalf("audit = %+v", events)
	}

	// The organization's own settings never include the notes.
	rec = platformRequest(t, server, tenantCookie, http.MethodGet, "/settings", "")
	if rec.Code != http.StatusOK || strings.Contains(rec.Body.String(), "Marko") || strings.Contains(rec.Body.String(), "Godišnji") {
		t.Fatalf("tenant settings = %d %s", rec.Code, rec.Body.String())
	}
}
