package api

import (
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// Impersonation lets a Backoffice superadmin act as any organization user. It
// issues an ordinary iris_session cookie (so the organization app and every
// tenant-scoped check work unchanged) for a short, audited session marked with
// the superadmin's name. Every change request made in it is traced to the
// impersonation (serveTraced). It is not counted as a login, and signing out
// of the organization app or the Backoffice ends it.

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
	reason, problem := normalizeImpersonationReason(req.Reason)
	if problem != "" {
		writeValidationError(w, r, problem)
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
		Reason:        reason,
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
	// Persistent for its fixed hour (impersonation sessions never slide).
	setSessionCookie(w, s.config, token, expiresAt, true)
	writeJSON(w, http.StatusOK, domain.PlatformImpersonationResponse{
		Success:   true,
		User:      user,
		OrgSlug:   tenant.Slug,
		ExpiresAt: expiresAt.Format(time.RFC3339),
	})
}

// serveTraced serves a request made in an impersonated session and, for a
// change request (anything but GET/HEAD/OPTIONS), records it in the
// impersonation's trail: route, path, outcome and time. Bodies are never kept.
// A failure to record is logged, never surfaced to the request.
func (s *Server) serveTraced(w http.ResponseWriter, r *http.Request, next http.Handler, impersonationID int64) {
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		next.ServeHTTP(w, r)
		return
	}
	platform, ok := s.platformStore()
	if !ok {
		next.ServeHTTP(w, r)
		return
	}
	at := time.Now().UTC()
	recorder := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
	next.ServeHTTP(recorder, r)
	route := r.URL.Path
	if rctx := chi.RouteContext(r.Context()); rctx != nil && rctx.RoutePattern() != "" {
		route = rctx.RoutePattern()
	}
	// The edit form renews its lock every 30 s; that heartbeat would bury the
	// actual changes.
	if route == "/work-orders/{id}/edit-lock" {
		return
	}
	status := recorder.Status()
	if status == 0 {
		status = http.StatusOK
	}
	if err := platform.RecordImpersonationAction(r.Context(), impersonationID, domain.PlatformImpersonationAction{
		At:     at.Format(time.RFC3339),
		Method: r.Method,
		Route:  route,
		Path:   r.URL.Path,
		Status: status,
	}); err != nil {
		log.Printf("record impersonation action: %v", err)
	}
}

func (s *Server) handlePlatformImpersonationActions(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeAPIError(w, r, http.StatusNotFound, "Impersonacija ne postoji.", nil)
		return
	}
	actions, found, err := platform.ImpersonationActions(r.Context(), id)
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	if !found {
		writeAPIError(w, r, http.StatusNotFound, "Impersonacija ne postoji.", nil)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, actions)
}
