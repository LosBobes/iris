package api

import (
	"encoding/json"
	"net/http"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type Server struct {
	store *store.FixtureStore
}

func NewServer(store *store.FixtureStore) *Server {
	return &Server{store: store}
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Post("/auth/login", s.handleLogin)
	r.Get("/work-orders", s.handleWorkOrders)
	r.Get("/work-orders/operators", s.handleOperators)

	return r
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req domain.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}

	users, err := s.store.Users()
	if err != nil {
		writeServerError(w, err)
		return
	}

	for _, user := range users {
		if user.Username == req.Username && user.Password == req.Password {
			writeJSON(w, http.StatusOK, domain.LoginResponse{
				Success: true,
				User: &domain.User{
					ID:       user.ID,
					Username: user.Username,
					Role:     user.Role,
				},
			})
			return
		}
	}

	writeJSON(w, http.StatusOK, domain.LoginResponse{
		Success: false,
		Error:   "Neispravno korisničko ime ili lozinka.",
	})
}

func (s *Server) handleWorkOrders(w http.ResponseWriter, _ *http.Request) {
	workOrders, err := s.store.WorkOrders()
	if err != nil {
		writeServerError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, workOrders)
}

func (s *Server) handleOperators(w http.ResponseWriter, _ *http.Request) {
	operators, err := s.store.Operators()
	if err != nil {
		writeServerError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, operators)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeServerError(w http.ResponseWriter, err error) {
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
}