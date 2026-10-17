package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

func TestModuleRoutesAreForbiddenByDefault(t *testing.T) {
	f := newModuleFixture(t, false)
	processRoutes := []struct{ method, path, body string }{
		{http.MethodGet, "/process-templates", ""},
		{http.MethodGet, "/process-templates/x", ""},
		{http.MethodPost, "/process-templates", templateBody("X", false, offsetGraph)},
		{http.MethodPut, "/process-templates/x", templateBody("X", false, offsetGraph)},
		{http.MethodDelete, "/process-templates/x", ""},
		{http.MethodGet, "/work-orders/" + f.orderID + "/process", ""},
		{http.MethodPost, "/work-orders/" + f.orderID + "/process", `{"templateId":"x"}`},
		{http.MethodPut, "/work-orders/" + f.orderID + "/process", `{"graph":{"nodes":[],"edges":[]}}`},
		{http.MethodDelete, "/work-orders/" + f.orderID + "/process", ""},
	}
	stockRoutes := []struct{ method, path, body string }{
		{http.MethodGet, "/stock", ""},
		{http.MethodGet, "/stock/movements", ""},
		{http.MethodPost, "/stock/receipts", receiptBody(receiptLine("x", 1))},
		{http.MethodPost, "/stock/counts", `{"lines":[]}`},
	}
	check := func(group string, routes []struct{ method, path, body string }, message string) {
		for _, route := range routes {
			code, body := f.do(t, f.admin, route.method, route.path, route.body)
			var payload struct {
				Error string `json:"error"`
			}
			_ = json.Unmarshal(body, &payload)
			if code != http.StatusForbidden || payload.Error != message {
				t.Errorf("%s %s %s = %d %s", group, route.method, route.path, code, body)
			}
		}
	}
	check("processes", processRoutes, "Modul „Procesi rada“ nije uključen za ovu organizaciju.")
	check("stock", stockRoutes, "Modul „Magacin“ nije uključen za ovu organizaciju.")

	// Stock only: the warehouse opens, processes stay closed.
	f.setModules(t, false, true)
	check("processes", processRoutes, "Modul „Procesi rada“ nije uključen za ovu organizaciju.")
	if code, body := f.do(t, f.admin, http.MethodGet, "/stock", ""); code != http.StatusOK {
		t.Fatalf("stock with module on = %d %s", code, body)
	}
}

func (f processFixture) setModules(t *testing.T, processes, stock bool) {
	t.Helper()
	if _, err := f.sqlite.SetTenantModules(t.Context(), "demo", domain.OrganizationModulesUpdate{Processes: &processes, Stock: &stock}); err != nil {
		t.Fatal(err)
	}
}

func TestSettingsExposeModulesButCannotChangeThem(t *testing.T) {
	f := newModuleFixture(t, false)
	code, body := f.do(t, f.operator, http.MethodGet, "/settings", "")
	settings := decodeInto[domain.OrganizationSettings](t, code, http.StatusOK, body)
	if settings.Modules != (domain.OrganizationModules{}) {
		t.Fatalf("default modules = %+v", settings.Modules)
	}
	code, body = f.do(t, f.admin, http.MethodPut, "/settings", `{"showShippingOptions":true,"modules":{"processes":true,"stock":true}}`)
	settings = decodeInto[domain.OrganizationSettings](t, code, http.StatusOK, body)
	if settings.Modules != (domain.OrganizationModules{}) || !settings.ShowShippingOptions {
		t.Fatalf("PUT /settings changed modules: %+v", settings)
	}
	f.setModules(t, true, true)
	code, body = f.do(t, f.admin, http.MethodGet, "/settings", "")
	settings = decodeInto[domain.OrganizationSettings](t, code, http.StatusOK, body)
	if !settings.Modules.Processes || !settings.Modules.Stock {
		t.Fatalf("modules after switch = %+v", settings.Modules)
	}
}

func TestPlatformSetTenantModules(t *testing.T) {
	f := newModuleFixture(t, false)
	server := f.server
	if rec := platformRequest(t, server, nil, http.MethodPut, "/platform/tenants/demo/modules", `{"processes":false,"stock":true}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous = %d", rec.Code)
	}
	tenantCookie := &http.Cookie{Name: server.config.SessionCookieName, Value: f.admin}
	if rec := platformRequest(t, server, tenantCookie, http.MethodPut, "/platform/tenants/demo/modules", `{"processes":false,"stock":true}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("tenant admin = %d", rec.Code)
	}

	cookie := signedInPlatform(t, server)
	path := "/platform/tenants/demo/modules"
	if rec := platformRequest(t, server, cookie, http.MethodPut, "/platform/tenants/missing/modules", `{"processes":false,"stock":true}`); rec.Code != http.StatusNotFound {
		t.Fatalf("unknown org = %d, want 404", rec.Code)
	}
	rec := platformRequest(t, server, cookie, http.MethodPut, path, `{"processes":true,"stock":false}`)
	if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "Modul „Procesi rada“ zahteva uključen modul „Magacin“.") {
		t.Fatalf("processes without stock = %d %s", rec.Code, rec.Body.String())
	}
	if len(auditActions(t, server, cookie)) != 0 {
		t.Fatal("rejected switch was audited")
	}

	rec = platformRequest(t, server, cookie, http.MethodPut, path, `{"processes":true,"stock":true}`)
	var tenant domain.PlatformTenant
	if err := json.Unmarshal(rec.Body.Bytes(), &tenant); err != nil || rec.Code != http.StatusOK || !tenant.Modules.Processes || !tenant.Modules.Stock {
		t.Fatalf("set modules = %d %s", rec.Code, rec.Body.String())
	}
	// Unchanged repeat: 200, no second audit row.
	if rec := platformRequest(t, server, cookie, http.MethodPut, path, `{"processes":true,"stock":true}`); rec.Code != http.StatusOK {
		t.Fatalf("repeat = %d", rec.Code)
	}
	events := auditActions(t, server, cookie)
	if len(events) != 1 || events[0].Action != "tenant.modules" || events[0].TenantSlug != "demo" ||
		events[0].Detail["processes"] != "on" || events[0].Detail["stock"] != "on" || events[0].Detail["changed"] != "processes,stock" {
		t.Fatalf("audit = %+v", events)
	}
	// The tenant sees it right away, and the org list carries it.
	if code, body := f.do(t, f.admin, http.MethodGet, "/stock", ""); code != http.StatusOK {
		t.Fatalf("stock after switch = %d %s", code, body)
	}
	rec = platformRequest(t, server, cookie, http.MethodGet, "/platform/tenants", "")
	var tenants []domain.PlatformTenant
	if err := json.Unmarshal(rec.Body.Bytes(), &tenants); err != nil {
		t.Fatal(err)
	}
	for _, listed := range tenants {
		if listed.Slug == "demo" && !listed.Modules.Stock {
			t.Fatalf("listed modules = %+v", listed.Modules)
		}
	}
}

func TestAutoAttachAndPostingFollowModules(t *testing.T) {
	f := newModuleFixture(t, false)
	f.addArticle(t, "paper", "Papir", "kom", nil)

	// Processes off: templates exist (Backoffice prepared them) but nothing attaches.
	cookie := signedInPlatform(t, f.server)
	rec := platformRequest(t, f.server, cookie, http.MethodPost, "/platform/tenants/demo/process-templates", templateBody("Pripremljen", true, offsetGraph))
	if rec.Code != http.StatusCreated {
		t.Fatalf("platform template while off = %d %s", rec.Code, rec.Body.String())
	}
	if rec := platformRequest(t, f.server, cookie, http.MethodGet, "/platform/tenants/demo/process-templates", ""); rec.Code != http.StatusOK {
		t.Fatalf("platform list while off = %d", rec.Code)
	}
	createOrder := func() string {
		code, body := f.do(t, f.admin, http.MethodPost, "/work-orders", `{"clientName":"Beta","jobDescription":"Posao","issuedBy":"admin","issueDate":"2026-06-03","assignment":{"priority":"normal"}}`)
		order := decodeInto[domain.WorkOrder](t, code, http.StatusCreated, body)
		return order.ID
	}
	demoCtx := store.ContextWithTenant(context.Background(), store.DemoTenantID)
	if process, _ := f.sqlite.WorkOrderProcess(demoCtx, createOrder()); process != nil {
		t.Fatal("auto-attached with processes off")
	}
	f.setModules(t, true, true)
	id := createOrder()
	code, body := f.do(t, f.admin, http.MethodGet, "/work-orders/"+id+"/process", "")
	if code != http.StatusOK {
		t.Fatalf("process after enabling = %d %s", code, body)
	}
}

func TestCatalogStockOnHandIsNullWhileStockOff(t *testing.T) {
	f := newModuleFixture(t, true)
	f.addArticle(t, "paper", "Papir", "kom", nil)
	if code, body := f.do(t, f.admin, http.MethodPost, "/stock/receipts", receiptBody(receiptLine("paper", 7))); code != http.StatusCreated {
		t.Fatalf("receipt = %d %s", code, body)
	}
	onHand := func() *float64 {
		code, body := f.do(t, f.admin, http.MethodGet, "/catalog-items/paper", "")
		item := decodeInto[domain.CatalogItem](t, code, http.StatusOK, body)
		return item.StockOnHand
	}
	if got := onHand(); got == nil || *got != 7 {
		t.Fatalf("stockOnHand with stock on = %v", got)
	}
	f.setModules(t, false, false)
	if got := onHand(); got != nil {
		t.Fatalf("stockOnHand with stock off = %v, want null", *got)
	}
	code, body := f.do(t, f.admin, http.MethodGet, "/catalog-items", "")
	list := decodeInto[store.CatalogItemListResult](t, code, http.StatusOK, body)
	for _, item := range list.Items {
		if item.StockOnHand != nil {
			t.Fatalf("list item %s stockOnHand = %v", item.ID, *item.StockOnHand)
		}
	}
}

func TestPlatformTemplatesWorkWhileProcessesOff(t *testing.T) {
	f := newModuleFixture(t, false)
	cookie := signedInPlatform(t, f.server)
	base := "/platform/tenants/demo/process-templates"
	rec := platformRequest(t, f.server, cookie, http.MethodPost, base, templateBody("Pre-enable", false, offsetGraph))
	var created domain.ProcessTemplate
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil || rec.Code != http.StatusCreated {
		t.Fatalf("create = %d %s", rec.Code, rec.Body.String())
	}
	if rec := platformRequest(t, f.server, cookie, http.MethodDelete, base+"/"+created.ID, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete = %d", rec.Code)
	}
}
