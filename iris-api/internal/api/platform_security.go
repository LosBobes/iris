package api

import (
	"bytes"
	"encoding/base64"
	"errors"
	"image/png"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
)

// Superadmin hardening (D-021): the two-factor step of the Backoffice sign-in,
// TOTP enrollment, and superadmin account management. Secrets, codes and
// challenge tokens are never logged.

const (
	platformInvalidCode      = "Neispravan kod. Pokušajte ponovo."
	platformChallengeExpired = "Prijava je istekla. Prijavite se ponovo."
	platformTooManyAttempts  = "Previše neuspešnih pokušaja. Pokušajte ponovo kasnije."
	platformAdminNotFound    = "Superadmin ne postoji."
)

// startPlatformSession signs the admin in: a new Backoffice session cookie,
// and last sign-in (method: password, totp, recovery).
func (s *Server) startPlatformSession(w http.ResponseWriter, r *http.Request, platform store.PlatformStore, admin *domain.PlatformAdmin, method string) {
	now := time.Now().UTC()
	expiresAt := now.Add(s.config.PlatformSessionDuration)
	token, err := platform.CreatePlatformSession(r.Context(), admin.ID, expiresAt)
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	if err := platform.RecordPlatformLogin(r.Context(), store.AuditActor{AdminID: admin.ID, AdminUsername: admin.Username, IP: clientIP(r)}, method, now); err != nil {
		// Never fails a sign-in that already succeeded.
		log.Printf("record platform login: %v", err)
	}
	log.Printf("platform login succeeded for %q (%s) from %s", admin.Username, method, clientIP(r))
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

// recordPlatformLoginFailure writes the failed attempt to the activity log; a
// failure to record is logged, never surfaced.
func (s *Server) recordPlatformLoginFailure(r *http.Request, platform store.PlatformStore, username, adminID, stage string) {
	if err := platform.RecordPlatformLoginFailure(r.Context(), username, adminID, clientIP(r), stage); err != nil {
		log.Printf("record platform login failure: %v", err)
	}
}

// handlePlatformLoginVerify is the second sign-in step for an account with
// two-factor sign-in: the challenge from the password step plus a TOTP code or
// an unused recovery code. Wrong codes are throttled per account and per IP.
func (s *Server) handlePlatformLoginVerify(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	var req domain.PlatformLoginVerifyRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	now := time.Now().UTC()
	adminID, err := platform.PlatformLoginChallengeAdmin(r.Context(), req.Challenge, now)
	if errors.Is(err, store.ErrPlatformChallengeInvalid) {
		writeJSON(w, http.StatusOK, domain.PlatformLoginResponse{Success: false, Error: platformChallengeExpired})
		return
	}
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	attempt, ok := s.platformLimiter.reserve(s.platformLimiter.keys("2fa:"+adminID, "ip:"+clientIP(r))...)
	if !ok {
		writeAPIError(w, r, http.StatusTooManyRequests, platformTooManyAttempts, nil)
		return
	}
	admin, method, err := platform.VerifyPlatformLoginChallenge(r.Context(), req.Challenge, req.Code, now)
	switch {
	case errors.Is(err, store.ErrInvalidTwoFactorCode):
		log.Printf("platform two-factor code rejected from %s", clientIP(r))
		s.recordPlatformLoginFailure(r, platform, "", adminID, "2fa")
		writeJSON(w, http.StatusOK, domain.PlatformLoginResponse{
			Success:           false,
			Error:             platformInvalidCode,
			TwoFactorRequired: true,
			Challenge:         req.Challenge,
		})
		return
	case errors.Is(err, store.ErrPlatformChallengeInvalid):
		attempt.cancel()
		writeJSON(w, http.StatusOK, domain.PlatformLoginResponse{Success: false, Error: platformChallengeExpired})
		return
	case err != nil:
		attempt.cancel()
		writeServerError(w, r, err)
		return
	}
	attempt.succeeded()
	s.startPlatformSession(w, r, platform, admin, method)
}

// handlePlatformTwoFactorSetup starts (or restarts) an enrollment: a new
// secret is kept as pending until confirmed with a code.
func (s *Server) handlePlatformTwoFactorSetup(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	admin := currentPlatformAdmin(r)
	if admin.TwoFactorEnabled {
		writeValidationError(w, r, "Dvofaktorska prijava je već uključena.")
		return
	}
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      store.TOTPIssuer,
		AccountName: admin.Username,
		Period:      store.TOTPPeriod,
		Digits:      otp.DigitsSix,
		Algorithm:   otp.AlgorithmSHA1,
	})
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	if err := platform.SetPlatformTOTPPending(r.Context(), admin.ID, key.Secret()); err != nil {
		writeStoreError(w, r, err)
		return
	}
	image, err := key.Image(240, 240)
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, image); err != nil {
		writeServerError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, domain.PlatformTwoFactorSetup{
		Secret:     key.Secret(),
		OtpauthURI: key.URL(),
		QRCode:     "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()),
	})
}

// handlePlatformTwoFactorConfirm finishes the enrollment with a code from the
// app and returns the recovery codes (shown once).
func (s *Server) handlePlatformTwoFactorConfirm(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	admin := currentPlatformAdmin(r)
	var req domain.PlatformTwoFactorConfirm
	if !decodeJSONBody(w, r, &req) {
		return
	}
	attempt, ok := s.platformLimiter.reserve(s.platformLimiter.keys("2fa-setup:"+admin.ID, "ip:"+clientIP(r))...)
	if !ok {
		writeAPIError(w, r, http.StatusTooManyRequests, platformTooManyAttempts, nil)
		return
	}
	codes, err := platform.EnablePlatformTOTP(r.Context(), auditActor(r), req.Code, time.Now().UTC())
	if errors.Is(err, store.ErrInvalidTwoFactorCode) {
		writeValidationError(w, r, platformInvalidCode)
		return
	}
	if err != nil {
		attempt.cancel()
		writeStoreError(w, r, err)
		return
	}
	attempt.succeeded()
	log.Printf("platform admin %q enabled two-factor sign-in", admin.Username)
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, domain.PlatformTwoFactorEnabled{RecoveryCodes: codes})
}

func (s *Server) handlePlatformAdmins(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	admins, err := platform.PlatformAdmins(r.Context())
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, admins)
}

func (s *Server) handlePlatformCreateAdmin(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	var input domain.PlatformCreateAdminInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	admin, err := platform.PlatformCreateAdmin(r.Context(), auditActor(r), input)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	log.Printf("platform admin %q created superadmin %q", currentPlatformAdmin(r).Username, admin.Username)
	writeJSON(w, http.StatusCreated, admin)
}

func (s *Server) handlePlatformSetAdminDisabled(disabled bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		platform, ok := s.platformStore()
		if !ok {
			http.NotFound(w, r)
			return
		}
		admin, err := platform.PlatformSetAdminDisabled(r.Context(), auditActor(r), chi.URLParam(r, "id"), disabled)
		if err != nil {
			writeStoreError(w, r, err)
			return
		}
		if admin == nil {
			writeAPIError(w, r, http.StatusNotFound, platformAdminNotFound, nil)
			return
		}
		verb := "enabled"
		if disabled {
			verb = "disabled"
		}
		log.Printf("platform admin %q %s superadmin %q", currentPlatformAdmin(r).Username, verb, admin.Username)
		writeJSON(w, http.StatusOK, admin)
	}
}

// normalizeImpersonationReason trims the reason and reports a Serbian
// validation message when it is missing or too long.
func normalizeImpersonationReason(reason string) (string, string) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return "", "Navedite razlog ulaska."
	}
	if len([]rune(reason)) > domain.MaxImpersonationReasonLength {
		return "", "Razlog može imati najviše 200 znakova."
	}
	return reason, ""
}
