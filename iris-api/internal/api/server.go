package api

import (
	"encoding/json"
	"net/http"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// Server owns the HTTP layer for the Iris API.
//
// When reading this file, use this mental model:
// 1. Routes() defines the public HTTP surface.
// 2. Each handle... function implements one endpoint.
// 3. Handlers delegate data access to the store package.
// 4. writeJSON and writeServerError are small shared response helpers.
type Server struct {
	store *store.FixtureStore
}

func NewServer(store *store.FixtureStore) *Server {
	return &Server{store: store}
}

// Routes builds the router once and returns it as an http.Handler.
//
// Chi is used only for routing and middleware. The actual business logic stays
// in the handler methods below.
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

// handleLogin decodes credentials, loads fixture users, and returns a login
// response in the same shape the desktop application already expects.
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

// handleWorkOrders returns the full work-order collection from the store.
func (s *Server) handleWorkOrders(w http.ResponseWriter, _ *http.Request) {
	workOrders, err := s.store.WorkOrders()
	if err != nil {
		writeServerError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, workOrders)
}

// handleOperators derives the unique operator list from the work-order data.
func (s *Server) handleOperators(w http.ResponseWriter, _ *http.Request) {
	operators, err := s.store.Operators()
	if err != nil {
		writeServerError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, operators)
}

// writeJSON centralizes response encoding so handlers stay focused on control
// flow and data retrieval instead of repeated serialization code.
func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// writeServerError keeps internal failures in one response shape.
func writeServerError(w http.ResponseWriter, err error) {
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
}
