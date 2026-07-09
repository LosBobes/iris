package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/reports"
	"github.com/LosBobes/iris/iris-api/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	sentryhttp "github.com/getsentry/sentry-go/http"
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
	// Report panics to Sentry, then re-panic so chi's Recoverer still writes
	// the 500. This is a no-op when Sentry was not initialized (no DSN), so it
	// is always safe to register. Must sit inside Recoverer so it sees the
	// panic before Recoverer swallows it.
	r.Use(sentryhttp.New(sentryhttp.Options{Repanic: true}).Handle)
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
		protected.Get("/customers/{id}", s.handleCustomerByID)
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
		protected.Post("/work-orders/preview", s.handleWorkOrderPreview)
		protected.Post("/work-orders/reserve-number", s.handleReserveOrderNumber)
		protected.Post("/work-orders/release-number", s.handleReleaseOrderNumber)
		protected.Post("/work-orders", s.handleCreateWorkOrder)
		protected.Post("/work-orders/{id}/edit-lock", s.handleAcquireEditLock)
		protected.Delete("/work-orders/{id}/edit-lock", s.handleReleaseEditLock)
		protected.Patch("/work-orders/{id}", s.handleUpdateWorkOrder)
		protected.Delete("/work-orders/{id}", s.requireAdmin(s.handleDeleteWorkOrder))
		protected.Get("/enum-values", s.handleEnumValues)
		protected.Post("/enum-values", s.requireAdmin(s.handleCreateEnumValue))
		protected.Put("/enum-values/{id}", s.requireAdmin(s.handleUpdateEnumValue))
		protected.Delete("/enum-values/{id}", s.requireAdmin(s.handleDeleteEnumValue))
		protected.Get("/catalog-items", s.handleCatalogItems)
		protected.Get("/catalog-items/{id}", s.handleCatalogItemByID)
		protected.Get("/catalog-items/{id}/cost-history", s.requireAdmin(s.handleCatalogItemCostHistory))
		protected.Post("/catalog-items", s.requireAdmin(s.handleUpsertCatalogItem))
		protected.Put("/catalog-items/{id}", s.requireAdmin(s.handleUpsertCatalogItem))
		protected.Delete("/catalog-items/{id}", s.requireAdmin(s.handleDeleteCatalogItem))
		protected.Get("/settings", s.handleSettings)
		protected.Put("/settings", s.requireAdmin(s.handleUpdateSettings))
		protected.Get("/users", s.requireAdmin(s.handleListUsers))
		protected.Post("/users", s.requireAdmin(s.handleCreateUser))
		protected.Put("/users/{id}", s.requireAdmin(s.handleUpdateUser))
		protected.Delete("/users/{id}", s.requireAdmin(s.handleDeleteUser))
	})

	if s.config.WebDir != "" {
		r.NotFound(s.handleWebFallback)
	}

	return r
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Vary must be sent on every response so caches never reuse a
		// response produced for one origin to answer another.
		w.Header().Add("Vary", "Origin")
		origin := r.Header.Get("Origin")
		if origin != "" && s.isAllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
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
	if len(s.config.AllowedOrigins) == 0 {
		return isLocalhostOrigin(origin)
	}
	// When a dev allowlist includes any localhost origin, permit other local
	// Vite ports (e.g. 5174 when 5173 is already listed).
	if isLocalhostOrigin(origin) {
		for _, allowed := range s.config.AllowedOrigins {
			if isLocalhostOrigin(allowed) {
				return true
			}
		}
	}
	return false
}

func isLocalhostOrigin(origin string) bool {
	return strings.HasPrefix(origin, "http://localhost:") ||
		strings.HasPrefix(origin, "http://127.0.0.1:")
}

type contextKey string

const currentUserContextKey contextKey = "currentUser"

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := s.userFromRequest(w, r)
		if !ok {
			return
		}
		// Attach both the user (for role checks) and the tenant (which scopes every
		// store query) to the request context.
		ctx := context.WithValue(r.Context(), currentUserContextKey, user)
		ctx = store.ContextWithTenant(ctx, user.TenantID)
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
	if !decodeJSONBody(w, r, &req) {
		return
	}

	// Resolve the organization first. A missing or unknown org yields the same
	// generic error as bad credentials, so the form never reveals which orgs exist.
	const invalidCredentials = "Neispravna organizacija, korisničko ime ili lozinka."
	tenant, err := s.store.TenantBySlug(r.Context(), req.OrgSlug)
	if err != nil {
		writeServerError(w, err)
		return
	}
	if tenant == nil {
		writeJSON(w, http.StatusOK, domain.LoginResponse{Success: false, Error: invalidCredentials})
		return
	}

	user, err := s.store.AuthenticateUser(r.Context(), tenant.ID, req.Username, req.Password)
	if err != nil {
		writeServerError(w, err)
		return
	}

	if user == nil {
		writeJSON(w, http.StatusOK, domain.LoginResponse{
			Success: false,
			Error:   invalidCredentials,
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
	if s.serveWebIfHTML(w, r) {
		return
	}
	values := r.URL.Query()
	limit, _ := strconv.Atoi(values.Get("limit"))
	offset, _ := strconv.Atoi(values.Get("offset"))
	result, err := s.store.Customers(r.Context(), store.CustomerQuery{
		Search: values.Get("q"),
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleLocations(w http.ResponseWriter, r *http.Request) {
	// An optional customerId narrows to a single firm's locations so the
	// work-order form can lazy-load per selected client instead of pulling the
	// whole tenant's location list on every page load.
	locations, err := s.store.Locations(r.Context(), r.URL.Query().Get("customerId"))
	if err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, locations)
}

func (s *Server) handleCustomerByID(w http.ResponseWriter, r *http.Request) {
	if s.serveWebIfHTML(w, r) {
		return
	}
	customer, err := s.store.CustomerByID(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeServerError(w, err)
		return
	}
	if customer == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Klijent nije pronađen."})
		return
	}
	writeJSON(w, http.StatusOK, customer)
}

func (s *Server) handleUpsertCustomer(w http.ResponseWriter, r *http.Request) {
	var customer domain.Customer
	if !decodeJSONBody(w, r, &customer) {
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
	if !decodeJSONBody(w, r, &location) {
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

	if !isAdmin(r) {
		for i := range result.Items {
			stripWorkOrderCost(&result.Items[i])
		}
	}

	writeJSON(w, http.StatusOK, result)
}

// stripWorkOrderCost removes the admin-only cost and margin figures (cached
// profit, per-line UnitCost, and the cost-review flag) so regular operators
// never receive cost data.
func stripWorkOrderCost(workOrder *domain.WorkOrder) {
	workOrder.Profit = nil
	workOrder.NeedsCostReview = false
	for i := range workOrder.InvoiceDraft.LineItems {
		workOrder.InvoiceDraft.LineItems[i].UnitCost = nil
	}
}

// stripWorkOrderRenderMoney removes all price figures from a work order before it
// is rendered to HTML/PDF, so a non-admin operator's printout shows no money.
func stripWorkOrderRenderMoney(workOrder *domain.WorkOrder) {
	workOrder.Price = nil
	workOrder.Profit = nil
	workOrder.NeedsCostReview = false
	for i := range workOrder.InvoiceDraft.LineItems {
		workOrder.InvoiceDraft.LineItems[i].UnitPrice = 0
		workOrder.InvoiceDraft.LineItems[i].UnitCost = nil
	}
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
		// The cost-review queue is admin-only; ignore the filter for operators so
		// they can't enumerate which orders await cost entry.
		NeedsCostReview: isAdmin(r) && values.Get("needsCostReview") == "true",
		Limit:           limit,
		Offset:          offset,
		Sort:            values.Get("sort"),
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

	if !isAdmin(r) {
		stripWorkOrderCost(workOrder)
	}

	writeJSON(w, http.StatusOK, workOrder)
}

// handleReserveOrderNumber atomically claims the next order number for the caller
// so it can be shown in the create-form header before the work order is saved.
func (s *Server) handleReserveOrderNumber(w http.ResponseWriter, r *http.Request) {
	reservedBy := ""
	if user := currentUser(r); user != nil {
		reservedBy = user.Username
	}

	reserved, err := s.store.ReserveOrderNumber(r.Context(), reservedBy)
	if err != nil {
		writeStoreError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, reserved)
}

// handleReleaseOrderNumber frees a reserved order number when the operator
// cancels the create form, so the number is reclaimed immediately instead of
// lingering until its reservation expires. Releasing an unknown/consumed number
// succeeds as a no-op so the client can fire-and-forget on form teardown.
func (s *Server) handleReleaseOrderNumber(w http.ResponseWriter, r *http.Request) {
	var req struct {
		OrderNumber string `json:"orderNumber"`
	}
	if !decodeJSONBody(w, r, &req) {
		return
	}

	if err := s.store.ReleaseOrderNumber(r.Context(), req.OrderNumber); err != nil {
		writeStoreError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// handleAcquireEditLock claims or refreshes the caller's exclusive edit lock on a
// work order. It returns 200 with the caller's lock when acquired (or refreshed
// by a heartbeat) and 409 with the current holder's identity when another
// operator is already editing, so the client can render a read-only view.
func (s *Server) handleAcquireEditLock(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if user == nil {
		writeValidationError(w, "Prijava je istekla.")
		return
	}

	lock, acquired, err := s.store.AcquireEditLock(r.Context(), chi.URLParam(r, "id"), user.Username)
	if err != nil {
		writeStoreError(w, err)
		return
	}

	if !acquired {
		writeJSON(w, http.StatusConflict, lock)
		return
	}

	writeJSON(w, http.StatusOK, lock)
}

// handleReleaseEditLock frees the caller's edit lock on save/cancel/close. It is
// a no-op when the caller no longer holds the lock.
func (s *Server) handleReleaseEditLock(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	if user == nil {
		writeValidationError(w, "Prijava je istekla.")
		return
	}

	if err := s.store.ReleaseEditLock(r.Context(), chi.URLParam(r, "id"), user.Username); err != nil {
		writeStoreError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// handleCreateWorkOrder creates a new in-memory work order backed by the shared fixtures.
func (s *Server) handleCreateWorkOrder(w http.ResponseWriter, r *http.Request) {
	var req domain.CreateWorkOrderInput
	if !decodeJSONBody(w, r, &req) {
		return
	}

	workOrder, err := s.store.CreateWorkOrder(r.Context(), req)
	if err != nil {
		writeStoreError(w, err)
		return
	}

	if !isAdmin(r) {
		stripWorkOrderCost(workOrder)
	}

	writeJSON(w, http.StatusCreated, workOrder)
}

// handleUpdateWorkOrder applies a partial update and preserves 404 -> null semantics for desktop callers.
func (s *Server) handleUpdateWorkOrder(w http.ResponseWriter, r *http.Request) {
	var req domain.UpdateWorkOrderInput
	if !decodeJSONBody(w, r, &req) {
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

	if !isAdmin(r) {
		stripWorkOrderCost(workOrder)
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

	var locationAddress *string
	if workOrder.LocationID != nil {
		locations, locErr := s.store.Locations(r.Context(), "")
		if locErr != nil {
			writeServerError(w, locErr)
			return
		}
		for _, location := range locations {
			if location.ID == *workOrder.LocationID {
				locationAddress = location.Address
				break
			}
		}
	}

	// Non-admin operators get a price-less work order on the printout.
	if !isAdmin(r) {
		stripWorkOrderRenderMoney(workOrder)
	}

	settings, err := s.store.OrganizationSettings(r.Context())
	if err != nil {
		writeServerError(w, err)
		return
	}

	pdfBytes, err := reports.RenderWorkOrderPDF(r.Context(), *workOrder, locationAddress, settings.PDFSections)
	if err != nil {
		writeServerError(w, err)
		return
	}

	filename := fmt.Sprintf("%s.pdf", workOrder.OrderNumber)
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(pdfBytes)
}

// handleWorkOrderPreview renders the print HTML for a draft (possibly unsaved)
// work order so the editor can show a live preview. It uses the same template as
// the PDF report but skips the headless-Chrome PDF step, so it is cheap enough
// to call on every edit. It never persists anything.
func (s *Server) handleWorkOrderPreview(w http.ResponseWriter, r *http.Request) {
	var order domain.WorkOrder
	if !decodeJSONBody(w, r, &order) {
		return
	}

	var locationAddress *string
	if order.LocationID != nil {
		locations, err := s.store.Locations(r.Context(), "")
		if err != nil {
			writeServerError(w, err)
			return
		}
		for _, location := range locations {
			if location.ID == *order.LocationID {
				locationAddress = location.Address
				break
			}
		}
	}

	// Non-admin operators get a price-less work order in the preview.
	if !isAdmin(r) {
		stripWorkOrderRenderMoney(&order)
	}

	settings, err := s.store.OrganizationSettings(r.Context())
	if err != nil {
		writeServerError(w, err)
		return
	}

	html, err := reports.RenderWorkOrderHTML(order, locationAddress, settings.PDFSections)
	if err != nil {
		writeServerError(w, err)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(html))
}

func (s *Server) handlePublicWorkOrderStatus(w http.ResponseWriter, r *http.Request) {
	if s.serveWebIfHTML(w, r) {
		return
	}
	token := chi.URLParam(r, "token")
	workOrder, err := s.store.WorkOrderByPublicToken(r.Context(), token)
	if err != nil {
		writeServerError(w, err)
		return
	}
	if workOrder == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Radni nalog nije pronađen."})
		return
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
	// Reject paths that escape WebDir (e.g. encoded "../" segments survive
	// chi routing and would otherwise reach the filesystem).
	if cleanPath == ".." || strings.HasPrefix(cleanPath, ".."+string(filepath.Separator)) {
		http.NotFound(w, r)
		return
	}
	filePath := filepath.Join(s.config.WebDir, cleanPath)
	if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
		http.ServeFile(w, r, filePath)
		return
	}
	http.ServeFile(w, r, filepath.Join(s.config.WebDir, "index.html"))
}

// maxJSONBodyBytes caps request bodies so a single client cannot exhaust
// server memory with an oversized payload.
const maxJSONBodyBytes = 1 << 20

// decodeJSONBody centralizes request decoding: it enforces the body size cap
// and writes the 400 response itself, so handlers only continue on success.
func decodeJSONBody(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return false
	}
	return true
}

// writeJSON centralizes response encoding so handlers stay focused on control
// flow and data retrieval instead of repeated serialization code.
func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// writeServerError keeps internal failures in one response shape. The
// underlying error is logged but never echoed to clients, so internals
// (SQL fragments, file paths) cannot leak through API responses.
func writeServerError(w http.ResponseWriter, err error) {
	log.Printf("internal server error: %v", err)
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Došlo je do greške na serveru."})
}

func writeStoreError(w http.ResponseWriter, err error) {
	var validationErr *store.ValidationError
	if errors.As(err, &validationErr) {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": validationErr.Error()})
		return
	}

	writeServerError(w, err)
}

// writeValidationError reports a business-rule rejection (422) with a Serbian
// message, for guards enforced in the handler rather than the store.
func writeValidationError(w http.ResponseWriter, message string) {
	writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": message})
}
