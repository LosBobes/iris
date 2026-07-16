package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
	"github.com/go-chi/chi/v5"
)

// handleCatalogItems lists catalog items for any authenticated user. The pickers
// in the work-order form query it with ?kind= and ?q= to avoid pulling the full
// catalog at once.
func (s *Server) handleCatalogItems(w http.ResponseWriter, r *http.Request) {
	if s.serveWebIfHTML(w, r) {
		return
	}
	values := r.URL.Query()
	limit, _ := strconv.Atoi(values.Get("limit"))
	offset, _ := strconv.Atoi(values.Get("offset"))
	query := store.CatalogItemQuery{
		Search:     strings.TrimSpace(values.Get("q")),
		ActiveOnly: values.Get("active") == "true",
		Limit:      limit,
		Offset:     offset,
	}
	switch kind := domain.CatalogItemKind(values.Get("kind")); kind {
	case domain.CatalogItemKindService, domain.CatalogItemKindArticle:
		query.Kind = kind
	}
	result, err := s.store.CatalogItems(r.Context(), query)
	if err != nil {
		writeServerError(w, err)
		return
	}
	if !isAdmin(r) {
		for i := range result.Items {
			stripCatalogCost(&result.Items[i])
		}
	}
	writeJSON(w, http.StatusOK, result)
}

// stripCatalogCost removes the admin-only cost figure (nabavna cena / cena rada)
// so regular operators never receive cost or margin data.
func stripCatalogCost(item *domain.CatalogItem) {
	item.PurchasePrice = nil
}

func isAdmin(r *http.Request) bool {
	user := currentUser(r)
	return user != nil && user.Role == domain.RoleAdmin
}

// handleCatalogItemByID returns a single catalog item so the detail page can load
// it directly (deep link / refresh), mirroring the customer-by-id route.
func (s *Server) handleCatalogItemByID(w http.ResponseWriter, r *http.Request) {
	if s.serveWebIfHTML(w, r) {
		return
	}
	item, err := s.store.CatalogItemByID(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeServerError(w, err)
		return
	}
	if item == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Stavka kataloga nije pronađena."})
		return
	}
	if !isAdmin(r) {
		stripCatalogCost(item)
	}
	writeJSON(w, http.StatusOK, item)
}

// handleCatalogItemCostHistory returns an item's effective-dated cost records
// (admin only) for the catalog detail view, newest period first.
func (s *Server) handleCatalogItemCostHistory(w http.ResponseWriter, r *http.Request) {
	history, err := s.store.CatalogItemCostHistory(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": history})
}

func (s *Server) handleUpsertCatalogItem(w http.ResponseWriter, r *http.Request) {
	var input domain.CatalogItemInput
	if !decodeJSONBody(w, r, &input) {
		return
	}

	// Operators may change only the kind (vrsta) of an existing item; every
	// other field — name, code, unit, prices, barcode, tax group, status,
	// description — stays admin-only. Rather than trust the incoming payload
	// (which never carries cost and may omit fields), load the stored item and
	// apply just the kind, so nothing else can be overwritten.
	if !isAdmin(r) {
		s.updateCatalogItemKind(w, r, input.Kind)
		return
	}

	item := domain.CatalogItem{
		Code:          input.Code,
		Name:          input.Name,
		Kind:          input.Kind,
		Unit:          input.Unit,
		PurchasePrice: input.PurchasePrice,
		SalePrice:     input.SalePrice,
		Barcode:       input.Barcode,
		TaxGroup:      input.TaxGroup,
		Description:   input.Description,
		IsActive:      input.IsActive,
	}
	if id := chi.URLParam(r, "id"); id != "" {
		item.ID = id
	}
	result, err := s.store.UpsertCatalogItem(r.Context(), item)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	status := http.StatusOK
	if chi.URLParam(r, "id") == "" {
		status = http.StatusCreated
	}
	writeJSON(w, status, result)
}

// updateCatalogItemKind applies an operator's kind-only edit to an existing
// catalog item. It rejects creates (operators can't add items) and invalid
// kinds, and preserves every other stored field so a non-admin can never touch
// price, name, or status.
func (s *Server) updateCatalogItemKind(w http.ResponseWriter, r *http.Request, kind domain.CatalogItemKind) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Nemate dozvolu za ovu akciju."})
		return
	}
	if kind != domain.CatalogItemKindService && kind != domain.CatalogItemKindArticle {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Neispravna vrsta stavke."})
		return
	}
	existing, err := s.store.CatalogItemByID(r.Context(), id)
	if err != nil {
		writeServerError(w, err)
		return
	}
	if existing == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Stavka kataloga nije pronađena."})
		return
	}
	existing.Kind = kind
	result, err := s.store.UpsertCatalogItem(r.Context(), *existing)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	// Operators never receive cost data.
	stripCatalogCost(result)
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleDeleteCatalogItem(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteCatalogItem(r.Context(), chi.URLParam(r, "id")); err != nil {
		writeServerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}
