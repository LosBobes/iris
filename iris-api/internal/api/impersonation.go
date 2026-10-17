package api

import (
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
	"github.com/go-chi/chi/v5"
)

// Impersonation lets a Backoffice superadmin act as any organization user. It
// issues an ordinary iris_session cookie (so the organization app and every
// tenant-scoped check work unchanged) for a short, audited session marked with
// the superadmin's name. It is not counted as a login, and signing out of the
// organization app or the Backoffice ends it.

func (s *Server) handlePlatformTenantUsers(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	result, err := platform.PlatformTenantUsers(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	if result == nil {
		writeAPIError(w, r, http.StatusNotFound, "Organizacija ne postoji.", nil)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handlePlatformImpersonate(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	admin := currentPlatformAdmin(r)
	var req domain.PlatformImpersonationRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.UserID) == "" {
		writeValidationError(w, r, "Izaberite korisnika.")
		return
	}
	tenant, err := s.store.TenantBySlug(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	if tenant == nil {
		writeAPIError(w, r, http.StatusNotFound, "Organizacija ne postoji.", nil)
		return
	}
	expiresAt := time.Now().UTC().Add(s.config.ImpersonationDuration)
	token, user, err := platform.CreateImpersonationSession(r.Context(), store.ImpersonationInput{
		AdminID:       admin.ID,
		AdminUsername: admin.Username,
		TenantID:      tenant.ID,
		UserID:        req.UserID,
		IP:            clientIP(r),
		ExpiresAt:     expiresAt,
	})
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	if user == nil {
		writeAPIError(w, r, http.StatusNotFound, "Korisnik ne postoji u ovoj organizaciji.", nil)
		return
	}
	log.Printf("platform admin %q impersonated %q in %q from %s", admin.Username, user.Username, tenant.Slug, clientIP(r))
	setSessionCookie(w, s.config, token, expiresAt)
	writeJSON(w, http.StatusOK, domain.PlatformImpersonationResponse{
		Success:   true,
		User:      user,
		OrgSlug:   tenant.Slug,
		ExpiresAt: expiresAt.Format(time.RFC3339),
	})
}
