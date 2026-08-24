package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"

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
		writeServerError(w, r, err)
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
		writeServerError(w, r, err)
		return
	}
	if item == nil {
		writeAPIError(w, r, http.StatusNotFound, "Stavka kataloga nije pronađena.", nil)
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
		writeServerError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": history})
}

// validCatalogEffectiveFrom validates the optional price effective date. A nil or
// blank value means "today" (returned as "" so the store applies its own today).
// A provided value must be a YYYY-MM-DD date today or later — past dates are
// rejected so prices can only be scheduled forward, never back-dated. On failure
// it writes a 400 and returns ok=false.
func validCatalogEffectiveFrom(w http.ResponseWriter, r *http.Request, raw *string) (string, bool) {
	if raw == nil {
		return "", true
	}
	value := strings.TrimSpace(*raw)
	if value == "" {
		return "", true
	}
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		writeAPIError(w, r, http.StatusBadRequest, "Datum primene mora biti u formatu GGGG-MM-DD.", nil)
		return "", false
	}
	today := time.Now().UTC().Format("2006-01-02")
	if parsed.UTC().Format("2006-01-02") < today {
		writeAPIError(w, r, http.StatusBadRequest, "Datum primene ne može biti u prošlosti.", nil)
		return "", false
	}
	return value, true
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

	effectiveFrom, ok := validCatalogEffectiveFrom(w, r, input.EffectiveFrom)
	if !ok {
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
	result, err := s.store.UpsertCatalogItem(r.Context(), item, effectiveFrom)
	if err != nil {
		writeStoreError(w, r, err)
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
		writeAPIError(w, r, http.StatusForbidden, "Nemate dozvolu za ovu akciju.", nil)
		return
	}
	if kind != domain.CatalogItemKindService && kind != domain.CatalogItemKindArticle {
		writeAPIError(w, r, http.StatusBadRequest, "Neispravna vrsta stavke.", nil)
		return
	}
	existing, err := s.store.CatalogItemByID(r.Context(), id)
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	if existing == nil {
		writeAPIError(w, r, http.StatusNotFound, "Stavka kataloga nije pronađena.", nil)
		return
	}
	existing.Kind = kind
	// Kind-only edit: no price change, so no effective date (empty defaults to
	// today in the store, which no-ops the unchanged price and preserves any
	// pending future schedule).
	result, err := s.store.UpsertCatalogItem(r.Context(), *existing, "")
	if err != nil {
		writeStoreError(w, r, err)
		return
	}
	// Operators never receive cost data.
	stripCatalogCost(result)
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleDeleteCatalogItem(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteCatalogItem(r.Context(), chi.URLParam(r, "id")); err != nil {
		writeServerError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// catalogCleanupFilter reads the two parameters that scope a catalog cleanup:
// the repeatable ?kind= (service, article, or both) and ?missing= (purchase,
// sale, or both). Both are required and strictly validated — an empty or
// mistyped value is a 400 rather than a wider sweep. It returns ok=false once a
// response has been written.
func catalogCleanupFilter(w http.ResponseWriter, r *http.Request) (store.CatalogCleanupFilter, bool) {
	query := r.URL.Query()
	kinds := make([]domain.CatalogItemKind, 0, 2)
	seen := map[domain.CatalogItemKind]bool{}
	for _, value := range query["kind"] {
		kind := domain.CatalogItemKind(strings.TrimSpace(value))
		if kind != domain.CatalogItemKindService && kind != domain.CatalogItemKindArticle {
			writeAPIError(w, r, http.StatusBadRequest, "Neispravna vrsta stavke.", nil)
			return store.CatalogCleanupFilter{}, false
		}
		if !seen[kind] {
			seen[kind] = true
			kinds = append(kinds, kind)
		}
	}
	if len(kinds) == 0 {
		writeAPIError(w, r, http.StatusBadRequest, "Izaberite bar jednu vrstu stavke.", nil)
		return store.CatalogCleanupFilter{}, false
	}

	missing := store.CatalogCleanupMissing(strings.TrimSpace(query.Get("missing")))
	switch missing {
	case store.CleanupMissingPurchase, store.CleanupMissingSale, store.CleanupMissingBoth:
	default:
		writeAPIError(w, r, http.StatusBadRequest, "Neispravan izbor cene za čišćenje.", nil)
		return store.CatalogCleanupFilter{}, false
	}
	return store.CatalogCleanupFilter{Kinds: kinds, Missing: missing}, true
}

// handleCatalogCleanupPreview (admin only) lists the catalog items the matching
// cleanup would delete, so the client can show exactly what is about to go
// before the admin confirms it.
func (s *Server) handleCatalogCleanupPreview(w http.ResponseWriter, r *http.Request) {
	filter, ok := catalogCleanupFilter(w, r)
	if !ok {
		return
	}
	items, err := s.store.CatalogItemsMissingPrices(r.Context(), filter)
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items)})
}

// handleCleanupCatalogItems (admin only) removes catalog items of the selected
// kinds that are missing the selected price — placeholder rows an admin wants to
// sweep out — and reports how many were deleted. Both axes are explicit, so a
// cleanup can never reach further than the preview showed.
func (s *Server) handleCleanupCatalogItems(w http.ResponseWriter, r *http.Request) {
	filter, ok := catalogCleanupFilter(w, r)
	if !ok {
		return
	}
	deleted, err := s.store.DeleteCatalogItemsMissingPrices(r.Context(), filter)
	if err != nil {
		writeServerError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"deleted": deleted})
}
