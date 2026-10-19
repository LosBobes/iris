package api

import (
	"log"
	"net/http"
	"strconv"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
	"github.com/go-chi/chi/v5"
)

// Backoffice organization management. Every operation is written to the
// activity log (platform_audit_events) by the store, in the same transaction.

// tenantSuspendedMessage answers sign-ins and sessions of a suspended
// organization.
const tenantSuspendedMessage = "Organizacija je suspendovana. Obratite se podršci."

const tenantNotFoundMessage = "Organizacija ne postoji."

func auditActor(r *http.Request) store.AuditActor {
	admin := currentPlatformAdmin(r)
	return store.AuditActor{AdminID: admin.ID, AdminUsername: admin.Username, IP: clientIP(r)}
}

func (s *Server) handlePlatformTenants(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	tenants, err := platform.PlatformTenants(r.Context())
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, tenants)
}

func (s *Server) handlePlatformCreateTenant(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	var input domain.PlatformCreateTenantInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	tenant, err := platform.PlatformCreateTenant(r.Context(), auditActor(r), input)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	log.Printf("platform admin %q created organization %q", currentPlatformAdmin(r).Username, tenant.Slug)
	writeJSON(w, http.StatusCreated, tenant)
}

func (s *Server) handlePlatformUpdateTenant(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	var input domain.PlatformUpdateTenantInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	tenant, err := platform.PlatformUpdateTenant(r.Context(), auditActor(r), chi.URLParam(r, "slug"), input)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	if tenant == nil {
		writeAPIError(w, r, http.StatusNotFound, tenantNotFoundMessage, nil)
		return
	}
	writeJSON(w, http.StatusOK, tenant)
}

func (s *Server) handlePlatformSuspendTenant(suspended bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		platform, ok := s.platformStore()
		if !ok {
			http.NotFound(w, r)
			return
		}
		tenant, err := platform.PlatformSetTenantSuspended(r.Context(), auditActor(r), chi.URLParam(r, "slug"), suspended)
		if err != nil {
			writeStoreError(w, r, err)
			return
		}
		if tenant == nil {
			writeAPIError(w, r, http.StatusNotFound, tenantNotFoundMessage, nil)
			return
		}
		log.Printf("platform admin %q set organization %q suspended=%t", currentPlatformAdmin(r).Username, tenant.Slug, suspended)
		writeJSON(w, http.StatusOK, tenant)
	}
}

// handlePlatformSetTenantModules switches an organization's optional modules.
// Tenant admins cannot do this; only a superadmin, and the change is audited.
func (s *Server) handlePlatformSetTenantModules(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	var input domain.OrganizationModules
	if !decodeJSONBody(w, r, &input) {
		return
	}
	slug := chi.URLParam(r, "slug")
	tenant, err := platform.PlatformSetTenantModules(r.Context(), auditActor(r), slug, input)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	if tenant == nil {
		writeAPIError(w, r, http.StatusNotFound, tenantNotFoundMessage, nil)
		return
	}
	log.Printf("platform admin %q set modules of organization %q: processes=%t stock=%t planning=%t",
		currentPlatformAdmin(r).Username, tenant.Slug, input.Processes, input.Stock, input.Planning)
	writeJSON(w, http.StatusOK, tenant)
}

// handlePlatformSetTenantNotes replaces the superadmins' internal notes about
// an organization (contact, plan, free text). The organization never sees them.
func (s *Server) handlePlatformSetTenantNotes(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	var input domain.PlatformTenantNotesInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	tenant, err := platform.PlatformSetTenantNotes(r.Context(), auditActor(r), chi.URLParam(r, "slug"), input)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	if tenant == nil {
		writeAPIError(w, r, http.StatusNotFound, tenantNotFoundMessage, nil)
		return
	}
	writeJSON(w, http.StatusOK, tenant)
}

func (s *Server) handlePlatformResetPassword(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	var input domain.PlatformPasswordReset
	if !decodeJSONBody(w, r, &input) {
		return
	}
	user, err := platform.PlatformResetUserPassword(r.Context(), auditActor(r), chi.URLParam(r, "slug"), chi.URLParam(r, "id"), input.Password)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	if user == nil {
		writeAPIError(w, r, http.StatusNotFound, "Korisnik ne postoji u ovoj organizaciji.", nil)
		return
	}
	log.Printf("platform admin %q reset the password of %q in %q", currentPlatformAdmin(r).Username, user.Username, chi.URLParam(r, "slug"))
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) handlePlatformAudit(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}
	result, err := platform.PlatformAuditLog(r.Context(), limit, offset)
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, result)
}
