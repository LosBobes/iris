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
	"github.com/pquerna/otp/totp"
)

// signInPlatform signs in with a password only (no two-factor) and returns the
// session cookie.
func signInPlatform(t *testing.T, server *Server, username, password string) *http.Cookie {
	t.Helper()
	rec := platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login",
		`{"username":"`+username+`","password":"`+password+`"}`)
	cookie := platformCookie(rec, server.config.PlatformSessionCookieName)
	if cookie == nil {
		t.Fatalf("login %s = %s", username, rec.Body.String())
	}
	return cookie
}

// enrollPlatformTwoFactor turns on two-factor sign-in for the session's
// account (mandatory before any operator route) and returns the TOTP secret.
// The session stays signed in.
func enrollPlatformTwoFactor(t *testing.T, server *Server, cookie *http.Cookie) string {
	t.Helper()
	rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/auth/2fa/setup", "")
	var setup domain.PlatformTwoFactorSetup
	if err := json.Unmarshal(rec.Body.Bytes(), &setup); err != nil || rec.Code != http.StatusOK {
		t.Fatalf("2fa setup = %d %s", rec.Code, rec.Body.String())
	}
	code, err := totp.GenerateCode(setup.Secret, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/auth/2fa/confirm", `{"code":"`+code+`"}`); rec.Code != http.StatusOK {
		t.Fatalf("2fa confirm = %d %s", rec.Code, rec.Body.String())
	}
	return setup.Secret
}

func platformAudit(t *testing.T, server *Server, cookie *http.Cookie) []domain.PlatformAuditEvent {
	t.Helper()
	rec := platformRequest(t, server, cookie, http.MethodGet, "/platform/audit?limit=200", "")
	var log domain.PlatformAuditLog
	if err := json.Unmarshal(rec.Body.Bytes(), &log); err != nil || rec.Code != http.StatusOK {
		t.Fatalf("audit = %d %s", rec.Code, rec.Body.String())
	}
	return log.Items
}

func auditActionCounts(events []domain.PlatformAuditEvent) map[string]int {
	counts := map[string]int{}
	for _, event := range events {
		counts[event.Action]++
	}
	return counts
}

func TestPlatformTwoFactorEnrollmentAndSignIn(t *testing.T) {
	server, _, _ := newServerWithRoles(t)
	platform := server.store.(store.PlatformStore)
	if err := platform.UpsertPlatformAdmin(context.Background(), "ops", "correct-horse-battery"); err != nil {
		t.Fatal(err)
	}
	cookie := signInPlatform(t, server, "ops", "correct-horse-battery")

	// Confirming before starting is refused.
	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/auth/2fa/confirm", `{"code":"123456"}`); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("confirm without setup = %d", rec.Code)
	}
	rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/auth/2fa/setup", "")
	var setup domain.PlatformTwoFactorSetup
	if err := json.Unmarshal(rec.Body.Bytes(), &setup); err != nil || rec.Code != http.StatusOK {
		t.Fatalf("setup = %d %s", rec.Code, rec.Body.String())
	}
	if setup.Secret == "" || !strings.HasPrefix(setup.OtpauthURI, "otpauth://totp/") ||
		!strings.Contains(setup.OtpauthURI, "ops") || !strings.HasPrefix(setup.QRCode, "data:image/png;base64,") {
		t.Fatalf("setup = %+v", setup)
	}
	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/auth/2fa/confirm", `{"code":"000000"}`); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("confirm with wrong code = %d", rec.Code)
	}
	now := time.Now()
	code, _ := totp.GenerateCode(setup.Secret, now)
	rec = platformRequest(t, server, cookie, http.MethodPost, "/platform/auth/2fa/confirm", `{"code":"`+code+`"}`)
	var enabled domain.PlatformTwoFactorEnabled
	if err := json.Unmarshal(rec.Body.Bytes(), &enabled); err != nil || rec.Code != http.StatusOK || len(enabled.RecoveryCodes) != store.RecoveryCodeCount {
		t.Fatalf("confirm = %d %s", rec.Code, rec.Body.String())
	}
	if res := decodePlatformLogin(t, platformRequest(t, server, cookie, http.MethodGet, "/platform/auth/session", "")); !res.Admin.TwoFactorEnabled {
		t.Fatalf("session after enrollment = %+v", res.Admin)
	}
	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/auth/2fa/setup", ""); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("setup when already enabled = %d", rec.Code)
	}

	// The password alone no longer opens a session.
	login := func() string {
		t.Helper()
		rec := platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login", `{"username":"ops","password":"correct-horse-battery"}`)
		res := decodePlatformLogin(t, rec)
		if res.Success || !res.TwoFactorRequired || res.Challenge == "" || platformCookie(rec, server.config.PlatformSessionCookieName) != nil {
			t.Fatalf("password step = %s", rec.Body.String())
		}
		return res.Challenge
	}
	verify := func(challenge, code string) *httptest.ResponseRecorder {
		return platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login/verify",
			`{"challenge":"`+challenge+`","code":"`+code+`"}`)
	}

	challenge := login()
	if res := decodePlatformLogin(t, verify("not-a-challenge", "123456")); res.Success || res.TwoFactorRequired || res.Error != platformChallengeExpired {
		t.Fatalf("unknown challenge = %+v", res)
	}
	// The code used for enrollment cannot be replayed.
	if res := decodePlatformLogin(t, verify(challenge, code)); res.Success || !res.TwoFactorRequired || res.Error != platformInvalidCode {
		t.Fatalf("replayed enrollment code = %+v", res)
	}
	next, _ := totp.GenerateCode(setup.Secret, now.Add(30*time.Second))
	rec = verify(challenge, next)
	if res := decodePlatformLogin(t, rec); !res.Success || res.Admin == nil || res.Admin.Username != "ops" {
		t.Fatalf("verify = %s", rec.Body.String())
	}
	if platformCookie(rec, server.config.PlatformSessionCookieName) == nil {
		t.Fatal("verify set no session cookie")
	}
	// A challenge is spent once, and a code works once.
	if res := decodePlatformLogin(t, verify(challenge, next)); res.Success || res.Error != platformChallengeExpired {
		t.Fatalf("reused challenge = %+v", res)
	}
	if res := decodePlatformLogin(t, verify(login(), next)); res.Success {
		t.Fatal("replayed TOTP code accepted")
	}

	// A recovery code (any case, with or without the dash) works exactly once.
	recovery := strings.ToUpper(strings.ReplaceAll(enabled.RecoveryCodes[0], "-", ""))
	if res := decodePlatformLogin(t, verify(login(), recovery)); !res.Success {
		t.Fatalf("recovery code = %+v", res)
	}
	if res := decodePlatformLogin(t, verify(login(), enabled.RecoveryCodes[0])); res.Success {
		t.Fatal("recovery code accepted twice")
	}

	counts := auditActionCounts(platformAudit(t, server, cookie))
	if counts[domain.AuditAdminTwoFactorOn] != 1 || counts[domain.AuditAdminRecoveryLogin] != 1 || counts[domain.AuditAdminLoginFailed] != 3 {
		t.Fatalf("audit = %v", counts)
	}
}

func TestPlatformTwoFactorCodesAreThrottled(t *testing.T) {
	server, _, _ := newServerWithRoles(t)
	platform := server.store.(store.PlatformStore)
	ctx := context.Background()
	if err := platform.UpsertPlatformAdmin(ctx, "ops", "correct-horse-battery"); err != nil {
		t.Fatal(err)
	}
	cookie := signInPlatform(t, server, "ops", "correct-horse-battery")
	var setup domain.PlatformTwoFactorSetup
	_ = json.Unmarshal(platformRequest(t, server, cookie, http.MethodPost, "/platform/auth/2fa/setup", "").Body.Bytes(), &setup)
	code, _ := totp.GenerateCode(setup.Secret, time.Now())
	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/auth/2fa/confirm", `{"code":"`+code+`"}`); rec.Code != http.StatusOK {
		t.Fatalf("confirm = %d", rec.Code)
	}

	res := decodePlatformLogin(t, platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login", `{"username":"ops","password":"correct-horse-battery"}`))
	for i := 0; i < 5; i++ {
		rec := platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login/verify", `{"challenge":"`+res.Challenge+`","code":"000000"}`)
		if rec.Code != http.StatusOK || decodePlatformLogin(t, rec).Success {
			t.Fatalf("wrong code %d = %d %s", i, rec.Code, rec.Body.String())
		}
	}
	// Locked out, even with the right code.
	good, _ := totp.GenerateCode(setup.Secret, time.Now().Add(30*time.Second))
	if rec := platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login/verify", `{"challenge":"`+res.Challenge+`","code":"`+good+`"}`); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("sixth attempt = %d, want 429", rec.Code)
	}
}

func TestPlatformAdminManagement(t *testing.T) {
	server, _, _ := newServerWithRoles(t)
	platform := server.store.(store.PlatformStore)
	if err := platform.UpsertPlatformAdmin(context.Background(), "ops", "correct-horse-battery"); err != nil {
		t.Fatal(err)
	}
	cookie := signInPlatform(t, server, "ops", "correct-horse-battery")
	enrollPlatformTwoFactor(t, server, cookie)

	// A failed password sign-in is audited, with the username as typed.
	platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login", `{"username":"nobody","password":"guess-guess-guess"}`)

	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/admins", `{"username":"ana","password":"short"}`); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("short password = %d", rec.Code)
	}
	rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/admins", `{"username":"ana","password":"privremena-lozinka"}`)
	var created domain.PlatformAdminSummary
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil || rec.Code != http.StatusCreated ||
		created.Username != "ana" || !created.MustChangePassword || created.DisabledAt != nil || created.TwoFactorEnabled {
		t.Fatalf("create = %d %s", rec.Code, rec.Body.String())
	}
	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/admins", `{"username":"ANA","password":"privremena-lozinka"}`); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("duplicate = %d", rec.Code)
	}

	// The new account must change its temporary password before anything else.
	anaCookie := signInPlatform(t, server, "ana", "privremena-lozinka")
	if rec := platformRequest(t, server, anaCookie, http.MethodGet, "/platform/admins", ""); rec.Code != http.StatusForbidden {
		t.Fatalf("admins before password change = %d, want 403", rec.Code)
	}

	rec = platformRequest(t, server, cookie, http.MethodGet, "/platform/admins", "")
	var admins []domain.PlatformAdminSummary
	if err := json.Unmarshal(rec.Body.Bytes(), &admins); err != nil || rec.Code != http.StatusOK {
		t.Fatalf("list = %d %s", rec.Code, rec.Body.String())
	}
	byName := map[string]domain.PlatformAdminSummary{}
	for _, admin := range admins {
		byName[admin.Username] = admin
	}
	if byName["ops"].LastLoginAt == nil || byName["ana"].LastLoginAt == nil || byName["ana"].CreatedAt == "" {
		t.Fatalf("admins = %+v", admins)
	}
	opsID := byName["ops"].ID

	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/admins/"+opsID+"/disable", ""); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("disable self = %d, want 422", rec.Code)
	}
	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/admins/missing/disable", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("disable unknown = %d, want 404", rec.Code)
	}
	rec = platformRequest(t, server, cookie, http.MethodPost, "/platform/admins/"+created.ID+"/disable", "")
	var disabled domain.PlatformAdminSummary
	if err := json.Unmarshal(rec.Body.Bytes(), &disabled); err != nil || rec.Code != http.StatusOK || disabled.DisabledAt == nil {
		t.Fatalf("disable = %d %s", rec.Code, rec.Body.String())
	}
	// Its session ended, and it cannot sign in.
	if res := decodePlatformLogin(t, platformRequest(t, server, anaCookie, http.MethodGet, "/platform/auth/session", "")); res.Success {
		t.Fatal("disabled admin's session survived")
	}
	if res := decodePlatformLogin(t, platformRequest(t, server, nil, http.MethodPost, "/platform/auth/login", `{"username":"ana","password":"privremena-lozinka"}`)); res.Success || res.Error != platformInvalidCredentials {
		t.Fatalf("disabled login = %+v", res)
	}

	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/admins/"+created.ID+"/enable", ""); rec.Code != http.StatusOK {
		t.Fatalf("enable = %d", rec.Code)
	}
	signInPlatform(t, server, "ana", "privremena-lozinka")

	events := platformAudit(t, server, cookie)
	counts := auditActionCounts(events)
	if counts[domain.AuditAdminCreate] != 1 || counts[domain.AuditAdminDisable] != 1 || counts[domain.AuditAdminEnable] != 1 || counts[domain.AuditAdminLoginFailed] != 2 {
		t.Fatalf("audit = %v", counts)
	}
	for _, event := range events {
		if event.Action == domain.AuditAdminDisable && (event.AdminUsername != "ops" || event.TargetUsername != "ana") {
			t.Fatalf("disable event = %+v", event)
		}
		if event.Action == domain.AuditAdminLoginFailed && event.AdminUsername == "nobody" && event.Detail["stage"] != "password" {
			t.Fatalf("failed login event = %+v", event)
		}
	}
}
