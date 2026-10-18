package api

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

const offsetGraph = `{"nodes":[
	{"id":"paper","kind":"input","label":"Papir","x":0,"y":0,"quantity":500,"unit":"kom"},
	{"id":"print","kind":"step","label":"Štampa","x":200,"y":0,"status":"done","quantity":9},
	{"id":"cut","kind":"step","label":"Sečenje","x":400,"y":0},
	{"id":"out","kind":"product","label":"Gotovi otisci","x":600,"y":0,"actualQuantity":3},
	{"id":"waste","kind":"byproduct","label":"Makulatura","x":600,"y":100}
],"edges":[
	{"id":"e1","source":"paper","target":"print"},
	{"id":"e2","source":"print","target":"cut"},
	{"id":"e3","source":"cut","target":"out"},
	{"id":"e4","source":"cut","target":"waste"}
]}`

func templateBody(name string, isDefault bool, graph string) string {
	def := "false"
	if isDefault {
		def = "true"
	}
	return `{"name":"` + name + `","description":"opis","isDefault":` + def + `,"graph":` + graph + `}`
}

type processFixture struct {
	server     *Server
	sqlite     *store.SQLiteStore
	admin      string
	operator   string
	otherAdmin string
	orderID    string
}

// newProcessFixture builds a server whose demo and "other" organizations have
// both modules switched on, the precondition of every process/stock route.
func newProcessFixture(t *testing.T) processFixture {
	t.Helper()
	return newModuleFixture(t, true)
}

// newModuleFixture is newProcessFixture with the modules either on or left at
// their default (off) for both organizations.
func newModuleFixture(t *testing.T, modulesOn bool) processFixture {
	t.Helper()
	server, adminToken, userToken := newServerWithRoles(t)
	sqliteStore := server.store.(*store.SQLiteStore)
	ctx := context.Background()
	if err := sqliteStore.EnsureTenant(ctx, "tenant-other", "other", "Other"); err != nil {
		t.Fatal(err)
	}
	otherCtx := store.ContextWithTenant(ctx, "tenant-other")
	if err := sqliteStore.CreateUser(otherCtx, "other-admin", "otheradmin", "other123", domain.RoleAdmin, false); err != nil {
		t.Fatal(err)
	}
	user, err := sqliteStore.AuthenticateUser(ctx, "tenant-other", "otheradmin", "other123")
	if err != nil || user == nil {
		t.Fatalf("authenticate other admin: %v", err)
	}
	otherToken, err := sqliteStore.CreateSession(ctx, user.ID, time.Now().Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if modulesOn {
		on := true
		for _, slug := range []string{store.DemoTenantSlug, "other"} {
			if _, err := sqliteStore.SetTenantModules(ctx, slug, domain.OrganizationModulesUpdate{Processes: &on, Stock: &on}); err != nil {
				t.Fatal(err)
			}
		}
	}
	order, err := sqliteStore.CreateWorkOrder(store.ContextWithTenant(ctx, store.DemoTenantID), domain.CreateWorkOrderInput{
		ClientName: "Alfa", JobDescription: "Posao", IssuedBy: "admin", IssueDate: "2026-06-02",
		Assignment: domain.Assignment{Priority: "normal"},
	})
	if err != nil {
		t.Fatal(err)
	}
	return processFixture{server: server, sqlite: sqliteStore, admin: adminToken, operator: userToken, otherAdmin: otherToken, orderID: order.ID}
}

func (f processFixture) do(t *testing.T, token, method, path, body string) (int, []byte) {
	t.Helper()
	rec := roleRequest(t, f.server, token, method, path, body)
	return rec.Code, rec.Body.Bytes()
}

func (f processFixture) createTemplate(t *testing.T, name string, isDefault bool) domain.ProcessTemplate {
	t.Helper()
	code, body := f.do(t, f.admin, http.MethodPost, "/process-templates", templateBody(name, isDefault, offsetGraph))
	var template domain.ProcessTemplate
	if code != http.StatusCreated || json.Unmarshal(body, &template) != nil {
		t.Fatalf("create template = %d %s", code, body)
	}
	return template
}

func decodeProcess(t *testing.T, code, want int, body []byte) domain.WorkOrderProcess {
	t.Helper()
	var process domain.WorkOrderProcess
	if code != want || json.Unmarshal(body, &process) != nil {
		t.Fatalf("process = %d %s, want %d", code, body, want)
	}
	return process
}

func TestProcessTemplateCRUDAndAdminGating(t *testing.T) {
	f := newProcessFixture(t)

	if code, _ := f.do(t, "", http.MethodGet, "/process-templates", ""); code != http.StatusUnauthorized {
		t.Fatalf("anonymous list = %d, want 401", code)
	}
	if code, _ := f.do(t, f.operator, http.MethodPost, "/process-templates", templateBody("Offset", false, offsetGraph)); code != http.StatusForbidden {
		t.Fatalf("operator create = %d, want 403", code)
	}

	template := f.createTemplate(t, "Offset štampa", false)
	// Per-order state is stripped from a template.
	for _, node := range template.Graph.Nodes {
		if node.Status != "" || node.ActualQuantity != nil {
			t.Fatalf("template kept state: %+v", node)
		}
		if node.Kind == domain.ProcessNodeStep && (node.Quantity != nil) {
			t.Fatalf("step kept quantity: %+v", node)
		}
	}
	if template.Description != "opis" || template.CreatedAt == "" {
		t.Fatalf("template = %+v", template)
	}

	// Operators can read.
	code, body := f.do(t, f.operator, http.MethodGet, "/process-templates/"+template.ID, "")
	var read domain.ProcessTemplate
	if code != http.StatusOK || json.Unmarshal(body, &read) != nil || read.ID != template.ID {
		t.Fatalf("operator read = %d %s", code, body)
	}
	if code, _ := f.do(t, f.operator, http.MethodGet, "/process-templates/nope", ""); code != http.StatusNotFound {
		t.Fatalf("unknown template = %d, want 404", code)
	}

	// Duplicate name, validation.
	code, body = f.do(t, f.admin, http.MethodPost, "/process-templates", templateBody("Offset štampa", false, offsetGraph))
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("duplicate = %d, want 422", code)
	}
	assertErrorResponse(t, body, "Proces sa tim nazivom već postoji.")
	if code, _ := f.do(t, f.admin, http.MethodPost, "/process-templates", templateBody("  ", false, offsetGraph)); code != http.StatusUnprocessableEntity {
		t.Fatalf("blank name = %d, want 422", code)
	}

	// Update.
	code, body = f.do(t, f.admin, http.MethodPut, "/process-templates/"+template.ID, templateBody("Offset v2", false, offsetGraph))
	var updated domain.ProcessTemplate
	if code != http.StatusOK || json.Unmarshal(body, &updated) != nil || updated.Name != "Offset v2" || updated.CreatedAt != template.CreatedAt {
		t.Fatalf("update = %d %s", code, body)
	}
	if code, _ := f.do(t, f.operator, http.MethodPut, "/process-templates/"+template.ID, templateBody("X", false, offsetGraph)); code != http.StatusForbidden {
		t.Fatalf("operator update = %d, want 403", code)
	}
	if code, _ := f.do(t, f.admin, http.MethodPut, "/process-templates/nope", templateBody("X", false, offsetGraph)); code != http.StatusNotFound {
		t.Fatalf("update unknown = %d, want 404", code)
	}

	// Delete.
	if code, _ := f.do(t, f.operator, http.MethodDelete, "/process-templates/"+template.ID, ""); code != http.StatusForbidden {
		t.Fatalf("operator delete = %d, want 403", code)
	}
	if code, _ := f.do(t, f.admin, http.MethodDelete, "/process-templates/"+template.ID, ""); code != http.StatusNoContent {
		t.Fatalf("delete = %d, want 204", code)
	}
	if code, _ := f.do(t, f.admin, http.MethodDelete, "/process-templates/"+template.ID, ""); code != http.StatusNotFound {
		t.Fatalf("delete again = %d, want 404", code)
	}
}

func TestProcessTemplateDefaultExclusivityAndOrder(t *testing.T) {
	f := newProcessFixture(t)
	b := f.createTemplate(t, "B proces", false)
	a := f.createTemplate(t, "A proces", true)
	if !a.IsDefault {
		t.Fatal("A should be default")
	}
	c := f.createTemplate(t, "C proces", true)

	code, body := f.do(t, f.operator, http.MethodGet, "/process-templates", "")
	var list []domain.ProcessTemplate
	if code != http.StatusOK || json.Unmarshal(body, &list) != nil || len(list) != 3 {
		t.Fatalf("list = %d %s", code, body)
	}
	if list[0].ID != c.ID || !list[0].IsDefault || list[1].ID != a.ID || list[1].IsDefault || list[2].ID != b.ID {
		t.Fatalf("order/default = %+v", list)
	}

	// Promote B through update.
	if code, _ := f.do(t, f.admin, http.MethodPut, "/process-templates/"+b.ID, templateBody("B proces", true, offsetGraph)); code != http.StatusOK {
		t.Fatalf("promote = %d", code)
	}
	_, body = f.do(t, f.admin, http.MethodGet, "/process-templates", "")
	_ = json.Unmarshal(body, &list)
	defaults := 0
	for _, template := range list {
		if template.IsDefault {
			defaults++
		}
	}
	if defaults != 1 || list[0].ID != b.ID {
		t.Fatalf("defaults = %d, list = %+v", defaults, list)
	}
}

func TestProcessTemplateRejectsInvalidGraphs(t *testing.T) {
	f := newProcessFixture(t)
	cycle := `{"nodes":[{"id":"a","kind":"step","label":"A","x":0,"y":0},{"id":"b","kind":"step","label":"B","x":0,"y":0}],
		"edges":[{"id":"e1","source":"a","target":"b"},{"id":"e2","source":"b","target":"a"}]}`
	intoInput := `{"nodes":[{"id":"a","kind":"step","label":"A","x":0,"y":0},{"id":"i","kind":"input","label":"I","x":0,"y":0}],
		"edges":[{"id":"e1","source":"a","target":"i"}]}`
	noStep := `{"nodes":[{"id":"i","kind":"input","label":"I","x":0,"y":0}],"edges":[]}`
	for name, graph := range map[string]string{"cycle": cycle, "target is input": intoInput, "no step": noStep, "empty": `{"nodes":[],"edges":[]}`} {
		code, body := f.do(t, f.admin, http.MethodPost, "/process-templates", templateBody("Neispravan "+name, false, graph))
		if code != http.StatusUnprocessableEntity {
			t.Errorf("%s = %d %s, want 422", name, code, body)
		}
	}
}

func TestApplyProcessTemplateAndOperatorRule(t *testing.T) {
	f := newProcessFixture(t)
	template := f.createTemplate(t, "Offset", false)
	path := "/work-orders/" + f.orderID + "/process"

	if code, _ := f.do(t, f.operator, http.MethodGet, path, ""); code != http.StatusNotFound {
		t.Fatalf("get before apply = %d, want 404", code)
	}
	if code, _ := f.do(t, f.operator, http.MethodPut, path, `{"graph":`+offsetGraph+`}`); code != http.StatusNotFound {
		t.Fatalf("put before apply = %d, want 404", code)
	}
	apply := `{"templateId":"` + template.ID + `"}`
	if code, _ := f.do(t, f.operator, http.MethodPost, "/work-orders/missing/process", apply); code != http.StatusNotFound {
		t.Fatalf("apply unknown order = %d, want 404", code)
	}
	if code, _ := f.do(t, f.operator, http.MethodPost, path, `{"templateId":"nope"}`); code != http.StatusNotFound {
		t.Fatalf("apply unknown template = %d, want 404", code)
	}

	code, body := f.do(t, f.operator, http.MethodPost, path, apply)
	process := decodeProcess(t, code, http.StatusCreated, body)
	if process.WorkOrderID != f.orderID || process.TemplateID == nil || *process.TemplateID != template.ID ||
		process.TemplateName != "Offset" || process.UpdatedBy != "operater" || process.UpdatedAt == "" {
		t.Fatalf("process = %+v", process)
	}
	for _, node := range process.Graph.Nodes {
		if node.Kind == domain.ProcessNodeStep && node.Status != domain.ProcessStepPending {
			t.Fatalf("step not pending: %+v", node)
		}
	}
	code, body = f.do(t, f.operator, http.MethodPost, path, apply)
	if code != http.StatusConflict {
		t.Fatalf("second apply = %d, want 409", code)
	}
	assertErrorResponse(t, body, "Radni nalog već ima proces.")

	// Operator: state and position changes are fine.
	state := process.Graph
	state.Nodes[1].Status = domain.ProcessStepInProgress
	state.Nodes[1].Note = "u toku"
	state.Nodes[1].X = 321
	actual := 7.0
	state.Nodes[3].ActualQuantity = &actual
	code, body = f.do(t, f.operator, http.MethodPut, path, mustJSON(t, domain.WorkOrderProcessInput{Graph: state}))
	changed := decodeProcess(t, code, http.StatusOK, body)
	if changed.Graph.Nodes[1].Status != domain.ProcessStepInProgress || changed.Graph.Nodes[1].X != 321 ||
		changed.Graph.Nodes[3].ActualQuantity == nil || *changed.Graph.Nodes[3].ActualQuantity != 7 {
		t.Fatalf("changed = %+v", changed.Graph.Nodes)
	}

	// Operator: structural change is forbidden and does not persist.
	structural := changed.Graph
	structural.Nodes[1].Label = "Drugačiji naziv"
	code, body = f.do(t, f.operator, http.MethodPut, path, mustJSON(t, domain.WorkOrderProcessInput{Graph: structural}))
	if code != http.StatusForbidden {
		t.Fatalf("operator structural = %d, want 403", code)
	}
	assertErrorResponse(t, body, "Samo administrator može menjati strukturu procesa.")
	added := changed.Graph
	added.Nodes = append(added.Nodes, domain.ProcessNode{ID: "pack", Kind: domain.ProcessNodeStep, Label: "Pakovanje"})
	if code, _ := f.do(t, f.operator, http.MethodPut, path, mustJSON(t, domain.WorkOrderProcessInput{Graph: added})); code != http.StatusForbidden {
		t.Fatalf("operator add node = %d, want 403", code)
	}
	code, body = f.do(t, f.operator, http.MethodGet, path, "")
	if got := decodeProcess(t, code, http.StatusOK, body); got.Graph.Nodes[1].Label != "Štampa" || len(got.Graph.Nodes) != 5 {
		t.Fatalf("structural change leaked: %+v", got.Graph.Nodes)
	}

	// Admin: structure may change; new steps default to pending.
	code, body = f.do(t, f.admin, http.MethodPut, path, mustJSON(t, domain.WorkOrderProcessInput{Graph: added}))
	got := decodeProcess(t, code, http.StatusOK, body)
	if len(got.Graph.Nodes) != 6 || got.Graph.Nodes[5].Status != domain.ProcessStepPending || got.UpdatedBy != "admin" {
		t.Fatalf("admin update = %+v", got)
	}

	// Invalid graphs are 422 for everyone.
	cyclic := got.Graph
	cyclic.Edges = append(cyclic.Edges, domain.ProcessEdge{ID: "back", Source: "cut", Target: "print"})
	for _, token := range []string{f.admin, f.operator} {
		if code, _ := f.do(t, token, http.MethodPut, path, mustJSON(t, domain.WorkOrderProcessInput{Graph: cyclic})); code != http.StatusUnprocessableEntity {
			t.Fatalf("cycle = %d, want 422", code)
		}
	}
	toInput := got.Graph
	toInput.Edges = append(toInput.Edges, domain.ProcessEdge{ID: "bad", Source: "cut", Target: "paper"})
	if code, _ := f.do(t, f.admin, http.MethodPut, path, mustJSON(t, domain.WorkOrderProcessInput{Graph: toInput})); code != http.StatusUnprocessableEntity {
		t.Fatalf("input as target = %d, want 422", code)
	}

	// Only admins delete the process.
	if code, _ := f.do(t, f.operator, http.MethodDelete, path, ""); code != http.StatusForbidden {
		t.Fatalf("operator delete = %d, want 403", code)
	}
	if code, _ := f.do(t, f.admin, http.MethodDelete, path, ""); code != http.StatusNoContent {
		t.Fatalf("admin delete = %d, want 204", code)
	}
	if code, _ := f.do(t, f.admin, http.MethodDelete, path, ""); code != http.StatusNotFound {
		t.Fatalf("delete again = %d, want 404", code)
	}
	if code, _ := f.do(t, f.admin, http.MethodGet, path, ""); code != http.StatusNotFound {
		t.Fatalf("get after delete = %d, want 404", code)
	}
}

func mustJSON(t *testing.T, value any) string {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func TestCreateWorkOrderAttachesDefaultProcess(t *testing.T) {
	f := newProcessFixture(t)
	create := `{"clientName":"Beta","jobDescription":"Posao","issuedBy":"admin","issueDate":"2026-06-03","assignment":{"priority":"normal"}}`
	newOrder := func() string {
		code, body := f.do(t, f.operator, http.MethodPost, "/work-orders", create)
		var order domain.WorkOrder
		if code != http.StatusCreated || json.Unmarshal(body, &order) != nil {
			t.Fatalf("create order = %d %s", code, body)
		}
		return order.ID
	}

	withoutDefault := newOrder()
	if code, _ := f.do(t, f.admin, http.MethodGet, "/work-orders/"+withoutDefault+"/process", ""); code != http.StatusNotFound {
		t.Fatalf("no default => process = %d, want 404", code)
	}

	template := f.createTemplate(t, "Podrazumevani", true)
	withDefault := newOrder()
	code, body := f.do(t, f.admin, http.MethodGet, "/work-orders/"+withDefault+"/process", "")
	process := decodeProcess(t, code, http.StatusOK, body)
	if process.TemplateID == nil || *process.TemplateID != template.ID || process.TemplateName != "Podrazumevani" || len(process.Graph.Nodes) != 5 {
		t.Fatalf("attached = %+v", process)
	}

	// Deleting the template keeps the order's graph with a null templateId.
	if code, _ := f.do(t, f.admin, http.MethodDelete, "/process-templates/"+template.ID, ""); code != http.StatusNoContent {
		t.Fatalf("delete template = %d", code)
	}
	code, body = f.do(t, f.admin, http.MethodGet, "/work-orders/"+withDefault+"/process", "")
	process = decodeProcess(t, code, http.StatusOK, body)
	if process.TemplateID != nil || process.TemplateName != "Podrazumevani" || len(process.Graph.Nodes) != 5 {
		t.Fatalf("after template delete = %+v", process)
	}
	var raw map[string]json.RawMessage
	_ = json.Unmarshal(body, &raw)
	if string(raw["templateId"]) != "null" {
		t.Fatalf("templateId JSON = %s, want null", raw["templateId"])
	}

	// Deleting the work order removes its process.
	if code, _ := f.do(t, f.admin, http.MethodDelete, "/work-orders/"+withDefault, ""); code != http.StatusOK {
		t.Fatalf("delete order = %d", code)
	}
	if got, err := f.sqlite.WorkOrderProcess(store.ContextWithTenant(context.Background(), store.DemoTenantID), withDefault); err != nil || got != nil {
		t.Fatalf("process after order delete = %+v, %v", got, err)
	}
}

func TestProcessTenantIsolation(t *testing.T) {
	f := newProcessFixture(t)
	template := f.createTemplate(t, "Offset", false)
	path := "/work-orders/" + f.orderID + "/process"
	f.do(t, f.admin, http.MethodPost, path, `{"templateId":"`+template.ID+`"}`)

	code, body := f.do(t, f.otherAdmin, http.MethodGet, "/process-templates", "")
	var list []domain.ProcessTemplate
	if code != http.StatusOK || json.Unmarshal(body, &list) != nil || len(list) != 0 {
		t.Fatalf("other list = %d %s", code, body)
	}
	if code, _ := f.do(t, f.otherAdmin, http.MethodGet, "/process-templates/"+template.ID, ""); code != http.StatusNotFound {
		t.Fatalf("other read = %d, want 404", code)
	}
	if code, _ := f.do(t, f.otherAdmin, http.MethodPut, "/process-templates/"+template.ID, templateBody("X", false, offsetGraph)); code != http.StatusNotFound {
		t.Fatalf("other update = %d, want 404", code)
	}
	if code, _ := f.do(t, f.otherAdmin, http.MethodDelete, "/process-templates/"+template.ID, ""); code != http.StatusNotFound {
		t.Fatalf("other delete = %d, want 404", code)
	}
	if code, _ := f.do(t, f.otherAdmin, http.MethodGet, path, ""); code != http.StatusNotFound {
		t.Fatalf("other read process = %d, want 404", code)
	}
	if code, _ := f.do(t, f.otherAdmin, http.MethodPut, path, `{"graph":`+offsetGraph+`}`); code != http.StatusNotFound {
		t.Fatalf("other update process = %d, want 404", code)
	}
	if code, _ := f.do(t, f.otherAdmin, http.MethodDelete, path, ""); code != http.StatusNotFound {
		t.Fatalf("other delete process = %d, want 404", code)
	}
	// The same name is free in another tenant, and applying a foreign template fails.
	if code, _ := f.do(t, f.otherAdmin, http.MethodPost, "/process-templates", templateBody("Offset", false, offsetGraph)); code != http.StatusCreated {
		t.Fatalf("other create = %d, want 201", code)
	}
	if code, _ := f.do(t, f.otherAdmin, http.MethodPost, path, `{"templateId":"`+template.ID+`"}`); code != http.StatusNotFound {
		t.Fatalf("other apply on foreign order = %d, want 404", code)
	}
	// Both stayed intact.
	if code, _ := f.do(t, f.admin, http.MethodGet, path, ""); code != http.StatusOK {
		t.Fatalf("owner process = %d, want 200", code)
	}
}

func TestPlatformProcessTemplates(t *testing.T) {
	f := newProcessFixture(t)
	server := f.server
	tenantCookie := &http.Cookie{Name: server.config.SessionCookieName, Value: f.admin}
	for _, route := range []struct{ method, path string }{
		{http.MethodGet, "/platform/tenants/demo/process-templates"},
		{http.MethodPost, "/platform/tenants/demo/process-templates"},
		{http.MethodPut, "/platform/tenants/demo/process-templates/x"},
		{http.MethodDelete, "/platform/tenants/demo/process-templates/x"},
	} {
		if rec := platformRequest(t, server, nil, route.method, route.path, `{}`); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s anonymous = %d, want 401", route.method, route.path, rec.Code)
		}
		if rec := platformRequest(t, server, tenantCookie, route.method, route.path, `{}`); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s tenant session = %d, want 401", route.method, route.path, rec.Code)
		}
	}

	cookie := signedInPlatform(t, server)
	base := "/platform/tenants/demo/process-templates"
	if rec := platformRequest(t, server, cookie, http.MethodGet, "/platform/tenants/missing/process-templates", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("unknown org list = %d, want 404", rec.Code)
	}
	if rec := platformRequest(t, server, cookie, http.MethodPost, "/platform/tenants/missing/process-templates", templateBody("X", false, offsetGraph)); rec.Code != http.StatusNotFound {
		t.Fatalf("unknown org create = %d, want 404", rec.Code)
	}
	if rec := platformRequest(t, server, cookie, http.MethodPost, base, templateBody("Neispravan", false, `{"nodes":[],"edges":[]}`)); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid graph = %d, want 422", rec.Code)
	}

	rec := platformRequest(t, server, cookie, http.MethodPost, base, templateBody("Backoffice proces", true, offsetGraph))
	var created domain.ProcessTemplate
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil || rec.Code != http.StatusCreated || !created.IsDefault {
		t.Fatalf("create = %d %s", rec.Code, rec.Body.String())
	}
	rec = platformRequest(t, server, cookie, http.MethodPut, base+"/"+created.ID, templateBody("Backoffice v2", true, offsetGraph))
	var updated domain.ProcessTemplate
	if err := json.Unmarshal(rec.Body.Bytes(), &updated); err != nil || rec.Code != http.StatusOK || updated.Name != "Backoffice v2" {
		t.Fatalf("update = %d %s", rec.Code, rec.Body.String())
	}
	if rec := platformRequest(t, server, cookie, http.MethodPut, base+"/nope", templateBody("X", false, offsetGraph)); rec.Code != http.StatusNotFound {
		t.Fatalf("update unknown template = %d, want 404", rec.Code)
	}
	rec = platformRequest(t, server, cookie, http.MethodGet, base, "")
	var list []domain.ProcessTemplate
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil || rec.Code != http.StatusOK || len(list) != 1 {
		t.Fatalf("list = %d %s", rec.Code, rec.Body.String())
	}
	// The organization itself sees it.
	if code, _ := f.do(t, f.operator, http.MethodGet, "/process-templates/"+created.ID, ""); code != http.StatusOK {
		t.Fatalf("tenant read = %d, want 200", code)
	}
	// Other organizations do not.
	if rec := platformRequest(t, server, cookie, http.MethodGet, "/platform/tenants/other/process-templates", ""); rec.Code != http.StatusOK || rec.Body.String() != "[]\n" {
		t.Fatalf("other org list = %d %q", rec.Code, rec.Body.String())
	}
	if rec := platformRequest(t, server, cookie, http.MethodDelete, base+"/"+created.ID, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete = %d", rec.Code)
	}
	if rec := platformRequest(t, server, cookie, http.MethodDelete, base+"/"+created.ID, ""); rec.Code != http.StatusNotFound {
		t.Fatalf("delete again = %d, want 404", rec.Code)
	}

	events := auditActions(t, server, cookie)
	if len(events) != 3 {
		t.Fatalf("audit = %+v", events)
	}
	want := []struct{ action, name string }{
		{domain.AuditProcessTemplateDelete, "Backoffice v2"},
		{domain.AuditProcessTemplateUpdate, "Backoffice v2"},
		{domain.AuditProcessTemplateCreate, "Backoffice proces"},
	}
	for i, w := range want {
		if events[i].Action != w.action || events[i].Detail["name"] != w.name || events[i].TenantSlug != "demo" || events[i].AdminUsername != "ops" {
			t.Errorf("audit[%d] = %+v, want %+v", i, events[i], w)
		}
	}
}
