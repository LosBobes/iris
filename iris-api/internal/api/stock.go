package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

// Warehouse stock (magacin). Reads and goods receipts are open to every signed-in
// user; stock counts (popis / opening balance) are admin-only. All posting
// validation lives in the store.

const (
	defaultStockListLimit = 100
	maxStockListLimit     = 500

	catalogItemHasMovementsMessage = "Artikal ima promet u magacinu i ne može se obrisati."
)

// stockPage reads ?limit= and ?offset=: the limit defaults to 100 and is capped
// at 500, a negative offset is treated as 0.
func stockPage(r *http.Request) (limit, offset int) {
	values := r.URL.Query()
	limit, _ = strconv.Atoi(values.Get("limit"))
	offset, _ = strconv.Atoi(values.Get("offset"))
	if limit <= 0 {
		limit = defaultStockListLimit
	}
	if limit > maxStockListLimit {
		limit = maxStockListLimit
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}

func (s *Server) handleStockLevels(w http.ResponseWriter, r *http.Request) {
	if s.serveWebIfHTML(w, r) {
		return
	}
	limit, offset := stockPage(r)
	levels, err := s.store.StockLevels(r.Context(), store.StockLevelQuery{
		Search:  strings.TrimSpace(r.URL.Query().Get("search")),
		LowOnly: r.URL.Query().Get("lowOnly") == "true",
		Limit:   limit,
		Offset:  offset,
	})
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, levels)
}

func (s *Server) handleStockMovements(w http.ResponseWriter, r *http.Request) {
	if s.serveWebIfHTML(w, r) {
		return
	}
	limit, offset := stockPage(r)
	values := r.URL.Query()
	movements, err := s.store.StockMovements(r.Context(), store.StockMovementQuery{
		CatalogItemID: strings.TrimSpace(values.Get("catalogItemId")),
		WorkOrderID:   strings.TrimSpace(values.Get("workOrderId")),
		Limit:         limit,
		Offset:        offset,
	})
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, movements)
}

func (s *Server) handlePostStockReceipt(w http.ResponseWriter, r *http.Request) {
	var input domain.StockReceiptInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	result, err := s.store.PostStockReceipt(r.Context(), input, currentUser(r).Username)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

func (s *Server) handlePostStockCount(w http.ResponseWriter, r *http.Request) {
	var input domain.StockCountInput
	if !decodeJSONBody(w, r, &input) {
		return
	}
	result, err := s.store.PostStockCount(r.Context(), input, currentUser(r).Username)
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, result)
}
