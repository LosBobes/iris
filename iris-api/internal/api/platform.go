package api

import (
	"errors"
	"log"
	"net"
	"net/http"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

// Backoffice (the "platform" routes). These sit outside every organization:
// a platform admin is a separate account in platform_admins, created only from
// the server with `irisctl create-platform-admin`, with its own cookie and a
// short session. None exist by default, so on a fresh install every login here
// fails. The only data they reach is the aggregate metrics in
// store.PlatformMetrics.

const (
	platformInvalidCredentials     = "Neispravno korisničko ime ili lozinka."
	platformPasswordChangeRequired = "Promenite lozinku pre nastavka."
)

var platformRangeDays = map[int]bool{7: true, 30: true, 90: true, 365: true}

func (s *Server) platformStore() (store.PlatformStore, bool) {
	platform, ok := s.store.(store.PlatformStore)
	return platform, ok
}

func clientIP(r *http.Request) string {
	// RemoteAddr has already been rewritten by chi's RealIP middleware.
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

func (s *Server) handlePlatformLogin(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	var req domain.PlatformLoginRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	keys := []string{
		"ip:" + clientIP(r),
		"user:" + strings.ToLower(strings.TrimSpace(req.Username)),
	}
	if !s.platformLimiter.allow(keys...) {
		writeAPIError(w, r, http.StatusTooManyRequests, "Previše neuspešnih pokušaja. Pokušajte ponovo kasnije.", nil)
		return
	}

	admin, err := platform.AuthenticatePlatformAdmin(r.Context(), req.Username, req.Password)
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	if admin == nil {
		s.platformLimiter.fail(keys...)
		log.Printf("platform login failed from %s", clientIP(r))
		writeJSON(w, http.StatusOK, domain.PlatformLoginResponse{Success: false, Error: platformInvalidCredentials})
		return
	}
	s.platformLimiter.succeed(keys...)

	expiresAt := time.Now().UTC().Add(s.config.PlatformSessionDuration)
	token, err := platform.CreatePlatformSession(r.Context(), admin.ID, expiresAt)
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	log.Printf("platform login succeeded for %q from %s", admin.Username, clientIP(r))
	http.SetCookie(w, &http.Cookie{
		Name:     s.config.PlatformSessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   s.config.SecureCookies,
		SameSite: http.SameSiteStrictMode,
	})
	writeJSON(w, http.StatusOK, domain.PlatformLoginResponse{Success: true, Admin: admin})
}

func (s *Server) platformAdminFromRequest(r *http.Request) (*domain.PlatformAdmin, error) {
	platform, ok := s.platformStore()
	if !ok {
		return nil, nil
	}
	cookie, err := r.Cookie(s.config.PlatformSessionCookieName)
	if err != nil || cookie.Value == "" {
		return nil, nil
	}
	return platform.PlatformAdminBySession(r.Context(), cookie.Value)
}

func (s *Server) handlePlatformSession(w http.ResponseWriter, r *http.Request) {
	if s.serveWebIfHTML(w, r) {
		return
	}
	admin, err := s.platformAdminFromRequest(r)
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, domain.PlatformLoginResponse{Success: admin != nil, Admin: admin})
}

func (s *Server) handlePlatformLogout(w http.ResponseWriter, r *http.Request) {
	if platform, ok := s.platformStore(); ok {
		if cookie, err := r.Cookie(s.config.PlatformSessionCookieName); err == nil && cookie.Value != "" {
			if err := platform.DeletePlatformSession(r.Context(), cookie.Value); err != nil {
				writeServerError(w, r, err)
				return
			}
		}
	}
	http.SetCookie(w, &http.Cookie{
		Name:     s.config.PlatformSessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.config.SecureCookies,
		SameSite: http.SameSiteStrictMode,
	})
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// handlePlatformChangePassword lets a signed-in operator replace their
// password. It is the one action open to an account that must change it.
func (s *Server) handlePlatformChangePassword(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	admin, err := s.platformAdminFromRequest(r)
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	if admin == nil {
		writeAPIError(w, r, http.StatusUnauthorized, "Prijava je obavezna.", nil)
		return
	}
	var req domain.PlatformPasswordChange
	if !decodeJSONBody(w, r, &req) {
		return
	}
	// Guessing the current password through this form is throttled like login.
	keys := []string{"password:" + admin.ID, "ip:" + clientIP(r)}
	if !s.platformLimiter.allow(keys...) {
		writeAPIError(w, r, http.StatusTooManyRequests, "Previše neuspešnih pokušaja. Pokušajte ponovo kasnije.", nil)
		return
	}
	cookie, _ := r.Cookie(s.config.PlatformSessionCookieName)
	err = platform.ChangePlatformAdminPassword(r.Context(), admin.ID, cookie.Value, req.CurrentPassword, req.NewPassword)
	if errors.Is(err, store.ErrWrongPassword) {
		s.platformLimiter.fail(keys...)
		writeValidationError(w, r, "Trenutna lozinka nije ispravna.")
		return
	}
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	s.platformLimiter.succeed(keys...)
	log.Printf("platform password changed for %q from %s", admin.Username, clientIP(r))
	admin.MustChangePassword = false
	writeJSON(w, http.StatusOK, domain.PlatformLoginResponse{Success: true, Admin: admin})
}

// requirePlatformAdmin guards operator routes. A tenant session (iris_session)
// is never accepted here, whatever its role.
func (s *Server) requirePlatformAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		admin, err := s.platformAdminFromRequest(r)
		if err != nil {
			writeServerError(w, r, err)
			return
		}
		if admin == nil {
			writeAPIError(w, r, http.StatusUnauthorized, "Prijava je obavezna.", nil)
			return
		}
		if admin.Role != domain.PlatformRoleSuperadmin {
			writeAPIError(w, r, http.StatusForbidden, "Nemate pristup Backoffice-u.", nil)
			return
		}
		// The seeded default account opens nothing until its password changes.
		if admin.MustChangePassword {
			writeAPIError(w, r, http.StatusForbidden, platformPasswordChangeRequired, nil)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handlePlatformMetrics(w http.ResponseWriter, r *http.Request) {
	if s.serveWebIfHTML(w, r) {
		return
	}
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	rangeDays := 30
	if raw := r.URL.Query().Get("days"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || !platformRangeDays[parsed] {
			writeAPIError(w, r, http.StatusBadRequest, "Period mora biti 7, 30, 90 ili 365 dana.", nil)
			return
		}
		rangeDays = parsed
	}
	now := time.Now().UTC()
	metrics, err := platform.PlatformMetrics(r.Context(), now, rangeDays)
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	metrics.System = domain.PlatformSystem{
		Release:       s.config.Release,
		GoVersion:     runtime.Version(),
		StartedAt:     s.startedAt.UTC().Format(time.RFC3339),
		UptimeSeconds: int64(now.Sub(s.startedAt).Seconds()),
		Goroutines:    runtime.NumGoroutine(),
		HeapBytes:     mem.HeapAlloc,
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, metrics)
}

// recordLogin feeds the operator dashboard's login counts. It never blocks or
// fails a sign-in.
func (s *Server) recordLogin(r *http.Request, user *domain.User) {
	platform, ok := s.platformStore()
	if !ok {
		return
	}
	if err := platform.RecordLogin(r.Context(), user.TenantID, user.ID, time.Now()); err != nil {
		log.Printf("record login: %v", err)
	}
}
