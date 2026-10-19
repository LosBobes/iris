package api

import (
	"net/http"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/store"
)

// handlePlanningCalibration answers GET /planning/calibration?from&to (admins,
// D-028): a malformed date is 400; an inverted or too long window is 422 from
// the store.
func (s *Server) handlePlanningCalibration(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	query := r.URL.Query()
	from, to := strings.TrimSpace(query.Get("from")), strings.TrimSpace(query.Get("to"))
	for _, date := range []string{from, to} {
		if date != "" && !store.ValidPlanningDate(date) {
			writeAPIError(w, r, http.StatusBadRequest, invalidDateMessage, nil)
			return
		}
	}
	report, err := planning.PlanningCalibration(r.Context(), from, to)
	if err != nil {
		writePlanningError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, report)
}
