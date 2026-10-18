package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

func platformRequest(t *testing.T, server *Server, cookie *http.Cookie, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	return rec
}

func platformCookie(rec *httptest.ResponseRecorder, name string) *http.Cookie {
	for _, cookie := range rec.Result().Cookies() {
		if cookie.Name == name && cookie.Value != "" {
			return cookie
		}
	}
	return nil
}

func decodePlatformLogin(t *testing.T, rec *httptest.ResponseRecorder) domain.PlatformLoginResponse {
	t.Helper()
	var response domain.PlatformLoginResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode %s: %v", rec.Body.String(), err)
	}
	return response
}

func TestPlatformConsoleAccess(t *testing.T) {
	server, adminToken, _ := newServerWithRoles(t)
	platform := server.store.(store.PlatformStore)
	login := `{"username":"ops","password":"correct-horse-battery"}`

	// "ops" does not exist until it is created from the server (only the
	// seeded default "admin" does).
	if res := decodePlatformLogin(t, platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login", login)); res.Success {
		t.Fatal("login succeeded for an account that does not exist")
	}
	if err := platform.UpsertPlatformAdmin(context.Background(), "ops", "correct-horse-battery"); err != nil {
		t.Fatal(err)
	}

	// An organization admin's session is not an operator session.
	tenantCookie := &http.Cookie{Name: server.config.SessionCookieName, Value: adminToken}
	if rec := platformRequest(t, server, tenantCookie, http.MethodGet, "/platform/metrics", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("metrics with tenant session = %d, want 401", rec.Code)
	}
	if rec := platformRequest(t, server, nil, http.MethodGet, "/platform/metrics", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("metrics anonymous = %d, want 401", rec.Code)
	}

	rec := platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login", login)
	if res := decodePlatformLogin(t, rec); !res.Success || res.Admin == nil || res.Admin.Username != "ops" || res.Admin.Role != domain.PlatformRoleSuperadmin {
		t.Fatalf("login = %s", rec.Body.String())
	}
	cookie := platformCookie(rec, server.config.PlatformSessionCookieName)
	if cookie == nil || !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode {
		t.Fatalf("platform cookie = %+v, want HttpOnly + SameSite=Strict", cookie)
	}
	// The operator cookie must not double as an organization session.
	if rec := platformRequest(t, server, &http.Cookie{Name: server.config.SessionCookieName, Value: cookie.Value}, http.MethodGet, "/customers", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("customers with platform token = %d, want 401", rec.Code)
	}

	if res := decodePlatformLogin(t, platformRequest(t, server, cookie, http.MethodGet, "/platform/auth/session", "")); !res.Success {
		t.Fatal("session not recognised")
	}

	rec = platformRequest(t, server, cookie, http.MethodGet, "/platform/metrics?days=7", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("metrics = %d %s", rec.Code, rec.Body.String())
	}
	var metrics domain.PlatformMetrics
	if err := json.Unmarshal(rec.Body.Bytes(), &metrics); err != nil {
		t.Fatal(err)
	}
	if metrics.RangeDays != 7 || len(metrics.Daily) != 7 || metrics.Totals.Users != 2 || metrics.System.GoVersion == "" {
		t.Fatalf("metrics = %+v", metrics)
	}
	for _, secret := range []string{"operater", `"admin"`, "password", "token"} {
		if strings.Contains(rec.Body.String(), secret) {
			t.Fatalf("metrics payload contains %q", secret)
		}
	}
	if rec := platformRequest(t, server, cookie, http.MethodGet, "/platform/metrics?days=3", ""); rec.Code != http.StatusBadRequest {
		t.Fatalf("days=3 = %d, want 400", rec.Code)
	}

	platformRequest(t, server, cookie, http.MethodPost, "/platform/auth/logout", "")
	if rec := platformRequest(t, server, cookie, http.MethodGet, "/platform/metrics", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("metrics after logout = %d, want 401", rec.Code)
	}
}

func TestPlatformLoginIsRateLimited(t *testing.T) {
	server, _, _ := newServerWithRoles(t)
	platform := server.store.(store.PlatformStore)
	if err := platform.UpsertPlatformAdmin(context.Background(), "ops", "correct-horse-battery"); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 5; i++ {
		platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login", `{"username":"ops","password":"guess-guess-guess"}`)
	}
	// Even the right password is refused until the window passes.
	rec := platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login", `{"username":"ops","password":"correct-horse-battery"}`)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("after 5 failures = %d, want 429", rec.Code)
	}
}

func TestTenantLoginIsRecordedForPlatformMetrics(t *testing.T) {
	server, _, _ := newServerWithRoles(t)
	rec := platformRequest(t, server, nil, http.MethodPost, "/auth/login", `{"orgSlug":"demo","username":"admin","password":"admin123"}`)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"success":true`) {
		t.Fatalf("tenant login = %d %s", rec.Code, rec.Body.String())
	}
	platform := server.store.(store.PlatformStore)
	if err := platform.UpsertPlatformAdmin(context.Background(), "ops", "correct-horse-battery"); err != nil {
		t.Fatal(err)
	}
	login := platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login", `{"username":"ops","password":"correct-horse-battery"}`)
	cookie := platformCookie(login, server.config.PlatformSessionCookieName)
	var metrics domain.PlatformMetrics
	if err := json.Unmarshal(platformRequest(t, server, cookie, http.MethodGet, "/platform/metrics", "").Body.Bytes(), &metrics); err != nil {
		t.Fatal(err)
	}
	if metrics.Totals.LoginsInRange != 1 || metrics.Totals.ActiveUsersInRange != 1 {
		t.Fatalf("logins = %d, active users = %d; want 1, 1", metrics.Totals.LoginsInRange, metrics.Totals.ActiveUsersInRange)
	}
}

// TestDefaultPlatformAdminMustChangePassword: the seeded admin/admin123321 can
// sign in, but sees no metrics until it picks a new password.
func TestDefaultPlatformAdminMustChangePassword(t *testing.T) {
	server, _, _ := newServerWithRoles(t)

	rec := platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login", `{"username":"admin","password":"admin123321"}`)
	res := decodePlatformLogin(t, rec)
	if !res.Success || res.Admin == nil || !res.Admin.MustChangePassword || res.Admin.Role != domain.PlatformRoleSuperadmin {
		t.Fatalf("default login = %s, want success with mustChangePassword", rec.Body.String())
	}
	cookie := platformCookie(rec, server.config.PlatformSessionCookieName)

	if rec := platformRequest(t, server, cookie, http.MethodGet, "/platform/metrics", ""); rec.Code != http.StatusForbidden {
		t.Fatalf("metrics before change = %d, want 403", rec.Code)
	}

	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/auth/password",
		`{"currentPassword":"wrong","newPassword":"a-much-better-password"}`); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("wrong current password = %d, want 422", rec.Code)
	}
	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/auth/password",
		`{"currentPassword":"admin123321","newPassword":"short"}`); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("short new password = %d, want 422", rec.Code)
	}
	if rec := platformRequest(t, server, nil, http.MethodPost, "/platform/auth/password",
		`{"currentPassword":"admin123321","newPassword":"a-much-better-password"}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous change = %d, want 401", rec.Code)
	}

	rec = platformRequest(t, server, cookie, http.MethodPost, "/platform/auth/password",
		`{"currentPassword":"admin123321","newPassword":"a-much-better-password"}`)
	if res := decodePlatformLogin(t, rec); !res.Success || res.Admin.MustChangePassword {
		t.Fatalf("change = %s", rec.Body.String())
	}
	if rec := platformRequest(t, server, cookie, http.MethodGet, "/platform/metrics", ""); rec.Code != http.StatusOK {
		t.Fatalf("metrics after change = %d, want 200", rec.Code)
	}
	if res := decodePlatformLogin(t, platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login",
		`{"username":"admin","password":"admin123321"}`)); res.Success {
		t.Fatal("default password still signs in")
	}
}

// TestBackofficeAccountsAreSeparateFromUsers: Backoffice superadmins and
// organization users live in different tables with different sessions. Neither
// side's credentials or sessions work on the other, and the same username on
// both sides ("admin") names two unrelated accounts.
func TestBackofficeAccountsAreSeparateFromUsers(t *testing.T) {
	server, adminToken, _ := newServerWithRoles(t)

	// The organization admin ("admin"/"admin123" in demo) cannot open the Backoffice.
	if res := decodePlatformLogin(t, platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login",
		`{"username":"admin","password":"admin123"}`)); res.Success {
		t.Fatal("organization credentials signed in to the Backoffice")
	}
	// The Backoffice admin ("admin"/"admin123321") cannot sign in to any organization.
	for _, org := range []string{"demo", "grafika-cobanovic"} {
		rec := platformRequest(t, server, nil, http.MethodPost, "/auth/login",
			`{"orgSlug":"`+org+`","username":"admin","password":"admin123321"}`)
		if strings.Contains(rec.Body.String(), `"success":true`) {
			t.Fatalf("Backoffice credentials signed in to %s", org)
		}
	}

	// Changing the Backoffice admin's password leaves the organization admin alone.
	login := platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login", `{"username":"admin","password":"admin123321"}`)
	cookie := platformCookie(login, server.config.PlatformSessionCookieName)
	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/auth/password",
		`{"currentPassword":"admin123321","newPassword":"a-much-better-password"}`); rec.Code != http.StatusOK {
		t.Fatalf("change = %d %s", rec.Code, rec.Body.String())
	}
	rec := platformRequest(t, server, nil, http.MethodPost, "/auth/login", `{"orgSlug":"demo","username":"admin","password":"admin123"}`)
	if !strings.Contains(rec.Body.String(), `"success":true`) {
		t.Fatalf("organization admin login broke after Backoffice password change: %s", rec.Body.String())
	}

	// Sessions do not cross either: an org session cookie value is not a
	// Backoffice session, and a Backoffice token is not an org session.
	if rec := platformRequest(t, server, &http.Cookie{Name: server.config.PlatformSessionCookieName, Value: adminToken},
		http.MethodGet, "/platform/metrics", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("org token as Backoffice session = %d, want 401", rec.Code)
	}
	if rec := platformRequest(t, server, &http.Cookie{Name: server.config.SessionCookieName, Value: cookie.Value},
		http.MethodGet, "/settings", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("Backoffice token as org session = %d, want 401", rec.Code)
	}

	// Organization user listings never include Backoffice accounts.
	users := platformRequest(t, server, &http.Cookie{Name: server.config.SessionCookieName, Value: adminToken}, http.MethodGet, "/users", "")
	if strings.Contains(users.Body.String(), "superadmin") || strings.Count(users.Body.String(), `"username"`) != 2 {
		t.Fatalf("org users = %s, want only the two organization accounts", users.Body.String())
	}
}

// TestOverlongPasswordsGetAClearError: bcrypt cannot hash more than 72 bytes.
// That used to escape as a 500 ("Došlo je do greške na serveru."); it is now a
// 422 that says what is wrong, for Backoffice and organization users alike.
func TestOverlongPasswordsGetAClearError(t *testing.T) {
	server, adminToken, _ := newServerWithRoles(t)
	login := platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login", `{"username":"admin","password":"admin123321"}`)
	cookie := platformCookie(login, server.config.PlatformSessionCookieName)

	for name, password := range map[string]string{
		"73 ASCII characters":            strings.Repeat("a", 73),
		"37 letters that take two bytes": strings.Repeat("ž", 37),
	} {
		t.Run(name, func(t *testing.T) {
			rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/auth/password",
				`{"currentPassword":"admin123321","newPassword":"`+password+`"}`)
			if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "preduga") {
				t.Fatalf("Backoffice change = %d %s, want 422 saying it is too long", rec.Code, rec.Body.String())
			}
			rec = roleRequest(t, server, adminToken, http.MethodPost, "/users",
				`{"username":"dugacka","password":"`+password+`","role":"user"}`)
			if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "preduga") {
				t.Fatalf("org user create = %d %s, want 422 saying it is too long", rec.Code, rec.Body.String())
			}
		})
	}

	// Exactly 72 bytes is still fine.
	rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/auth/password",
		`{"currentPassword":"admin123321","newPassword":"`+strings.Repeat("a", 72)+`"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("72-byte password = %d %s, want 200", rec.Code, rec.Body.String())
	}
}

func TestPlatformMetricsReportBuildAndDatabaseEngine(t *testing.T) {
	server, adminToken, _ := newServerWithRoles(t)
	platform := server.store.(store.PlatformStore)
	if err := platform.UpsertPlatformAdmin(context.Background(), "ops", "correct-horse-battery"); err != nil {
		t.Fatal(err)
	}

	// Only a superadmin's platform session reads the build details; an
	// organization admin's session is refused like any other metrics request.
	tenantCookie := &http.Cookie{Name: server.config.SessionCookieName, Value: adminToken}
	if rec := platformRequest(t, server, tenantCookie, http.MethodGet, "/platform/metrics", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("metrics with tenant session = %d, want 401", rec.Code)
	}

	login := platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login", `{"username":"ops","password":"correct-horse-battery"}`)
	cookie := platformCookie(login, server.config.PlatformSessionCookieName)
	if cookie == nil {
		t.Fatalf("login = %s", login.Body.String())
	}
	system := func() domain.PlatformSystem {
		t.Helper()
		rec := platformRequest(t, server, cookie, http.MethodGet, "/platform/metrics", "")
		if rec.Code != http.StatusOK {
			t.Fatalf("metrics = %d %s", rec.Code, rec.Body.String())
		}
		var metrics domain.PlatformMetrics
		if err := json.Unmarshal(rec.Body.Bytes(), &metrics); err != nil {
			t.Fatal(err)
		}
		return metrics.System
	}

	// A source build (no ldflags) reports "dev" and no commit.
	if got := system(); got.Version != "dev" || got.Commit != "" || got.DatabaseEngine != "sqlite" {
		t.Fatalf("source build system = %+v, want version dev, no commit, sqlite", got)
	}

	server.config.Version = "2.3.0"
	server.config.Commit = "de3a569"
	if got := system(); got.Version != "2.3.0" || got.Commit != "de3a569" || got.DatabaseEngine != "sqlite" {
		t.Fatalf("release build system = %+v", got)
	}
}
