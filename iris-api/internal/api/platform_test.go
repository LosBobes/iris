package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

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

	// No operator account exists until one is created from the server.
	if res := decodePlatformLogin(t, platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login", login)); res.Success {
		t.Fatal("login succeeded with no platform admins")
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
	if res := decodePlatformLogin(t, rec); !res.Success || res.Admin == nil || res.Admin.Username != "ops" {
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

func TestLoginLimiterWindow(t *testing.T) {
	limiter := newLoginLimiter(15*time.Minute, 2, 3)
	if !limiter.allow("a") {
		t.Fatal("fresh key refused")
	}
	limiter.fail("a")
	limiter.fail("a")
	if limiter.allow("a") {
		t.Fatal("key allowed past per-key limit")
	}
	if !limiter.allow("b") {
		t.Fatal("other key refused before global limit")
	}
	limiter.fail("b")
	if limiter.allow("c") {
		t.Fatal("global limit not enforced")
	}
}
