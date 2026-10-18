package api

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"

	_ "modernc.org/sqlite"
)

// Short lifetimes so the tests can tell idle timeout, cap and throttle apart.
var sessionTestConfig = Config{
	SessionDuration:            2 * time.Hour,
	SessionMaxLifetime:         4 * time.Hour,
	RememberSessionDuration:    6 * time.Hour,
	RememberSessionMaxLifetime: 10 * time.Hour,
	SessionRefreshInterval:     10 * time.Minute,
}

type sessionTestEnv struct {
	server *Server
	store  *store.SQLiteStore
	db     *sql.DB
}

// newSessionTestEnv is a SQLite-backed server with the demo organization, an
// admin (admin/admin123) and an operator (operater/operater123), plus a second
// handle on the database to inspect and age session rows.
func newSessionTestEnv(t *testing.T, config Config) sessionTestEnv {
	t.Helper()
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "iris.db")
	sqliteStore, err := store.OpenSQLite(ctx, path)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = sqliteStore.Close() })
	if err := sqliteStore.EnsureTenant(ctx, store.DemoTenantID, store.DemoTenantSlug, store.DemoTenantName); err != nil {
		t.Fatal(err)
	}
	tenantCtx := store.ContextWithTenant(ctx, store.DemoTenantID)
	if err := sqliteStore.CreateUser(tenantCtx, "admin-1", "admin", "admin123", domain.RoleAdmin, false); err != nil {
		t.Fatal(err)
	}
	if err := sqliteStore.CreateUser(tenantCtx, "user-1", "operater", "operater123", domain.RoleUser, false); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return sessionTestEnv{server: NewServer(sqliteStore, config), store: sqliteStore, db: db}
}

func (env sessionTestEnv) do(t *testing.T, req *http.Request) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	env.server.Routes().ServeHTTP(rec, req)
	return rec
}

func loginRequest(t *testing.T, username, password string, remember bool) *http.Request {
	t.Helper()
	body, _ := json.Marshal(domain.LoginRequest{OrgSlug: "demo", Username: username, Password: password, Remember: remember})
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func (env sessionTestEnv) login(t *testing.T, username, password string, remember bool) *http.Cookie {
	t.Helper()
	rec := env.do(t, loginRequest(t, username, password, remember))
	var response domain.LoginResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil || !response.Success {
		t.Fatalf("login %s = %d %s", username, rec.Code, rec.Body.String())
	}
	cookie := platformCookie(rec, env.server.config.SessionCookieName)
	if cookie == nil {
		t.Fatalf("login %s set no session cookie", username)
	}
	return cookie
}

func (env sessionTestEnv) get(t *testing.T, token, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if token != "" {
		req.AddCookie(&http.Cookie{Name: env.server.config.SessionCookieName, Value: token})
	}
	return env.do(t, req)
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

type sessionRow struct {
	expiresAt, absoluteExpiresAt time.Time
	remember                     bool
}

func (env sessionTestEnv) session(t *testing.T, token string) (sessionRow, bool) {
	t.Helper()
	var expires, absolute string
	var row sessionRow
	err := env.db.QueryRow(
		`SELECT expires_at, absolute_expires_at, remember FROM sessions WHERE token_hash = ?`, tokenHash(token),
	).Scan(&expires, &absolute, &row.remember)
	if err == sql.ErrNoRows {
		return row, false
	}
	if err != nil {
		t.Fatal(err)
	}
	row.expiresAt, _ = time.Parse(time.RFC3339, expires)
	row.absoluteExpiresAt, _ = time.Parse(time.RFC3339, absolute)
	return row, true
}

// age rewrites a session's expiries, as if it had been signed in or last
// refreshed earlier.
func (env sessionTestEnv) age(t *testing.T, token string, expiresAt, absolute time.Time) {
	t.Helper()
	if _, err := env.db.Exec(
		`UPDATE sessions SET expires_at = ?, absolute_expires_at = ? WHERE token_hash = ?`,
		expiresAt.UTC().Format(time.RFC3339), absolute.UTC().Format(time.RFC3339), tokenHash(token),
	); err != nil {
		t.Fatal(err)
	}
}

func near(a, b time.Time) bool {
	d := a.Sub(b)
	return d > -5*time.Second && d < 5*time.Second
}

func TestLoginWithoutRememberUsesBrowserSessionCookie(t *testing.T) {
	env := newSessionTestEnv(t, sessionTestConfig)
	cookie := env.login(t, "operater", "operater123", false)
	if !cookie.Expires.IsZero() || cookie.MaxAge != 0 {
		t.Fatalf("cookie = %+v, want a browser-session cookie (no Expires/Max-Age)", cookie)
	}
	if !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode {
		t.Fatalf("cookie flags = %+v", cookie)
	}
	row, ok := env.session(t, cookie.Value)
	if !ok {
		t.Fatal("session row missing")
	}
	now := time.Now().UTC()
	if row.remember || !near(row.expiresAt, now.Add(2*time.Hour)) || !near(row.absoluteExpiresAt, now.Add(4*time.Hour)) {
		t.Fatalf("session = %+v, want idle 2h and cap 4h", row)
	}

	// An hour of use later the expiry slides, still without a cookie re-send.
	env.age(t, cookie.Value, now.Add(time.Hour), now.Add(3*time.Hour))
	rec := env.get(t, cookie.Value, "/customers")
	if rec.Code != http.StatusOK {
		t.Fatalf("customers = %d", rec.Code)
	}
	if got := platformCookie(rec, env.server.config.SessionCookieName); got != nil {
		t.Fatalf("browser-session cookie re-sent on refresh: %+v", got)
	}
	if row, _ := env.session(t, cookie.Value); !near(row.expiresAt, now.Add(2*time.Hour)) {
		t.Fatalf("expires_at = %v, want slid to now + 2h", row.expiresAt)
	}
}

func TestRememberedSessionSlidesThrottledAndCapped(t *testing.T) {
	env := newSessionTestEnv(t, sessionTestConfig)
	cookie := env.login(t, "operater", "operater123", true)
	row, _ := env.session(t, cookie.Value)
	now := time.Now().UTC()
	if !row.remember || !near(row.expiresAt, now.Add(6*time.Hour)) || !near(row.absoluteExpiresAt, now.Add(10*time.Hour)) {
		t.Fatalf("session = %+v, want remembered, idle 6h, cap 10h", row)
	}
	// The persistent cookie expires with the server-side session.
	if !near(cookie.Expires, row.expiresAt) || cookie.MaxAge < int((6*time.Hour-time.Minute).Seconds()) {
		t.Fatalf("cookie expiry = %v / max-age %d, want %v", cookie.Expires, cookie.MaxAge, row.expiresAt)
	}

	// Throttled: right after sign-in nothing is rewritten or re-sent.
	before, _ := env.session(t, cookie.Value)
	rec := env.get(t, cookie.Value, "/auth/session")
	if got := platformCookie(rec, env.server.config.SessionCookieName); got != nil {
		t.Fatalf("cookie re-sent within the refresh interval: %+v", got)
	}
	if after, _ := env.session(t, cookie.Value); !after.expiresAt.Equal(before.expiresAt) {
		t.Fatalf("expires_at rewritten within the refresh interval: %v -> %v", before.expiresAt, after.expiresAt)
	}

	// Past the interval: slides, and the cookie follows.
	env.age(t, cookie.Value, now.Add(5*time.Hour), now.Add(9*time.Hour))
	rec = env.get(t, cookie.Value, "/customers")
	refreshed := platformCookie(rec, env.server.config.SessionCookieName)
	row, _ = env.session(t, cookie.Value)
	if refreshed == nil || refreshed.Value != cookie.Value || !near(row.expiresAt, now.Add(6*time.Hour)) || !near(refreshed.Expires, row.expiresAt) {
		t.Fatalf("refresh: cookie = %+v, session = %+v", refreshed, row)
	}

	// Near the cap: the expiry stops at the absolute expiry, never beyond.
	capAt := now.Add(30 * time.Minute).Truncate(time.Second)
	env.age(t, cookie.Value, now.Add(25*time.Minute), capAt)
	rec = env.get(t, cookie.Value, "/customers")
	refreshed = platformCookie(rec, env.server.config.SessionCookieName)
	row, _ = env.session(t, cookie.Value)
	if !row.expiresAt.Equal(capAt) || refreshed == nil || !refreshed.Expires.Equal(capAt) {
		t.Fatalf("capped refresh: session = %+v, cookie = %+v, want both at %v", row, refreshed, capAt)
	}
	rec = env.get(t, cookie.Value, "/customers")
	if got := platformCookie(rec, env.server.config.SessionCookieName); got != nil {
		t.Fatalf("cookie re-sent at the cap: %+v", got)
	}

	// Past the cap the session is gone.
	env.age(t, cookie.Value, now.Add(-time.Minute), now.Add(-time.Minute))
	if rec := env.get(t, cookie.Value, "/customers"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("expired session = %d, want 401", rec.Code)
	}
}

func TestSessionTokensAreStoredHashed(t *testing.T) {
	env := newSessionTestEnv(t, sessionTestConfig)
	cookie := env.login(t, "admin", "admin123", false)

	var stored string
	if err := env.db.QueryRow(`SELECT token_hash FROM sessions`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored == cookie.Value || stored != tokenHash(cookie.Value) {
		t.Fatalf("stored = %q, want the SHA-256 of the issued token", stored)
	}
	var raw int
	if err := env.db.QueryRow(`SELECT COUNT(*) FROM sessions WHERE token_hash = ?`, cookie.Value).Scan(&raw); err != nil || raw != 0 {
		t.Fatalf("raw token found in sessions (%d, %v)", raw, err)
	}
	// The stored hash itself is not a usable cookie.
	if rec := env.get(t, stored, "/customers"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("hash as cookie = %d, want 401", rec.Code)
	}
	if rec := env.get(t, cookie.Value, "/customers"); rec.Code != http.StatusOK {
		t.Fatalf("customers = %d", rec.Code)
	}

	req := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	req.AddCookie(cookie)
	if rec := env.do(t, req); rec.Code != http.StatusOK {
		t.Fatalf("logout = %d", rec.Code)
	}
	if _, ok := env.session(t, cookie.Value); ok {
		t.Fatal("session survived logout")
	}
	if rec := env.get(t, cookie.Value, "/customers"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("customers after logout = %d, want 401", rec.Code)
	}
}

func TestImpersonationSessionIsHashedFixedAndTraced(t *testing.T) {
	env := newSessionTestEnv(t, sessionTestConfig)
	ctx := context.Background()
	if err := env.store.UpsertPlatformAdmin(ctx, "ops", "correct-horse-battery"); err != nil {
		t.Fatal(err)
	}
	login := platformRequest(t, env.server, nil, http.MethodPost, "/platform/auth/login", `{"username":"ops","password":"correct-horse-battery"}`)
	platformSession := platformCookie(login, env.server.config.PlatformSessionCookieName)
	rec := platformRequest(t, env.server, platformSession, http.MethodPost, "/platform/tenants/demo/impersonate", `{"userId":"user-1"}`)
	session := platformCookie(rec, env.server.config.SessionCookieName)
	if session == nil {
		t.Fatalf("impersonate = %d %s", rec.Code, rec.Body.String())
	}
	row, ok := env.session(t, session.Value)
	if !ok || !row.expiresAt.Equal(row.absoluteExpiresAt) {
		t.Fatalf("impersonation session = %+v (found %v), want fixed expiry", row, ok)
	}
	// An aged impersonation session is never extended.
	expires := time.Now().UTC().Add(5 * time.Minute).Truncate(time.Second)
	env.age(t, session.Value, expires, time.Now().UTC().Add(time.Hour))
	rec = platformRequest(t, env.server, session, http.MethodPost, "/customers", `{"id":"cust-imp","name":"Traced"}`)
	if rec.Code >= 300 {
		t.Fatalf("create customer as impersonated operator = %d %s", rec.Code, rec.Body.String())
	}
	if row, _ := env.session(t, session.Value); !row.expiresAt.Equal(expires) {
		t.Fatalf("impersonation expiry moved: %v -> %v", expires, row.expiresAt)
	}
	var traced int
	if err := env.db.QueryRow(`SELECT COUNT(*) FROM impersonation_actions WHERE method = 'POST' AND path = '/customers'`).Scan(&traced); err != nil || traced != 1 {
		t.Fatalf("traced actions = %d (%v), want 1", traced, err)
	}
}

func TestOrgLoginRateLimit(t *testing.T) {
	env := newSessionTestEnv(t, sessionTestConfig)
	attempt := func(username, password, ip string) int {
		req := loginRequest(t, username, password, false)
		if ip != "" {
			req.Header.Set("X-Real-IP", ip)
		}
		return env.do(t, req).Code
	}

	// A success clears the account's failures.
	for i := 0; i < 4; i++ {
		if code := attempt("operater", "wrong", "10.0.0.1"); code != http.StatusOK {
			t.Fatalf("failure %d = %d", i, code)
		}
	}
	if code := attempt("operater", "operater123", "10.0.0.1"); code != http.StatusOK {
		t.Fatalf("success = %d", code)
	}
	for i := 0; i < 4; i++ {
		if code := attempt("operater", "wrong", "10.0.0.1"); code != http.StatusOK {
			t.Fatalf("failure after reset %d = %d", i, code)
		}
	}

	// The fifth failure in a row locks this account out, even with the right
	// password and from another address.
	if code := attempt("Operater", "wrong", "10.0.0.2"); code != http.StatusOK {
		t.Fatalf("fifth failure = %d", code)
	}
	req := loginRequest(t, "operater", "operater123", false)
	req.Header.Set("X-Real-IP", "10.0.0.3")
	rec := env.do(t, req)
	var body map[string]string
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if rec.Code != http.StatusTooManyRequests || body["error"] != loginRateLimitedMessage {
		t.Fatalf("locked account = %d %s, want 429", rec.Code, rec.Body.String())
	}
	// Other accounts are unaffected.
	if code := attempt("admin", "admin123", "10.0.0.3"); code != http.StatusOK {
		t.Fatalf("other account = %d", code)
	}

	// Per address: 20 failures across many usernames block that address only.
	for i := 0; i < 20; i++ {
		if code := attempt(fmt.Sprintf("guess-%d", i), "x", "10.9.9.9"); code != http.StatusOK {
			t.Fatalf("ip failure %d = %d", i, code)
		}
	}
	if code := attempt("admin", "admin123", "10.9.9.9"); code != http.StatusTooManyRequests {
		t.Fatalf("blocked address = %d, want 429", code)
	}
	if code := attempt("admin", "admin123", "10.9.9.8"); code != http.StatusOK {
		t.Fatalf("other address = %d, want 200", code)
	}
}

func TestClientIPIgnoresSpoofableHeaders(t *testing.T) {
	var seen string
	handler := proxyRealIP(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { seen = clientIP(r) }))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "192.0.2.10:5555"
	req.Header.Set("True-Client-IP", "203.0.113.1")
	req.Header.Set("X-Forwarded-For", "203.0.113.2")
	handler.ServeHTTP(httptest.NewRecorder(), req)
	if seen != "192.0.2.10" {
		t.Fatalf("client ip = %q, want the peer address", seen)
	}
	req.Header.Set("X-Real-IP", "198.51.100.7")
	handler.ServeHTTP(httptest.NewRecorder(), req)
	if seen != "198.51.100.7" {
		t.Fatalf("client ip = %q, want X-Real-IP from nginx", seen)
	}
}

func TestPasswordChangeEndsUserSessions(t *testing.T) {
	env := newSessionTestEnv(t, sessionTestConfig)
	adminCurrent := env.login(t, "admin", "admin123", false)
	adminOther := env.login(t, "admin", "admin123", true)
	operator := env.login(t, "operater", "operater123", false)

	put := func(id, body string) int {
		req := httptest.NewRequest(http.MethodPut, "/users/"+id, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(adminCurrent)
		return env.do(t, req).Code
	}

	// A role-only change signs nobody out.
	if code := put("user-1", `{"role":"user"}`); code != http.StatusOK {
		t.Fatalf("role update = %d", code)
	}
	if rec := env.get(t, operator.Value, "/customers"); rec.Code != http.StatusOK {
		t.Fatalf("operator after role update = %d", rec.Code)
	}

	if code := put("user-1", `{"role":"user","password":"novaLozinka123"}`); code != http.StatusOK {
		t.Fatalf("password reset = %d", code)
	}
	if rec := env.get(t, operator.Value, "/customers"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("operator after password reset = %d, want 401", rec.Code)
	}

	// Own password: this session stays, the other device signs in again.
	if code := put("admin-1", `{"role":"admin","password":"novaLozinka123"}`); code != http.StatusOK {
		t.Fatalf("own password = %d", code)
	}
	if rec := env.get(t, adminCurrent.Value, "/customers"); rec.Code != http.StatusOK {
		t.Fatalf("current admin session after own reset = %d, want 200", rec.Code)
	}
	if rec := env.get(t, adminOther.Value, "/customers"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("other admin session after own reset = %d, want 401", rec.Code)
	}
}

func TestOriginGuard(t *testing.T) {
	env := newSessionTestEnv(t, sessionTestConfig)
	cookie := env.login(t, "admin", "admin123", false)
	post := func(server *Server, origin, host string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/customers", strings.NewReader(`{"name":"Origin test"}`))
		req.Header.Set("Content-Type", "application/json")
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		if host != "" {
			req.Host = host
		}
		req.AddCookie(cookie)
		rec := httptest.NewRecorder()
		server.Routes().ServeHTTP(rec, req)
		return rec
	}

	if rec := post(env.server, "https://evil.example", "iris-application.com"); rec.Code != http.StatusForbidden {
		t.Fatalf("cross-site POST = %d, want 403", rec.Code)
	}
	if rec := post(env.server, "null", "iris-application.com"); rec.Code != http.StatusForbidden {
		t.Fatalf("opaque-origin POST = %d, want 403", rec.Code)
	}
	// Same host through nginx: the browser says https, nginx forwards plain
	// http and drops the port from Host.
	if rec := post(env.server, "https://iris-application.com", "iris-application.com"); rec.Code == http.StatusForbidden {
		t.Fatalf("same-origin POST = %d", rec.Code)
	}
	if rec := post(env.server, "http://192.168.1.20:8081", "192.168.1.20"); rec.Code == http.StatusForbidden {
		t.Fatalf("same-host LAN POST = %d", rec.Code)
	}
	if rec := post(env.server, "", "iris-application.com"); rec.Code == http.StatusForbidden {
		t.Fatalf("POST without Origin = %d", rec.Code)
	}
	// Dev: the Vite server on another localhost port talks to the API directly.
	if rec := post(env.server, "http://localhost:5173", "localhost:8080"); rec.Code == http.StatusForbidden {
		t.Fatalf("dev localhost POST = %d", rec.Code)
	}
	// Cross-site sign-in (login CSRF) is refused too; GETs are never checked.
	req := loginRequest(t, "admin", "admin123", false)
	req.Header.Set("Origin", "https://evil.example")
	if rec := env.do(t, req); rec.Code != http.StatusForbidden {
		t.Fatalf("cross-site login = %d, want 403", rec.Code)
	}
	get := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	get.Header.Set("Origin", "https://evil.example")
	if rec := env.do(t, get); rec.Code != http.StatusOK || rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("cross-site GET = %d, ACAO %q", rec.Code, rec.Header().Get("Access-Control-Allow-Origin"))
	}

	// Production with no allow-list: localhost pages get neither CORS nor writes.
	production := sessionTestConfig
	production.Production = true
	prodServer := NewServer(env.store, production)
	if rec := post(prodServer, "http://localhost:5173", "iris-application.com"); rec.Code != http.StatusForbidden {
		t.Fatalf("production localhost POST = %d, want 403", rec.Code)
	}
	preflight := httptest.NewRequest(http.MethodOptions, "/customers", nil)
	preflight.Header.Set("Origin", "http://localhost:5173")
	preflight.Header.Set("Access-Control-Request-Method", http.MethodPost)
	rec := httptest.NewRecorder()
	prodServer.Routes().ServeHTTP(rec, preflight)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("production granted CORS to localhost: %q", got)
	}
	// An explicit allow-list entry still works in production.
	production.AllowedOrigins = []string{"https://ops.example"}
	if rec := post(NewServer(env.store, production), "https://ops.example", "api.example"); rec.Code == http.StatusForbidden {
		t.Fatalf("allow-listed origin POST = %d", rec.Code)
	}
}
