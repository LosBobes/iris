package api

import (
	"net/http"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// handleSettings returns the shop-wide organization settings (firm name). Any
// authenticated user may read it because the firm name is shown in the app
// branding for everyone.
func (s *Server) handleSettings(w http.ResponseWriter, r *http.Request) {
	if s.serveWebIfHTML(w, r) {
		return
	}
	settings, err := s.store.OrganizationSettings(r.Context())
	if err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

// handleUpdateSettings persists changes to the organization settings. Gated to
// admins by requireAdmin at the route.
func (s *Server) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var input domain.OrganizationSettings
	if !decodeJSONBody(w, r, &input) {
		return
	}
	settings, err := s.store.UpdateOrganizationSettings(r.Context(), input)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, settings)
}
