package api

import (
	"net/http"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

// Workstation load ("Zauzetost", D-028): GET /planning/load. Everyone with the
// planning module may read it; plan=draft (today's draft instead of today's
// published plan) is for admins.

const invalidLoadPlanMessage = "Parametar „plan“ može biti samo „draft“."

func (s *Server) handlePlanningLoad(w http.ResponseWriter, r *http.Request, _ store.PlanningStore) {
	loads, ok := s.store.(store.PlanningLoadStore)
	if !ok {
		http.NotFound(w, r)
		return
	}
	values := r.URL.Query()
	query := store.LoadQuery{From: strings.TrimSpace(values.Get("from")), To: strings.TrimSpace(values.Get("to"))}
	for _, date := range []string{query.From, query.To} {
		if date != "" && !store.ValidPlanningDate(date) {
			writeAPIError(w, r, http.StatusBadRequest, invalidDateMessage, nil)
			return
		}
	}
	switch strings.TrimSpace(values.Get("plan")) {
	case "", string(domain.LoadSourcePublished):
	case string(domain.LoadSourceDraft):
		if currentUser(r).Role != domain.RoleAdmin {
			writeAPIError(w, r, http.StatusForbidden, "Nemate dozvolu za ovu akciju.", nil)
			return
		}
		query.Draft = true
	default:
		writeAPIError(w, r, http.StatusBadRequest, invalidLoadPlanMessage, nil)
		return
	}
	load, err := loads.PlanningLoad(r.Context(), query)
	if err != nil {
		writePlanningError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, load)
}
