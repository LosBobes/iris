package api

import (
	"net/http"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/dashboard"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

// handleDashboard aggregates the tenant's work orders server-side so the web
// dashboard no longer downloads every order. Cost-derived finance numbers are
// computed only for admins; the response carries a slim attention-order
// projection rather than full work orders.
func (s *Server) handleDashboard(w http.ResponseWriter, r *http.Request) {
	if s.serveWebIfHTML(w, r) {
		return
	}

	values := r.URL.Query()
	today := time.Now().Format(dashboard.DateLayout)
	filters := dashboard.Filters{
		IssuedBy:   values.Get("issuedBy"),
		CompanyKey: values.Get("companyKey"),
	}
	for _, param := range []struct {
		name string
		dst  *string
	}{
		{"dateFrom", &filters.DateFrom},
		{"dateTo", &filters.DateTo},
		{"today", &today},
	} {
		value := values.Get(param.name)
		if value == "" {
			continue
		}
		if _, err := time.Parse(dashboard.DateLayout, value); err != nil {
			writeAPIError(w, r, http.StatusBadRequest, "Datum mora biti u formatu GGGG-MM-DD ("+param.name+").", nil)
			return
		}
		*param.dst = value
	}

	// An empty query loads every order of the tenant (no LIMIT), with invoice
	// line items and their real unitCost: aggregation must see true costs, and
	// only the admin-gated Finance section ever exposes derived numbers.
	result, err := s.store.WorkOrders(r.Context(), store.WorkOrderListQuery{})
	if err != nil {
		writeServerError(w, r, err)
		return
	}

	username := ""
	if user := currentUser(r); user != nil {
		username = user.Username
	}
	writeJSON(w, http.StatusOK, dashboard.Build(result.Items, dashboard.Options{
		Filters:  filters,
		Today:    today,
		IsAdmin:  isAdmin(r),
		Username: username,
	}))
}
