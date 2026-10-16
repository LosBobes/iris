package api

import (
	"bytes"
	"context"
	"net/http"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
	"github.com/go-chi/chi/v5"
)

// handlePublicOrganization lets the sign-in screen validate an organization
// slug before asking for credentials, and learn the name and logo to show.
// It deliberately exposes nothing beyond what that screen displays.
func (s *Server) handlePublicOrganization(w http.ResponseWriter, r *http.Request) {
	if s.serveWebIfHTML(w, r) {
		return
	}
	tenant, ok := s.publicTenant(w, r)
	if !ok {
		return
	}
	logo, err := s.store.LoginLogo(store.ContextWithTenant(r.Context(), tenant.ID))
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	org := domain.PublicOrganization{Slug: tenant.Slug, Name: tenant.Name}
	if logo != nil {
		version := store.LoginLogoVersion(logo)
		org.LogoVersion = &version
	}
	writeJSON(w, http.StatusOK, org)
}

// handlePublicOrganizationLogo serves an organization's sign-in logo.
func (s *Server) handlePublicOrganizationLogo(w http.ResponseWriter, r *http.Request) {
	tenant, ok := s.publicTenant(w, r)
	if !ok {
		return
	}
	s.serveLoginLogo(w, r, store.ContextWithTenant(r.Context(), tenant.ID))
}

// handleLoginLogo serves the signed-in tenant's logo, for the Settings preview.
func (s *Server) handleLoginLogo(w http.ResponseWriter, r *http.Request) {
	if s.serveWebIfHTML(w, r) {
		return
	}
	s.serveLoginLogo(w, r, r.Context())
}

// handleUpdateLoginLogo replaces the tenant's sign-in logo. Admin only.
func (s *Server) handleUpdateLoginLogo(w http.ResponseWriter, r *http.Request) {
	var upload domain.LoginLogoUpload
	if !decodeJSONBody(w, r, &upload) {
		return
	}
	logo, err := s.store.SetLoginLogo(r.Context(), upload)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, domain.LoginLogoInfo{LogoVersion: store.LoginLogoVersion(logo)})
}

// handleDeleteLoginLogo removes the tenant's sign-in logo. Admin only.
func (s *Server) handleDeleteLoginLogo(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteLoginLogo(r.Context()); err != nil {
		writeServerError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) publicTenant(w http.ResponseWriter, r *http.Request) (*domain.Tenant, bool) {
	tenant, err := s.store.TenantBySlug(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		writeServerError(w, r, err)
		return nil, false
	}
	if tenant == nil {
		writeAPIError(w, r, http.StatusNotFound, "Organizacija nije pronađena.", nil)
		return nil, false
	}
	return tenant, true
}

func (s *Server) serveLoginLogo(w http.ResponseWriter, r *http.Request, ctx context.Context) {
	logo, err := s.store.LoginLogo(ctx)
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	if logo == nil {
		writeAPIError(w, r, http.StatusNotFound, "Logotip nije postavljen.", nil)
		return
	}
	header := w.Header()
	header.Set("Content-Type", logo.ContentType)
	// The bytes are an image an admin uploaded; never let a browser reinterpret
	// them as anything else, or run anything if the URL is opened directly.
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Content-Security-Policy", "default-src 'none'")
	// Clients put the version in the URL, but the path itself is stable, so
	// revalidate rather than cache blindly; the ETag makes that a cheap 304.
	header.Set("Cache-Control", "no-cache")
	header.Set("ETag", `"`+store.LoginLogoVersion(logo)+`"`)
	http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(logo.Data))
}
