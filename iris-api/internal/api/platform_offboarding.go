package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/go-chi/chi/v5"
)

// Organization offboarding: a full data export (a downloaded JSON file) and
// the guarded deletion of a suspended organization. Both are written to the
// activity log by the store, in the same transaction.

func (s *Server) handlePlatformExportTenant(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	export, err := platform.PlatformExportTenant(r.Context(), auditActor(r), chi.URLParam(r, "slug"))
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	if export == nil {
		writeAPIError(w, r, http.StatusNotFound, tenantNotFoundMessage, nil)
		return
	}
	log.Printf("platform admin %q exported organization %q (%d rows)", currentPlatformAdmin(r).Username, export.Tenant.Slug, export.TotalRows)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, TenantExportFileName(export.Tenant.Slug, time.Now())))
	w.WriteHeader(http.StatusOK)
	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(export); err != nil {
		log.Printf("write organization export %q: %v", export.Tenant.Slug, err)
	}
}

// TenantExportFileName is the download name of an organization export. The
// slug is restricted to [a-z0-9-], so it needs no escaping in the header.
func TenantExportFileName(slug string, at time.Time) string {
	return fmt.Sprintf("iris-%s-%s.json", slug, at.UTC().Format("20060102-150405"))
}

func (s *Server) handlePlatformDeleteTenant(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	var input domain.PlatformDeleteTenantInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	deletion, err := platform.PlatformDeleteTenant(r.Context(), auditActor(r), chi.URLParam(r, "slug"), input.ConfirmSlug)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	if deletion == nil {
		writeAPIError(w, r, http.StatusNotFound, tenantNotFoundMessage, nil)
		return
	}
	log.Printf("platform admin %q deleted organization %q (%d rows)", currentPlatformAdmin(r).Username, deletion.Slug, deletion.TotalRows)
	writeJSON(w, http.StatusOK, deletion)
}
