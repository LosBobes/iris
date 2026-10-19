package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
	"github.com/go-chi/chi/v5"
)

// Production planning ("Planiranje", D-026): machine types and units, worker
// qualifications, working hours and day plans (attendance is its own module,
// see attendance.go). Everything sits
// behind the planning module; reads are open to every signed-in user (except
// the draft plan, which is admin-only) and writes are admin-only. All rules
// live in the store (internal/store/planning*.go) and the planner.

const (
	machineTypeNameTakenMessage    = "Tip mašine sa tim nazivom već postoji."
	machineTypeInUseMessage        = "Tip mašine se koristi za mašine."
	machineNotFoundMessage         = "Mašina nije pronađena."
	machineNameTakenMessage        = "Mašina sa tim nazivom već postoji."
	machineDowntimeNotFoundMessage = "Zastoj mašine nije pronađen."
	planningUserNotFoundMessage    = "Korisnik nije pronađen."
	planDraftNotFoundMessage       = "Nacrt plana nije pronađen."
	invalidDateMessage             = "Neispravan datum."
)

// planningStore returns the store's planning side; a store without it (the
// fixture store) has no such routes.
func (s *Server) planningStore() (store.PlanningStore, bool) {
	planning, ok := s.store.(store.PlanningStore)
	return planning, ok
}

// writePlanningError maps the planning sentinel errors to their HTTP answers
// and leaves everything else to writeStoreError.
func writePlanningError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, store.ErrMachineTypeNotFound):
		writeAPIError(w, r, http.StatusNotFound, store.MachineTypeNotFoundMessage, nil)
	case errors.Is(err, store.ErrMachineTypeNameTaken):
		writeAPIError(w, r, http.StatusConflict, machineTypeNameTakenMessage, nil)
	case errors.Is(err, store.ErrMachineTypeInUse):
		writeAPIError(w, r, http.StatusConflict, machineTypeInUseMessage, nil)
	case errors.Is(err, store.ErrMachineNotFound):
		writeAPIError(w, r, http.StatusNotFound, machineNotFoundMessage, nil)
	case errors.Is(err, store.ErrMachineNameTaken):
		writeAPIError(w, r, http.StatusConflict, machineNameTakenMessage, nil)
	case errors.Is(err, store.ErrMachineDowntimeNotFound):
		writeAPIError(w, r, http.StatusNotFound, machineDowntimeNotFoundMessage, nil)
	case errors.Is(err, store.ErrPlanningUserNotFound):
		writeAPIError(w, r, http.StatusNotFound, planningUserNotFoundMessage, nil)
	case errors.Is(err, store.ErrPlanDraftNotFound):
		writeAPIError(w, r, http.StatusNotFound, planDraftNotFoundMessage, nil)
	default:
		writeStoreError(w, r, err)
	}
}

// planningHandler resolves the planning store once per request.
func (s *Server) planningHandler(handle func(w http.ResponseWriter, r *http.Request, planning store.PlanningStore)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		planning, ok := s.planningStore()
		if !ok {
			http.NotFound(w, r)
			return
		}
		handle(w, r, planning)
	}
}

// queryDate reads the optional ?date=; a malformed one answers 400.
func queryDate(w http.ResponseWriter, r *http.Request) (string, bool) {
	date := strings.TrimSpace(r.URL.Query().Get("date"))
	if date != "" && !store.ValidPlanningDate(date) {
		writeAPIError(w, r, http.StatusBadRequest, invalidDateMessage, nil)
		return "", false
	}
	return date, true
}

func (s *Server) handleMachineTypes(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	types, err := planning.MachineTypes(r.Context())
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, types)
}

func (s *Server) handleCreateMachineType(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	var input domain.MachineTypeInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	machineType, err := planning.CreateMachineType(r.Context(), input)
	if err != nil {
		writePlanningError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, machineType)
}

func (s *Server) handleUpdateMachineType(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	var input domain.MachineTypeInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	machineType, err := planning.UpdateMachineType(r.Context(), chi.URLParam(r, "id"), input)
	if err != nil {
		writePlanningError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, machineType)
}

func (s *Server) handleDeleteMachineType(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	if err := planning.DeleteMachineType(r.Context(), chi.URLParam(r, "id")); err != nil {
		writePlanningError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMachines(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	machines, err := planning.Machines(r.Context())
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, machines)
}

func (s *Server) handleCreateMachine(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	var input domain.MachineInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	machine, err := planning.CreateMachine(r.Context(), input)
	if err != nil {
		writePlanningError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, machine)
}

func (s *Server) handleUpdateMachine(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	var input domain.MachineInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	machine, err := planning.UpdateMachine(r.Context(), chi.URLParam(r, "id"), input)
	if err != nil {
		writePlanningError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, machine)
}

func (s *Server) handleDeleteMachine(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	if err := planning.DeleteMachine(r.Context(), chi.URLParam(r, "id")); err != nil {
		writePlanningError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Machine downtime windows (D-028): listed per machine, added and removed by
// admins; the planner treats them as busy time.

func (s *Server) handleMachineDowntimes(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	downtimes, err := planning.MachineDowntimes(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writePlanningError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, downtimes)
}

func (s *Server) handleCreateMachineDowntime(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	var input domain.MachineDowntimeInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	downtime, err := planning.CreateMachineDowntime(r.Context(), chi.URLParam(r, "id"), input)
	if err != nil {
		writePlanningError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, downtime)
}

func (s *Server) handleDeleteMachineDowntime(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	if err := planning.DeleteMachineDowntime(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "downtimeId")); err != nil {
		writePlanningError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleQualifications(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	qualifications, err := planning.Qualifications(r.Context())
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, qualifications)
}

func (s *Server) handleSetQualifications(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	var input domain.WorkerQualificationsInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	qualifications, err := planning.SetQualifications(r.Context(), chi.URLParam(r, "userId"), input)
	if err != nil {
		writePlanningError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, qualifications)
}

func (s *Server) handleWorkingHours(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	hours, err := planning.WorkingHours(r.Context())
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, hours)
}

func (s *Server) handleSetWorkingHours(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	var input domain.WorkingHours
	if !decodeJSONBody(w, r, &input) {
		return
	}
	hours, err := planning.SetWorkingHours(r.Context(), input)
	if err != nil {
		writePlanningError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, hours)
}

func (s *Server) handlePlanDay(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	date, ok := queryDate(w, r)
	if !ok {
		return
	}
	// The draft is the admin's working copy; operators only see what is published.
	day, err := planning.PlanDay(r.Context(), date, currentUser(r).Role == domain.RoleAdmin)
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, day)
}

func (s *Server) handleGeneratePlan(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	var input domain.PlanGenerateInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	plan, err := planning.GeneratePlan(r.Context(), input, currentUser(r).Username)
	if err != nil {
		writePlanningError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, plan)
}

func (s *Server) handleSavePlanDraft(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	var input domain.PlanDraftInput
	// Up to domain.MaxPlanAssignments blocks must fit, so the cap is larger.
	if !decodeJSONBodyLimit(w, r, &input, maxPlanDraftBodyBytes) {
		return
	}
	plan, err := planning.SavePlanDraft(r.Context(), input, currentUser(r).Username)
	if err != nil {
		writePlanningError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, plan)
}

func (s *Server) handleDiscardPlanDraft(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	date, ok := queryDate(w, r)
	if !ok {
		return
	}
	if err := planning.DiscardPlanDraft(r.Context(), date); err != nil {
		writePlanningError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handlePublishPlan(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	var input domain.PlanPublishInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	plan, err := planning.PublishPlan(r.Context(), input, currentUser(r).Username)
	if err != nil {
		writePlanningError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, plan)
}

func (s *Server) handleMyQueue(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	date, ok := queryDate(w, r)
	if !ok {
		return
	}
	queue, err := planning.MyQueue(r.Context(), currentUser(r).ID, date)
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, queue)
}

func (s *Server) handlePlanningForecast(w http.ResponseWriter, r *http.Request, planning store.PlanningStore) {
	forecast, err := planning.Forecast(r.Context())
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, forecast)
}

// maxPlanDraftBodyBytes fits a draft of domain.MaxPlanAssignments blocks
// (a few hundred bytes each); other routes keep maxJSONBodyBytes.
const maxPlanDraftBodyBytes = 4 << 20
