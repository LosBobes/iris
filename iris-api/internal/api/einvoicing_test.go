package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

// The e-invoicing and e-dispatch modules (D-030) have no routes yet; their
// gate is checked directly so the first route behind it is covered.
func TestRequireModuleGatesEInvoicingAndEDispatch(t *testing.T) {
	f := newModuleFixture(t, false)
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	call := func(module string) (int, string) {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, "/einvoicing", nil).WithContext(store.ContextWithTenant(t.Context(), f.tenantID(t)))
		rec := httptest.NewRecorder()
		f.server.requireModule(module)(ok).ServeHTTP(rec, req)
		return rec.Code, rec.Body.String()
	}
	if code, body := call(moduleEInvoicing); code != http.StatusForbidden || !strings.Contains(body, "Modul „e-Fakture“ nije uključen") {
		t.Fatalf("einvoicing off = %d %s", code, body)
	}
	if code, body := call(moduleEDispatch); code != http.StatusForbidden || !strings.Contains(body, "Modul „e-Otpremnice“ nije uključen") {
		t.Fatalf("edispatch off = %d %s", code, body)
	}

	on := true
	if _, err := f.sqlite.SetTenantModules(t.Context(), "demo", domain.OrganizationModulesUpdate{EInvoicing: &on}); err != nil {
		t.Fatal(err)
	}
	if code, _ := call(moduleEInvoicing); code != http.StatusNoContent {
		t.Fatalf("einvoicing on = %d", code)
	}
	if code, _ := call(moduleEDispatch); code != http.StatusForbidden {
		t.Fatalf("edispatch must stay off on its own, got %d", code)
	}
}

func TestPlatformSwitchesEInvoicingModulesWithoutDependencies(t *testing.T) {
	f := newModuleFixture(t, false)
	cookie := signedInPlatform(t, f.server)
	rec := platformRequest(t, f.server, cookie, http.MethodPut, "/platform/tenants/demo/modules", `{"einvoicing":true,"edispatch":true}`)
	var tenant domain.PlatformTenant
	if err := json.Unmarshal(rec.Body.Bytes(), &tenant); err != nil || rec.Code != http.StatusOK ||
		!tenant.Modules.EInvoicing || !tenant.Modules.EDispatch || tenant.Modules.Stock {
		t.Fatalf("set modules = %d %s", rec.Code, rec.Body.String())
	}
	events := auditActions(t, f.server, cookie)
	if len(events) != 1 || events[0].Detail["einvoicing"] != "on" || events[0].Detail["edispatch"] != "on" ||
		events[0].Detail["changed"] != "edispatch,einvoicing" {
		t.Fatalf("audit = %+v", events)
	}
	code, body := f.do(t, f.operator, http.MethodGet, "/settings", "")
	settings := decodeInto[domain.OrganizationSettings](t, code, http.StatusOK, body)
	if !settings.Modules.EInvoicing || !settings.Modules.EDispatch {
		t.Fatalf("settings modules = %+v", settings.Modules)
	}
}

func TestSettingsSellerIdentity(t *testing.T) {
	f := newModuleFixture(t, false)
	identity := `{"sellerIdentity":{"legalName":"Primer d.o.o.","pib":"101234569","mb":"12345678","street":"Bulevar 1",` +
		`"city":"Novi Sad","postalCode":"21000","countryCode":"","bankAccount":"160-12345-67","vatPayer":true,"email":null}}`
	if code, body := f.do(t, f.operator, http.MethodPut, "/settings", identity); code != http.StatusForbidden {
		t.Fatalf("operator save = %d %s", code, body)
	}
	code, body := f.do(t, f.admin, http.MethodPut, "/settings", identity)
	settings := decodeInto[domain.OrganizationSettings](t, code, http.StatusOK, body)
	if settings.SellerIdentity == nil || settings.SellerIdentity.CountryCode != "RS" ||
		settings.SellerIdentity.BankAccount != "160-0000000012345-67" {
		t.Fatalf("saved = %+v", settings.SellerIdentity)
	}
	bad := strings.Replace(identity, `"101234569"`, `"101234568"`, 1)
	if code, body := f.do(t, f.admin, http.MethodPut, "/settings", bad); code != http.StatusUnprocessableEntity ||
		!strings.Contains(string(body), "PIB firme") {
		t.Fatalf("bad PIB = %d %s", code, body)
	}
}

func (f processFixture) tenantID(t *testing.T) string {
	t.Helper()
	tenant, err := f.sqlite.TenantBySlug(t.Context(), "demo")
	if err != nil || tenant == nil {
		t.Fatalf("demo tenant = %v, %v", tenant, err)
	}
	return tenant.ID
}
