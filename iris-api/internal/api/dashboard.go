package api

import (
	"context"
	"net/http"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/dashboard"
	"github.com/LosBobes/iris/iris-api/internal/domain"
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

	username := ""
	if user := currentUser(r); user != nil {
		username = user.Username
	}
	data, err := s.buildDashboard(r.Context(), dashboard.Options{
		Filters:  filters,
		Today:    today,
		IsAdmin:  isAdmin(r),
		Username: username,
	})
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, data)
}

// buildDashboard loads only the orders the dashboard can use (the filter range
// plus orders that can raise a signal or queue entry; see store.DashboardOrders)
// with their full payload, so invoice line items keep their real unitCost:
// aggregation must see true costs, and only the admin-gated Finance section ever
// exposes derived numbers. The result is identical to aggregating every order.
func (s *Server) buildDashboard(ctx context.Context, opts dashboard.Options) (domain.DashboardData, error) {
	source, err := s.store.DashboardOrders(ctx, store.DashboardOrdersQuery{
		DateFrom: opts.Filters.DateFrom,
		DateTo:   opts.Filters.DateTo,
		IssuedBy: opts.Filters.IssuedBy,
		Today:    opts.Today,
		Username: opts.Username,
	})
	if err != nil {
		return domain.DashboardData{}, err
	}
	data := dashboard.Build(source.Orders, opts)
	data.HasOrders = source.HasOrders
	return data, nil
}
