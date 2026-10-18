package api

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func decodeAnnouncement(t *testing.T, body []byte) domain.PlatformAnnouncement {
	t.Helper()
	var item domain.PlatformAnnouncement
	if err := json.Unmarshal(body, &item); err != nil {
		t.Fatalf("decode announcement %s: %v", body, err)
	}
	return item
}

func activeAnnouncements(t *testing.T, server *Server, cookie *http.Cookie, path string) []map[string]any {
	t.Helper()
	rec := platformRequest(t, server, cookie, http.MethodGet, path, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET %s = %d %s", path, rec.Code, rec.Body.String())
	}
	var items []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("decode %s: %v", rec.Body.String(), err)
	}
	return items
}

func TestAnnouncementRoutesNeedTheRightSession(t *testing.T) {
	server, adminToken, _ := newServerWithRoles(t)
	tenantCookie := &http.Cookie{Name: server.config.SessionCookieName, Value: adminToken}
	for _, route := range []struct{ method, path string }{
		{http.MethodGet, "/platform/announcements"},
		{http.MethodPost, "/platform/announcements"},
		{http.MethodPut, "/platform/announcements/ann-1"},
		{http.MethodPost, "/platform/announcements/ann-1/end"},
		{http.MethodDelete, "/platform/announcements/ann-1"},
	} {
		if rec := platformRequest(t, server, tenantCookie, route.method, route.path, `{}`); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s with tenant session = %d, want 401", route.method, route.path, rec.Code)
		}
	}
	// The organization read needs an organization session; a platform one is not.
	platformCookie := signedInPlatform(t, server)
	if rec := platformRequest(t, server, platformCookie, http.MethodGet, "/announcements", ""); rec.Code != http.StatusUnauthorized {
		t.Errorf("GET /announcements with platform session = %d, want 401", rec.Code)
	}
}

func TestAnnouncementLifecycle(t *testing.T) {
	server, adminToken, userToken := newServerWithRoles(t)
	cookie := signedInPlatform(t, server)
	operator := &http.Cookie{Name: server.config.SessionCookieName, Value: userToken}
	admin := &http.Cookie{Name: server.config.SessionCookieName, Value: adminToken}

	if got := activeAnnouncements(t, server, operator, "/announcements"); len(got) != 0 {
		t.Fatalf("initial = %v", got)
	}

	for _, body := range []string{
		`{"message":"","severity":"info","allTenants":true}`,
		`{"message":"x","severity":"loud","allTenants":true}`,
		`{"message":"x","severity":"info","tenantSlugs":["nepostojeca"]}`,
		`{"message":"x","severity":"info"}`,
	} {
		if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/announcements", body); rec.Code != http.StatusUnprocessableEntity {
			t.Errorf("create %s = %d %s, want 422", body, rec.Code, rec.Body.String())
		}
	}

	rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/announcements",
		`{"message":"Sistem se ažurira u 22h.","severity":"maintenance","tenantSlugs":["demo"]}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create = %d %s", rec.Code, rec.Body.String())
	}
	created := decodeAnnouncement(t, rec.Body.Bytes())
	if created.Status != domain.AnnouncementActive || len(created.Tenants) != 1 || created.Tenants[0].Slug != "demo" {
		t.Fatalf("created = %+v", created)
	}

	for _, path := range []string{"/announcements", "/public/organizations/demo/announcements"} {
		var c *http.Cookie
		if path == "/announcements" {
			c = admin
		}
		items := activeAnnouncements(t, server, c, path)
		if len(items) != 1 || items[0]["message"] != "Sistem se ažurira u 22h." || items[0]["severity"] != "maintenance" {
			t.Fatalf("%s = %v", path, items)
		}
		// Organization-facing answers carry no Backoffice detail.
		for _, key := range []string{"tenants", "allTenants", "createdBy", "status"} {
			if _, ok := items[0][key]; ok {
				t.Errorf("%s exposes %q", path, key)
			}
		}
	}
	if rec := platformRequest(t, server, nil, http.MethodGet, "/public/organizations/nema/announcements", ""); rec.Code != http.StatusNotFound {
		t.Errorf("unknown org = %d, want 404", rec.Code)
	}

	rec = platformRequest(t, server, cookie, http.MethodPut, "/platform/announcements/"+created.ID,
		`{"message":"Sistem se ažurira u 23h.","severity":"warning","startsAt":"`+created.StartsAt+`","allTenants":true}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("update = %d %s", rec.Code, rec.Body.String())
	}
	if updated := decodeAnnouncement(t, rec.Body.Bytes()); !updated.AllTenants || updated.Severity != "warning" {
		t.Fatalf("updated = %+v", updated)
	}

	rec = platformRequest(t, server, cookie, http.MethodPost, "/platform/announcements/"+created.ID+"/end", "")
	if rec.Code != http.StatusOK || decodeAnnouncement(t, rec.Body.Bytes()).Status != domain.AnnouncementEnded {
		t.Fatalf("end = %d %s", rec.Code, rec.Body.String())
	}
	if got := activeAnnouncements(t, server, operator, "/announcements"); len(got) != 0 {
		t.Fatalf("after end = %v", got)
	}

	rec = platformRequest(t, server, cookie, http.MethodGet, "/platform/announcements", "")
	var list []domain.PlatformAnnouncement
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil || len(list) != 1 {
		t.Fatalf("list = %d %s", rec.Code, rec.Body.String())
	}

	if rec := platformRequest(t, server, cookie, http.MethodDelete, "/platform/announcements/"+created.ID, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete = %d %s", rec.Code, rec.Body.String())
	}
	if rec := platformRequest(t, server, cookie, http.MethodDelete, "/platform/announcements/"+created.ID, ""); rec.Code != http.StatusNotFound {
		t.Fatalf("delete again = %d, want 404", rec.Code)
	}
	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/announcements/ann-x/end", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("end unknown = %d, want 404", rec.Code)
	}

	events := auditActions(t, server, cookie)
	var actions []string
	for _, event := range events {
		actions = append(actions, event.Action)
	}
	want := []string{domain.AuditAnnouncementDelete, domain.AuditAnnouncementEnd, domain.AuditAnnouncementUpdate, domain.AuditAnnouncementCreate}
	if len(actions) < len(want) {
		t.Fatalf("audit = %v", actions)
	}
	for i, action := range want {
		if actions[i] != action {
			t.Fatalf("audit = %v, want prefix %v", actions, want)
		}
	}
	if events[0].AdminUsername != "ops" || events[0].Detail["announcementId"] != created.ID {
		t.Fatalf("delete event = %+v", events[0])
	}
}
