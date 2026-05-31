package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

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
	r.Use(corsMiddleware)

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Post("/auth/login", s.handleLogin)
	r.Get("/customers", s.handleCustomers)
	r.Get("/locations", s.handleLocations)
	r.Get("/work-orders", s.handleWorkOrders)
	r.Get("/work-orders/operators", s.handleOperators)
	r.Get("/work-orders/{id}", s.handleWorkOrderByID)
	r.Get("/work-orders/{id}/report", s.handleWorkOrderReport)
	r.Post("/work-orders", s.handleCreateWorkOrder)
	r.Patch("/work-orders/{id}", s.handleUpdateWorkOrder)
	r.Delete("/work-orders/{id}", s.handleDeleteWorkOrder)
	r.Get("/public/work-orders/{token}", s.handlePublicWorkOrderStatus)

	return r
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && (strings.HasPrefix(origin, "http://localhost:") ||
			strings.HasPrefix(origin, "http://127.0.0.1:")) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
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

func (s *Server) handleCustomers(w http.ResponseWriter, _ *http.Request) {
	customers, err := s.store.Customers()
	if err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, customers)
}

func (s *Server) handleLocations(w http.ResponseWriter, _ *http.Request) {
	locations, err := s.store.Locations()
	if err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, locations)
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

// handleWorkOrderByID returns a single work order or 404 when it does not exist.
func (s *Server) handleWorkOrderByID(w http.ResponseWriter, r *http.Request) {
	workOrder, err := s.store.WorkOrderByID(chi.URLParam(r, "id"))
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

	workOrder, err := s.store.CreateWorkOrder(req)
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

	workOrder, err := s.store.UpdateWorkOrder(chi.URLParam(r, "id"), req)
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
	result, err := s.store.DeleteWorkOrder(chi.URLParam(r, "id"))
	if err != nil {
		writeServerError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleWorkOrderReport(w http.ResponseWriter, r *http.Request) {
	workOrder, err := s.store.WorkOrderByID(chi.URLParam(r, "id"))
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
	workOrders, err := s.store.WorkOrders()
	if err != nil {
		writeServerError(w, err)
		return
	}

	token := chi.URLParam(r, "token")
	for _, workOrder := range workOrders {
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
