package api

import (
	"net/http"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/go-chi/chi/v5"
)

// handleEnumValues returns the built-in defaults merged with any admin-created
// custom values for the managed work-order picklists.
func (s *Server) handleEnumValues(w http.ResponseWriter, r *http.Request) {
	values, err := s.store.EnumValues(r.Context())
	if err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, values)
}

func (s *Server) handleCreateEnumValue(w http.ResponseWriter, r *http.Request) {
	var input domain.EnumValueInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	result, err := s.store.CreateEnumValue(r.Context(), input)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

func (s *Server) handleUpdateEnumValue(w http.ResponseWriter, r *http.Request) {
	var input domain.EnumValueInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	result, err := s.store.UpdateEnumValue(r.Context(), chi.URLParam(r, "id"), input)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	if result == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Vrednost nije pronađena."})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleDeleteEnumValue(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteEnumValue(r.Context(), chi.URLParam(r, "id")); err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}
