package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

// newServerWithRoles builds a real SQLite-backed server seeded with one admin
// and one non-admin ("user") account, returning a session token for each.
func newServerWithRoles(t *testing.T) (server *Server, adminToken, userToken string) {
	t.Helper()
	ctx := context.Background()

	sqliteStore, err := store.OpenSQLite(ctx, filepath.Join(t.TempDir(), "iris.db"))
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = sqliteStore.Close() })

	if err := sqliteStore.EnsureTenant(ctx, store.DemoTenantID, store.DemoTenantSlug, store.DemoTenantName); err != nil {
		t.Fatalf("ensure tenant: %v", err)
	}
	ctx = store.ContextWithTenant(ctx, store.DemoTenantID)

	if err := sqliteStore.CreateUser(ctx, "admin-1", "admin", "admin123", domain.RoleAdmin, false); err != nil {
		t.Fatalf("create admin: %v", err)
	}
	if err := sqliteStore.CreateUser(ctx, "user-1", "operater", "operater123", domain.RoleUser, false); err != nil {
		t.Fatalf("create user: %v", err)
	}

	server = NewServer(sqliteStore)
	return server, roleSessionToken(t, sqliteStore, "admin", "admin123"), roleSessionToken(t, sqliteStore, "operater", "operater123")
}

func roleSessionToken(t *testing.T, s store.Store, username, password string) string {
	t.Helper()
	ctx := context.Background()
	user, err := s.AuthenticateUser(ctx, store.DemoTenantID, username, password)
	if err != nil || user == nil {
		t.Fatalf("authenticate %s: user=%v err=%v", username, user, err)
	}
	token, err := s.CreateSession(ctx, user.ID, time.Now().Add(time.Hour))
	if err != nil {
		t.Fatalf("create session for %s: %v", username, err)
	}
	return token
}

func roleRequest(t *testing.T, server *Server, token, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader("")
	} else {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, reader)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.AddCookie(&http.Cookie{Name: server.config.SessionCookieName, Value: token})
	}
	rec := httptest.NewRecorder()
	server.Routes().ServeHTTP(rec, req)
	return rec
}

// TestAdminRoutesRejectNonAdmin proves the destructive/admin routes are gated by
// role: a non-admin session is forbidden, while an admin session clears the gate.
func TestAdminRoutesRejectNonAdmin(t *testing.T) {
	server, adminToken, userToken := newServerWithRoles(t)

	adminRoutes := []struct {
		method string
		path   string
		body   string
	}{
		{http.MethodDelete, "/work-orders/does-not-exist", ""},
		{http.MethodDelete, "/customers/does-not-exist", ""},
		{http.MethodDelete, "/locations/does-not-exist", ""},
		{http.MethodPost, "/enum-values", `{"field":"priority","value":"rush","label":"Rush"}`},
		{http.MethodPut, "/enum-values/does-not-exist", `{"field":"priority","value":"rush","label":"Rush"}`},
		{http.MethodDelete, "/enum-values/does-not-exist", ""},
	}

	for _, route := range adminRoutes {
		// A non-admin must be forbidden by requireAdmin before the handler runs.
		if rec := roleRequest(t, server, userToken, route.method, route.path, route.body); rec.Code != http.StatusForbidden {
			t.Errorf("%s %s as user = %d, want %d", route.method, route.path, rec.Code, http.StatusForbidden)
		}
		// An admin must clear the gate (any status other than 401/403).
		if rec := roleRequest(t, server, adminToken, route.method, route.path, route.body); rec.Code == http.StatusForbidden || rec.Code == http.StatusUnauthorized {
			t.Errorf("%s %s as admin = %d, want the admin gate to pass", route.method, route.path, rec.Code)
		}
	}
}

// TestSharedRoutesAllowNonAdmin proves non-admins retain the operator workflow:
// they can list and create work orders, while an anonymous request is rejected.
func TestSharedRoutesAllowNonAdmin(t *testing.T) {
	server, _, userToken := newServerWithRoles(t)

	if rec := roleRequest(t, server, userToken, http.MethodGet, "/work-orders", ""); rec.Code != http.StatusOK {
		t.Errorf("GET /work-orders as user = %d, want %d", rec.Code, http.StatusOK)
	}

	createBody := `{"clientName":"Novi klijent","jobDescription":"Štampa brošure","shipping":{},"issuedBy":"operater","issueDate":"2026-06-22"}`
	if rec := roleRequest(t, server, userToken, http.MethodPost, "/work-orders", createBody); rec.Code != http.StatusCreated {
		t.Errorf("POST /work-orders as user = %d, want %d", rec.Code, http.StatusCreated)
	}

	// No session at all must be unauthorized, not merely forbidden.
	if rec := roleRequest(t, server, "", http.MethodGet, "/work-orders", ""); rec.Code != http.StatusUnauthorized {
		t.Errorf("GET /work-orders anonymous = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

// TestUserManagement proves the admin-only account CRUD: listing, creating,
// editing role, and deleting users, plus the self-delete and last-admin guards.
func TestUserManagement(t *testing.T) {
	server, adminToken, userToken := newServerWithRoles(t)

	// The whole surface is admin-only.
	if rec := roleRequest(t, server, userToken, http.MethodGet, "/users", ""); rec.Code != http.StatusForbidden {
		t.Fatalf("GET /users as user = %d, want %d", rec.Code, http.StatusForbidden)
	}

	listRec := roleRequest(t, server, adminToken, http.MethodGet, "/users", "")
	var users []domain.User
	if err := json.Unmarshal(listRec.Body.Bytes(), &users); err != nil {
		t.Fatalf("decode users: %v", err)
	}
	if len(users) != 2 {
		t.Fatalf("seeded users = %d, want 2", len(users))
	}
	var adminID string
	for _, user := range users {
		if user.Username == "admin" {
			adminID = user.ID
		}
	}

	// Create, plus duplicate-username and weak-password rejections.
	createRec := roleRequest(t, server, adminToken, http.MethodPost, "/users", `{"username":"novi","password":"tajna123","role":"user"}`)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("create user = %d (%s)", createRec.Code, createRec.Body.String())
	}
	var created domain.User
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created: %v", err)
	}
	if created.ID == "" || created.Role != domain.RoleUser {
		t.Fatalf("created = %#v, want a user id with role user", created)
	}
	if rec := roleRequest(t, server, adminToken, http.MethodPost, "/users", `{"username":"admin","password":"tajna123","role":"user"}`); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("duplicate username = %d, want %d", rec.Code, http.StatusUnprocessableEntity)
	}
	if rec := roleRequest(t, server, adminToken, http.MethodPost, "/users", `{"username":"slab","password":"123","role":"user"}`); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("weak password = %d, want %d", rec.Code, http.StatusUnprocessableEntity)
	}

	// The new user logs in with the assigned password, then is promoted to admin.
	if rec := roleRequest(t, server, "", http.MethodPost, "/auth/login", `{"username":"novi","password":"tajna123"}`); rec.Code != http.StatusOK {
		t.Fatalf("login as new user = %d, want %d", rec.Code, http.StatusOK)
	}
	if rec := roleRequest(t, server, adminToken, http.MethodPut, "/users/"+created.ID, `{"role":"admin","password":""}`); rec.Code != http.StatusOK {
		t.Fatalf("promote user = %d, want %d", rec.Code, http.StatusOK)
	}

	// Admins cannot delete their own account.
	if rec := roleRequest(t, server, adminToken, http.MethodDelete, "/users/"+adminID, ""); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("self-delete = %d, want %d", rec.Code, http.StatusUnprocessableEntity)
	}

	// With the promoted user demoted back, the original admin is the last one and
	// cannot be demoted.
	if rec := roleRequest(t, server, adminToken, http.MethodPut, "/users/"+created.ID, `{"role":"user"}`); rec.Code != http.StatusOK {
		t.Fatalf("demote back = %d, want %d", rec.Code, http.StatusOK)
	}
	if rec := roleRequest(t, server, adminToken, http.MethodPut, "/users/"+adminID, `{"role":"user"}`); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("demote last admin = %d, want %d", rec.Code, http.StatusUnprocessableEntity)
	}

	// Deleting the extra user succeeds and the list returns to the seeded two.
	if rec := roleRequest(t, server, adminToken, http.MethodDelete, "/users/"+created.ID, ""); rec.Code != http.StatusOK {
		t.Fatalf("delete user = %d, want %d", rec.Code, http.StatusOK)
	}
	finalRec := roleRequest(t, server, adminToken, http.MethodGet, "/users", "")
	var finalUsers []domain.User
	if err := json.Unmarshal(finalRec.Body.Bytes(), &finalUsers); err != nil {
		t.Fatalf("decode final users: %v", err)
	}
	if len(finalUsers) != 2 {
		t.Fatalf("final users = %d, want 2", len(finalUsers))
	}
}

// TestOrganizationSettings proves any authed user can read the firm name, only
// an admin can change it, and the change is persisted.
func TestOrganizationSettings(t *testing.T) {
	server, adminToken, userToken := newServerWithRoles(t)

	getRec := roleRequest(t, server, userToken, http.MethodGet, "/settings", "")
	if getRec.Code != http.StatusOK {
		t.Fatalf("GET /settings as user = %d, want %d", getRec.Code, http.StatusOK)
	}
	var settings domain.OrganizationSettings
	if err := json.Unmarshal(getRec.Body.Bytes(), &settings); err != nil {
		t.Fatalf("decode settings: %v", err)
	}
	if settings.FirmName != domain.DefaultFirmName {
		t.Fatalf("default firmName = %q, want %q", settings.FirmName, domain.DefaultFirmName)
	}
	if settings.PDFSections != domain.DefaultPDFSections() {
		t.Fatalf("default pdfSections = %+v, want all-enabled", settings.PDFSections)
	}

	if rec := roleRequest(t, server, userToken, http.MethodPut, "/settings", `{"firmName":"Hack"}`); rec.Code != http.StatusForbidden {
		t.Fatalf("PUT /settings as user = %d, want %d", rec.Code, http.StatusForbidden)
	}

	if rec := roleRequest(t, server, adminToken, http.MethodPut, "/settings", `{"firmName":"   "}`); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("PUT blank firmName = %d, want %d", rec.Code, http.StatusUnprocessableEntity)
	}
	if rec := roleRequest(t, server, adminToken, http.MethodPut, "/settings", `{"firmName":"Grafika Novi Naziv"}`); rec.Code != http.StatusOK {
		t.Fatalf("PUT /settings as admin = %d, want %d", rec.Code, http.StatusOK)
	}

	// A pdfSections-only update must persist and must not wipe the firm name.
	if rec := roleRequest(t, server, adminToken, http.MethodPut, "/settings",
		`{"pdfSections":{"delivery":false,"billing":true,"notes":true,"shippingAddress":false,"completion":true,"signatures":true}}`,
	); rec.Code != http.StatusOK {
		t.Fatalf("PUT pdfSections as admin = %d, want %d", rec.Code, http.StatusOK)
	}

	afterRec := roleRequest(t, server, userToken, http.MethodGet, "/settings", "")
	var after domain.OrganizationSettings
	if err := json.Unmarshal(afterRec.Body.Bytes(), &after); err != nil {
		t.Fatalf("decode after: %v", err)
	}
	if after.FirmName != "Grafika Novi Naziv" {
		t.Fatalf("persisted firmName = %q, want %q", after.FirmName, "Grafika Novi Naziv")
	}
	if after.PDFSections.Delivery || after.PDFSections.ShippingAddress {
		t.Fatalf("pdfSections not persisted: %+v", after.PDFSections)
	}
	if !after.PDFSections.Billing || !after.PDFSections.Signatures {
		t.Fatalf("pdfSections-only update wiped enabled sections: %+v", after.PDFSections)
	}
}

// TestCostDataHiddenFromNonAdmin proves the admin-only cost/margin figures
// (catalog purchasePrice, work-order line unitCost and cached profit) reach
// admins but are stripped from non-admin responses.
func TestCostDataHiddenFromNonAdmin(t *testing.T) {
	server, adminToken, userToken := newServerWithRoles(t)

	// Admin defines a catalog service with both a cost and a sale price.
	createItem := `{"code":"SVC-1","name":"Štampa plakata","kind":"service","unit":"kom","purchasePrice":120,"salePrice":300,"isActive":true}`
	itemRec := roleRequest(t, server, adminToken, http.MethodPost, "/catalog-items", createItem)
	if itemRec.Code != http.StatusCreated {
		t.Fatalf("create catalog item = %d (%s)", itemRec.Code, itemRec.Body.String())
	}
	var item domain.CatalogItem
	if err := json.Unmarshal(itemRec.Body.Bytes(), &item); err != nil {
		t.Fatalf("decode item: %v", err)
	}
	if item.PurchasePrice == nil || *item.PurchasePrice != 120 || item.SalePrice == nil || *item.SalePrice != 300 {
		t.Fatalf("admin item = %#v, want purchase 120 / sale 300", item)
	}

	// Non-admin reads the same item: the cost must be stripped, sale kept.
	userItemRec := roleRequest(t, server, userToken, http.MethodGet, "/catalog-items/"+item.ID, "")
	var userItem domain.CatalogItem
	if err := json.Unmarshal(userItemRec.Body.Bytes(), &userItem); err != nil {
		t.Fatalf("decode user item: %v", err)
	}
	if userItem.PurchasePrice != nil {
		t.Errorf("non-admin purchasePrice = %v, want nil", *userItem.PurchasePrice)
	}
	if userItem.SalePrice == nil || *userItem.SalePrice != 300 {
		t.Errorf("non-admin salePrice = %v, want 300 (visible)", userItem.SalePrice)
	}

	// A work order with a catalog-linked line: cost is derived server-side and
	// the cached profit = (300-120)*2 = 360.
	createOrder := `{"clientName":"Klijent","jobDescription":"Plakati","shipping":{},"issuedBy":"admin","issueDate":"2026-06-22",` +
		`"invoiceDraft":{"status":"draft","lineItems":[{"id":"li-1","kind":"service","description":"Štampa plakata","quantity":2,"unit":"kom","unitPrice":300,"catalogItemId":"` + item.ID + `"}]}}`
	orderRec := roleRequest(t, server, adminToken, http.MethodPost, "/work-orders", createOrder)
	if orderRec.Code != http.StatusCreated {
		t.Fatalf("create order = %d (%s)", orderRec.Code, orderRec.Body.String())
	}
	var adminOrder domain.WorkOrder
	if err := json.Unmarshal(orderRec.Body.Bytes(), &adminOrder); err != nil {
		t.Fatalf("decode admin order: %v", err)
	}
	if adminOrder.Profit == nil || *adminOrder.Profit != 360 {
		t.Fatalf("admin order profit = %v, want 360", adminOrder.Profit)
	}
	if len(adminOrder.InvoiceDraft.LineItems) != 1 ||
		adminOrder.InvoiceDraft.LineItems[0].UnitCost == nil ||
		*adminOrder.InvoiceDraft.LineItems[0].UnitCost != 120 {
		t.Fatalf("admin line unitCost = %#v, want 120", adminOrder.InvoiceDraft.LineItems)
	}

	// The same order fetched by a non-admin must hide profit and per-line cost.
	userOrderRec := roleRequest(t, server, userToken, http.MethodGet, "/work-orders/"+adminOrder.ID, "")
	var userOrder domain.WorkOrder
	if err := json.Unmarshal(userOrderRec.Body.Bytes(), &userOrder); err != nil {
		t.Fatalf("decode user order: %v", err)
	}
	if userOrder.Profit != nil {
		t.Errorf("non-admin profit = %v, want nil", *userOrder.Profit)
	}
	if len(userOrder.InvoiceDraft.LineItems) != 1 || userOrder.InvoiceDraft.LineItems[0].UnitCost != nil {
		t.Errorf("non-admin line unitCost = %#v, want nil", userOrder.InvoiceDraft.LineItems)
	}
}
