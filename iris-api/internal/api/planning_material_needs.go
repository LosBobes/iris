package api

import (
	"net/http"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/store"
)

// handleMaterialNeeds answers GET /planning/material-needs?from&to (D-028):
// input material per week from the published plans' kept horizon against the
// stock. Behind both the planning and the stock module; open to every
// signed-in user, like the stock list and the forecast.
func (s *Server) handleMaterialNeeds(w http.ResponseWriter, r *http.Request) {
	needsStore, ok := s.store.(store.MaterialNeedsStore)
	if !ok {
		http.NotFound(w, r)
		return
	}
	query := r.URL.Query()
	from, to := strings.TrimSpace(query.Get("from")), strings.TrimSpace(query.Get("to"))
	for _, date := range []string{from, to} {
		if date != "" && !store.ValidPlanningDate(date) {
			writeAPIError(w, r, http.StatusBadRequest, invalidDateMessage, nil)
			return
		}
	}
	needs, err := needsStore.MaterialNeeds(r.Context(), from, to)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, needs)
}
