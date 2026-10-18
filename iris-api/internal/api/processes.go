package api

import (
	"errors"
	"log"
	"net/http"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
	"github.com/go-chi/chi/v5"
)

// Process templates (tenant admins, and Backoffice for any organization) and
// each work order's own process graph. Graph validation lives in the store.

const (
	processTemplateNotFoundMessage = "Proces nije pronađen."
	workOrderNotFoundMessage       = "Radni nalog nije pronađen."
	workOrderNoProcessMessage      = "Radni nalog nema proces."
	workOrderHasProcessMessage     = "Radni nalog već ima proces."
	processStructureLockedMessage  = "Samo administrator može menjati strukturu procesa."
)

// writeProcessError maps the process sentinel errors to their HTTP answers and
// leaves everything else to writeStoreError.
func writeProcessError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, store.ErrProcessTemplateNotFound):
		writeAPIError(w, r, http.StatusNotFound, processTemplateNotFoundMessage, nil)
	case errors.Is(err, store.ErrWorkOrderNotFound):
		writeAPIError(w, r, http.StatusNotFound, workOrderNotFoundMessage, nil)
	case errors.Is(err, store.ErrProcessNotFound):
		writeAPIError(w, r, http.StatusNotFound, workOrderNoProcessMessage, nil)
	case errors.Is(err, store.ErrTenantNotFound):
		writeAPIError(w, r, http.StatusNotFound, tenantNotFoundMessage, nil)
	case errors.Is(err, store.ErrProcessExists):
		writeAPIError(w, r, http.StatusConflict, workOrderHasProcessMessage, nil)
	case errors.Is(err, store.ErrProcessStructureLocked):
		writeAPIError(w, r, http.StatusForbidden, processStructureLockedMessage, nil)
	default:
		writeStoreError(w, r, err)
	}
}

func (s *Server) handleProcessTemplates(w http.ResponseWriter, r *http.Request) {
	templates, err := s.store.ProcessTemplates(r.Context())
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, templates)
}

func (s *Server) handleProcessTemplateByID(w http.ResponseWriter, r *http.Request) {
	template, err := s.store.ProcessTemplateByID(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	if template == nil {
		writeAPIError(w, r, http.StatusNotFound, processTemplateNotFoundMessage, nil)
		return
	}
	writeJSON(w, http.StatusOK, template)
}

func (s *Server) handleCreateProcessTemplate(w http.ResponseWriter, r *http.Request) {
	var input domain.ProcessTemplateInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	template, err := s.store.CreateProcessTemplate(r.Context(), input)
	if err != nil {
		writeProcessError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, template)
}

func (s *Server) handleUpdateProcessTemplate(w http.ResponseWriter, r *http.Request) {
	var input domain.ProcessTemplateInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	template, err := s.store.UpdateProcessTemplate(r.Context(), chi.URLParam(r, "id"), input)
	if err != nil {
		writeProcessError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, template)
}

func (s *Server) handleDeleteProcessTemplate(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteProcessTemplate(r.Context(), chi.URLParam(r, "id")); err != nil {
		writeProcessError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleWorkOrderProcess(w http.ResponseWriter, r *http.Request) {
	process, err := s.store.WorkOrderProcess(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	if process == nil {
		writeAPIError(w, r, http.StatusNotFound, workOrderNoProcessMessage, nil)
		return
	}
	writeJSON(w, http.StatusOK, process)
}

func (s *Server) handleApplyProcessTemplate(w http.ResponseWriter, r *http.Request) {
	var input domain.ApplyProcessTemplateInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	if input.TemplateID == "" {
		writeValidationError(w, r, "Izaberite proces.")
		return
	}
	process, err := s.store.ApplyProcessTemplate(r.Context(), chi.URLParam(r, "id"), input.TemplateID, currentUser(r).Username)
	if err != nil {
		writeProcessError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, process)
}

func (s *Server) handleUpdateWorkOrderProcess(w http.ResponseWriter, r *http.Request) {
	var input domain.WorkOrderProcessInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	user := currentUser(r)
	process, err := s.store.UpdateWorkOrderProcess(
		r.Context(), chi.URLParam(r, "id"), input.Graph, user.Username, user.Role == domain.RoleAdmin,
	)
	if err != nil {
		writeProcessError(w, r, err)
		return
	}
	if process == nil {
		writeAPIError(w, r, http.StatusNotFound, workOrderNoProcessMessage, nil)
		return
	}
	writeJSON(w, http.StatusOK, process)
}

func (s *Server) handleDeleteWorkOrderProcess(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteWorkOrderProcess(r.Context(), chi.URLParam(r, "id")); err != nil {
		writeProcessError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handlePlatformProcessTemplates(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	templates, err := platform.PlatformProcessTemplates(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		writeProcessError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, templates)
}

func (s *Server) handlePlatformCreateProcessTemplate(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	var input domain.ProcessTemplateInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	slug := chi.URLParam(r, "slug")
	template, err := platform.PlatformCreateProcessTemplate(r.Context(), auditActor(r), slug, input)
	if err != nil {
		writeProcessError(w, r, err)
		return
	}
	log.Printf("platform admin %q created process template %q in %q", currentPlatformAdmin(r).Username, template.Name, slug)
	writeJSON(w, http.StatusCreated, template)
}

func (s *Server) handlePlatformUpdateProcessTemplate(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	var input domain.ProcessTemplateInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	slug := chi.URLParam(r, "slug")
	template, err := platform.PlatformUpdateProcessTemplate(r.Context(), auditActor(r), slug, chi.URLParam(r, "id"), input)
	if err != nil {
		writeProcessError(w, r, err)
		return
	}
	log.Printf("platform admin %q updated process template %q in %q", currentPlatformAdmin(r).Username, template.Name, slug)
	writeJSON(w, http.StatusOK, template)
}

func (s *Server) handlePlatformDeleteProcessTemplate(w http.ResponseWriter, r *http.Request) {
	platform, ok := s.platformStore()
	if !ok {
		http.NotFound(w, r)
		return
	}
	slug := chi.URLParam(r, "slug")
	if err := platform.PlatformDeleteProcessTemplate(r.Context(), auditActor(r), slug, chi.URLParam(r, "id")); err != nil {
		writeProcessError(w, r, err)
		return
	}
	log.Printf("platform admin %q deleted process template %q in %q", currentPlatformAdmin(r).Username, chi.URLParam(r, "id"), slug)
	w.WriteHeader(http.StatusNoContent)
}
