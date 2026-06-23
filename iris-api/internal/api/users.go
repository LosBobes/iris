package api

import (
	"net/http"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/go-chi/chi/v5"
)

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	if s.serveWebIfHTML(w, r) {
		return
	}
	users, err := s.store.ListUsers(r.Context())
	if err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	var input domain.CreateUserInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	user, err := s.store.CreateUserAccount(r.Context(), input)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, user)
}

func (s *Server) handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var input domain.UpdateUserInput
	if !decodeJSONBody(w, r, &input) {
		return
	}

	// Don't let the last administrator demote themselves out of admin access.
	target, err := s.store.UserByID(r.Context(), id)
	if err != nil {
		writeServerError(w, err)
		return
	}
	if target == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Korisnik nije pronađen."})
		return
	}
	if target.Role == domain.RoleAdmin && input.Role != domain.RoleAdmin {
		lastAdmin, err := s.isLastAdmin(r, id)
		if err != nil {
			writeServerError(w, err)
			return
		}
		if lastAdmin {
			writeValidationError(w, "Mora postojati bar jedan administrator.")
			return
		}
	}

	user, err := s.store.UpdateUserAccount(r.Context(), id, input)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	if user == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Korisnik nije pronađen."})
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	if current := currentUser(r); current != nil && current.ID == id {
		writeValidationError(w, "Ne možete obrisati sopstveni nalog.")
		return
	}

	target, err := s.store.UserByID(r.Context(), id)
	if err != nil {
		writeServerError(w, err)
		return
	}
	if target == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Korisnik nije pronađen."})
		return
	}
	if target.Role == domain.RoleAdmin {
		lastAdmin, err := s.isLastAdmin(r, id)
		if err != nil {
			writeServerError(w, err)
			return
		}
		if lastAdmin {
			writeValidationError(w, "Mora postojati bar jedan administrator.")
			return
		}
	}

	if err := s.store.DeleteUser(r.Context(), id); err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// isLastAdmin reports whether the account with the given id is the only admin.
func (s *Server) isLastAdmin(r *http.Request, id string) (bool, error) {
	users, err := s.store.ListUsers(r.Context())
	if err != nil {
		return false, err
	}
	admins := 0
	targetIsAdmin := false
	for _, user := range users {
		if user.Role != domain.RoleAdmin {
			continue
		}
		admins++
		if user.ID == id {
			targetIsAdmin = true
		}
	}
	return targetIsAdmin && admins <= 1, nil
}
