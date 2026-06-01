package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

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
	store  store.Store
	config Config
}

type Config struct {
	AllowedOrigins    []string
	SessionCookieName string
	SessionDuration   time.Duration
	SecureCookies     bool
	WebDir            string
}

func DefaultConfig() Config {
	return Config{
		SessionCookieName: "iris_session",
		SessionDuration:   12 * time.Hour,
	}
}

func NewServer(store store.Store, configs ...Config) *Server {
	config := DefaultConfig()
	if len(configs) > 0 {
		config = configs[0]
	}
	if config.SessionCookieName == "" {
		config.SessionCookieName = "iris_session"
	}
	if config.SessionDuration == 0 {
		config.SessionDuration = 12 * time.Hour
	}
	return &Server{store: store, config: config}
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
	r.Use(s.corsMiddleware)

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Post("/auth/login", s.handleLogin)
	r.Get("/auth/session", s.handleSession)
	r.Post("/auth/logout", s.handleLogout)
	r.Get("/public/work-orders/{token}", s.handlePublicWorkOrderStatus)

	r.Group(func(protected chi.Router) {
		protected.Use(s.requireAuth)
		protected.Get("/customers", s.handleCustomers)
		protected.Post("/customers", s.handleUpsertCustomer)
		protected.Put("/customers/{id}", s.handleUpsertCustomer)
		protected.Delete("/customers/{id}", s.requireAdmin(s.handleDeleteCustomer))
		protected.Get("/locations", s.handleLocations)
		protected.Post("/locations", s.handleUpsertLocation)
		protected.Put("/locations/{id}", s.handleUpsertLocation)
		protected.Delete("/locations/{id}", s.requireAdmin(s.handleDeleteLocation))
		protected.Get("/work-orders", s.handleWorkOrders)
		protected.Get("/work-orders/operators", s.handleOperators)
		protected.Get("/work-orders/{id}", s.handleWorkOrderByID)
		protected.Get("/work-orders/{id}/report", s.handleWorkOrderReport)
		protected.Post("/work-orders", s.handleCreateWorkOrder)
		protected.Patch("/work-orders/{id}", s.handleUpdateWorkOrder)
		protected.Delete("/work-orders/{id}", s.requireAdmin(s.handleDeleteWorkOrder))
	})

	if s.config.WebDir != "" {
		r.NotFound(s.handleWebFallback)
	}

	return r
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && s.isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) isAllowedOrigin(origin string) bool {
	for _, allowed := range s.config.AllowedOrigins {
		if origin == allowed {
			return true
		}
	}
	return len(s.config.AllowedOrigins) == 0 &&
		(strings.HasPrefix(origin, "http://localhost:") ||
			strings.HasPrefix(origin, "http://127.0.0.1:"))
}

type contextKey string

const currentUserContextKey contextKey = "currentUser"

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.serveWebIfHTML(w, r) {
			return
		}
		user, ok := s.userFromRequest(w, r)
		if !ok {
			return
		}
		ctx := context.WithValue(r.Context(), currentUserContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) requireAdmin(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := currentUser(r)
		if user == nil || user.Role != domain.RoleAdmin {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Nemate dozvolu za ovu akciju."})
			return
		}
		handler(w, r)
	}
}

func (s *Server) userFromRequest(w http.ResponseWriter, r *http.Request) (*domain.User, bool) {
	cookie, err := r.Cookie(s.config.SessionCookieName)
	if err != nil || cookie.Value == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Potrebna je prijava."})
		return nil, false
	}
	user, err := s.store.UserBySessionToken(r.Context(), cookie.Value)
	if err != nil {
		writeServerError(w, err)
		return nil, false
	}
	if user == nil {
		clearSessionCookie(w, s.config)
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Sesija je istekla."})
		return nil, false
	}
	return user, true
}

func currentUser(r *http.Request) *domain.User {
	user, _ := r.Context().Value(currentUserContextKey).(*domain.User)
	return user
}

func setSessionCookie(w http.ResponseWriter, config Config, token string, expiresAt time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     config.SessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   config.SecureCookies,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearSessionCookie(w http.ResponseWriter, config Config) {
	http.SetCookie(w, &http.Cookie{
		Name:     config.SessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   config.SecureCookies,
		SameSite: http.SameSiteLaxMode,
	})
}

// handleLogin decodes credentials and creates a secure HTTP-only session.
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req domain.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}

	user, err := s.store.AuthenticateUser(r.Context(), req.Username, req.Password)
	if err != nil {
		writeServerError(w, err)
		return
	}

	if user == nil {
		writeJSON(w, http.StatusOK, domain.LoginResponse{
			Success: false,
			Error:   "Neispravno korisničko ime ili lozinka.",
		})
		return
	}

	expiresAt := time.Now().UTC().Add(s.config.SessionDuration)
	token, err := s.store.CreateSession(r.Context(), user.ID, expiresAt)
	if err != nil {
		writeServerError(w, err)
		return
	}
	setSessionCookie(w, s.config, token, expiresAt)
	writeJSON(w, http.StatusOK, domain.LoginResponse{
		Success: true,
		User:    user,
	})
}

func (s *Server) handleSession(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(s.config.SessionCookieName)
	if err != nil || cookie.Value == "" {
		writeJSON(w, http.StatusOK, domain.LoginResponse{Success: false})
		return
	}
	user, err := s.store.UserBySessionToken(r.Context(), cookie.Value)
	if err != nil {
		writeServerError(w, err)
		return
	}
	if user == nil {
		clearSessionCookie(w, s.config)
		writeJSON(w, http.StatusOK, domain.LoginResponse{Success: false})
		return
	}
	writeJSON(w, http.StatusOK, domain.LoginResponse{Success: true, User: user})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(s.config.SessionCookieName); err == nil && cookie.Value != "" {
		if err := s.store.DeleteSession(r.Context(), cookie.Value); err != nil {
			writeServerError(w, err)
			return
		}
	}
	clearSessionCookie(w, s.config)
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *Server) handleCustomers(w http.ResponseWriter, r *http.Request) {
	customers, err := s.store.Customers(r.Context())
	if err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, customers)
}

func (s *Server) handleLocations(w http.ResponseWriter, r *http.Request) {
	locations, err := s.store.Locations(r.Context())
	if err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, locations)
}

func (s *Server) handleUpsertCustomer(w http.ResponseWriter, r *http.Request) {
	var customer domain.Customer
	if err := json.NewDecoder(r.Body).Decode(&customer); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}
	if id := chi.URLParam(r, "id"); id != "" {
		customer.ID = id
	}
	result, err := s.store.UpsertCustomer(r.Context(), customer)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleUpsertLocation(w http.ResponseWriter, r *http.Request) {
	var location domain.Location
	if err := json.NewDecoder(r.Body).Decode(&location); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}
	if id := chi.URLParam(r, "id"); id != "" {
		location.ID = id
	}
	result, err := s.store.UpsertLocation(r.Context(), location)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleDeleteCustomer(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteCustomer(r.Context(), chi.URLParam(r, "id")); err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *Server) handleDeleteLocation(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteLocation(r.Context(), chi.URLParam(r, "id")); err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *Server) handleWorkOrders(w http.ResponseWriter, r *http.Request) {
	if s.serveWebIfHTML(w, r) {
		return
	}
	result, err := s.store.WorkOrders(r.Context(), parseWorkOrderListQuery(r))
	if err != nil {
		writeServerError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func parseWorkOrderListQuery(r *http.Request) store.WorkOrderListQuery {
	values := r.URL.Query()
	limit, _ := strconv.Atoi(values.Get("limit"))
	offset, _ := strconv.Atoi(values.Get("offset"))
	if limit < 0 {
		limit = 0
	}
	if offset < 0 {
		offset = 0
	}
	return store.WorkOrderListQuery{
		Search:     values.Get("search"),
		Status:     domain.WorkOrderStatus(values.Get("status")),
		AssignedTo: values.Get("assignedTo"),
		DateFrom:   values.Get("dateFrom"),
		DateTo:     values.Get("dateTo"),
		Limit:      limit,
		Offset:     offset,
		Sort:       values.Get("sort"),
	}
}

// handleOperators derives the unique operator list from the work-order data.
func (s *Server) handleOperators(w http.ResponseWriter, r *http.Request) {
	operators, err := s.store.Operators(r.Context())
	if err != nil {
		writeServerError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, operators)
}

// handleWorkOrderByID returns a single work order or 404 when it does not exist.
func (s *Server) handleWorkOrderByID(w http.ResponseWriter, r *http.Request) {
	if s.serveWebIfHTML(w, r) {
		return
	}
	workOrder, err := s.store.WorkOrderByID(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeServerError(w, err)
		return
	}

	if workOrder == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Radni nalog nije pronađen."})
		return
	}

	writeJSON(w, http.StatusOK, workOrder)
}

// handleCreateWorkOrder creates a new in-memory work order backed by the shared fixtures.
func (s *Server) handleCreateWorkOrder(w http.ResponseWriter, r *http.Request) {
	var req domain.CreateWorkOrderInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}

	workOrder, err := s.store.CreateWorkOrder(r.Context(), req)
	if err != nil {
		writeStoreError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, workOrder)
}

// handleUpdateWorkOrder applies a partial update and preserves 404 -> null semantics for desktop callers.
func (s *Server) handleUpdateWorkOrder(w http.ResponseWriter, r *http.Request) {
	var req domain.UpdateWorkOrderInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}

	workOrder, err := s.store.UpdateWorkOrder(r.Context(), chi.URLParam(r, "id"), req)
	if err != nil {
		writeStoreError(w, err)
		return
	}

	if workOrder == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Radni nalog nije pronađen."})
		return
	}

	writeJSON(w, http.StatusOK, workOrder)
}

// handleDeleteWorkOrder keeps delete/not-found as a business response shape.
func (s *Server) handleDeleteWorkOrder(w http.ResponseWriter, r *http.Request) {
	result, err := s.store.DeleteWorkOrder(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeServerError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleWorkOrderReport(w http.ResponseWriter, r *http.Request) {
	workOrder, err := s.store.WorkOrderByID(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeServerError(w, err)
		return
	}
	if workOrder == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Radni nalog nije pronađen."})
		return
	}

	filename := fmt.Sprintf("%s.pdf", workOrder.OrderNumber)
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(buildWorkOrderPDF(*workOrder))
}

func (s *Server) handlePublicWorkOrderStatus(w http.ResponseWriter, r *http.Request) {
	if s.serveWebIfHTML(w, r) {
		return
	}
	result, err := s.store.WorkOrders(r.Context(), store.WorkOrderListQuery{})
	if err != nil {
		writeServerError(w, err)
		return
	}

	token := chi.URLParam(r, "token")
	for _, workOrder := range result.Items {
		if workOrder.Communication.PublicToken != token {
			continue
		}
		writeJSON(w, http.StatusOK, domain.PublicWorkOrderStatus{
			OrderNumber:       workOrder.OrderNumber,
			ClientName:        workOrder.ClientName,
			JobDescription:    workOrder.JobDescription,
			Status:            workOrder.Status,
			DueDate:           workOrder.DueDate,
			CustomerNoteCount: len(workOrder.CustomerNotes),
			InternalNoteCount: 0,
			SignedBy:          workOrder.Communication.SignedBy,
			SignedAt:          workOrder.Communication.SignedAt,
		})
		return
	}

	writeJSON(w, http.StatusNotFound, map[string]string{"error": "Radni nalog nije pronađen."})
}

func buildWorkOrderPDF(workOrder domain.WorkOrder) []byte {
	lines := []string{
		"Iris radni nalog",
		workOrder.OrderNumber,
		workOrder.ClientName,
		workOrder.JobDescription,
		fmt.Sprintf("Status: %s", workOrder.Status),
	}
	content := "BT /F1 12 Tf 72 760 Td "
	for index, line := range lines {
		if index > 0 {
			content += "0 -18 Td "
		}
		content += fmt.Sprintf("(%s) Tj ", escapePDFText(line))
	}
	content += "ET"

	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
		fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(content), content),
	}

	var builder strings.Builder
	builder.WriteString("%PDF-1.4\n")
	offsets := make([]int, 0, len(objects)+1)
	offsets = append(offsets, 0)
	for index, object := range objects {
		offsets = append(offsets, builder.Len())
		builder.WriteString(fmt.Sprintf("%d 0 obj\n%s\nendobj\n", index+1, object))
	}
	xrefOffset := builder.Len()
	builder.WriteString(fmt.Sprintf("xref\n0 %d\n0000000000 65535 f \n", len(objects)+1))
	for _, offset := range offsets[1:] {
		builder.WriteString(fmt.Sprintf("%010d 00000 n \n", offset))
	}
	builder.WriteString(fmt.Sprintf("trailer\n<< /Root 1 0 R /Size %d >>\nstartxref\n%d\n%%%%EOF\n", len(objects)+1, xrefOffset))
	return []byte(builder.String())
}

func escapePDFText(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, "(", `\(`)
	value = strings.ReplaceAll(value, ")", `\)`)
	return value
}

func (s *Server) serveWebIfHTML(w http.ResponseWriter, r *http.Request) bool {
	if s.config.WebDir == "" || !wantsHTML(r) {
		return false
	}
	s.handleWebFallback(w, r)
	return true
}

func wantsHTML(r *http.Request) bool {
	return r.Method == http.MethodGet && strings.Contains(r.Header.Get("Accept"), "text/html")
}

func (s *Server) handleWebFallback(w http.ResponseWriter, r *http.Request) {
	if s.config.WebDir == "" {
		http.NotFound(w, r)
		return
	}

	cleanPath := filepath.Clean(strings.TrimPrefix(r.URL.Path, "/"))
	if cleanPath == "." {
		cleanPath = "index.html"
	}
	filePath := filepath.Join(s.config.WebDir, cleanPath)
	if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
		http.ServeFile(w, r, filePath)
		return
	}
	http.ServeFile(w, r, filepath.Join(s.config.WebDir, "index.html"))
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

func writeStoreError(w http.ResponseWriter, err error) {
	var validationErr *store.ValidationError
	if errors.As(err, &validationErr) {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": validationErr.Error()})
		return
	}

	writeServerError(w, err)
}
