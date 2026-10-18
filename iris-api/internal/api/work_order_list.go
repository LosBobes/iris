package api

import (
	"bytes"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

// handleWorkOrders lists one page of work orders. Filtering, sorting and
// paging all happen in the store; the response carries the filtered total so
// the client pager works without downloading every order.
func (s *Server) handleWorkOrders(w http.ResponseWriter, r *http.Request) {
	if s.serveWebIfHTML(w, r) {
		return
	}
	result, err := s.store.WorkOrders(r.Context(), parseWorkOrderListQuery(r))
	if err != nil {
		writeServerError(w, r, err)
		return
	}

	admin := isAdmin(r)
	summary := r.URL.Query().Get("view") == workOrderViewSummary
	for i := range result.Items {
		if !admin {
			stripWorkOrderCost(&result.Items[i])
		}
		if summary {
			stripWorkOrderDetail(&result.Items[i])
		}
	}

	writeJSON(w, http.StatusOK, result)
}

// handleExportWorkOrdersCSV streams every order matching the list filters (no
// paging) as the CSV the work-order list's "Izvoz" button downloads. The
// optional `columns` parameter (comma-separated list column keys) picks the
// columns, matching what the user has visible.
func (s *Server) handleExportWorkOrdersCSV(w http.ResponseWriter, r *http.Request) {
	query := parseWorkOrderListFilters(r)
	query.Summary = true
	result, err := s.store.WorkOrders(r.Context(), query)
	if err != nil {
		writeServerError(w, r, err)
		return
	}

	var columns []string
	if raw := strings.TrimSpace(r.URL.Query().Get("columns")); raw != "" {
		columns = strings.Split(raw, ",")
	}
	var body bytes.Buffer
	// The export carries only the selling price, which every role may see, so
	// no cost stripping is needed here.
	if err := store.WriteWorkOrdersCSV(&body, result.Items, columns); err != nil {
		writeServerError(w, r, err)
		return
	}
	filename := "radni-nalozi-" + time.Now().UTC().Format("2006-01-02") + ".csv"
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.Header().Set("X-Total-Count", strconv.Itoa(result.Total))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body.Bytes())
}

// workOrderViewSummary is the `view` value that asks for the list projection:
// the matching orders without the per-order history collections.
const workOrderViewSummary = "summary"

// stripWorkOrderDetail drops the collections that only the work-order detail
// page reads (see store.WorkOrderSummary). The store already serves the slim
// summary payload for view=summary; this keeps the guarantee for any row whose
// summary column was not populated.
func stripWorkOrderDetail(workOrder *domain.WorkOrder) {
	*workOrder = store.WorkOrderSummary(*workOrder)
}

const (
	// defaultWorkOrderListLimit is the page size when the caller sends none.
	defaultWorkOrderListLimit = 50
	// maxWorkOrderListLimit caps an explicitly requested page size. Internal
	// callers that need every order (dashboard, CSV export) go through the
	// store directly, not through this endpoint.
	maxWorkOrderListLimit = 200
)

func parseWorkOrderListQuery(r *http.Request) store.WorkOrderListQuery {
	query := parseWorkOrderListFilters(r)
	values := r.URL.Query()
	limit, err := strconv.Atoi(values.Get("limit"))
	if err != nil || limit <= 0 {
		limit = defaultWorkOrderListLimit
	}
	if limit > maxWorkOrderListLimit {
		limit = maxWorkOrderListLimit
	}
	offset, _ := strconv.Atoi(values.Get("offset"))
	if offset < 0 {
		offset = 0
	}
	query.Limit = limit
	query.Offset = offset
	query.Summary = values.Get("view") == workOrderViewSummary
	return query
}

// parseWorkOrderListFilters reads the filter and sort parameters shared by the
// list and the CSV export.
func parseWorkOrderListFilters(r *http.Request) store.WorkOrderListQuery {
	values := r.URL.Query()
	queue := values.Get("queue")
	if !store.IsWorkOrderQueue(queue) {
		queue = ""
	}
	today := values.Get("today")
	if _, err := time.Parse("2006-01-02", today); err != nil {
		today = ""
	}
	return store.WorkOrderListQuery{
		Search:              values.Get("search"),
		Status:              domain.WorkOrderStatus(values.Get("status")),
		AssignedTo:          values.Get("assignedTo"),
		CustomerID:          values.Get("customerId"),
		BillingDocumentType: values.Get("billingDocumentType"),
		DeliveryMethod:      values.Get("deliveryMethod"),
		Queue:               queue,
		Today:               today,
		DateFrom:            values.Get("dateFrom"),
		DateTo:              values.Get("dateTo"),
		// The cost-review queue is admin-only; ignore the filter for operators so
		// they can't enumerate which orders await cost entry.
		NeedsCostReview: isAdmin(r) && values.Get("needsCostReview") == "true",
		Sort:            values.Get("sort"),
	}
}
