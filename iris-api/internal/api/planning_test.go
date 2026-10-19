package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

const planningDisabled = "Modul „Planiranje“ nije uključen za ovu organizaciju."

// planningToday is Monday 2026-10-19, 06:00 in Europe/Belgrade (UTC+2).
var planningToday = time.Date(2026, 10, 19, 4, 0, 0, 0, time.UTC)

func (f processFixture) setPlanning(t *testing.T, planning bool) {
	t.Helper()
	on := true
	for _, slug := range []string{store.DemoTenantSlug, "other"} {
		if _, err := f.sqlite.SetTenantModules(t.Context(), slug, domain.OrganizationModulesUpdate{Stock: &on, Processes: &on, Attendance: &on, Planning: &planning}); err != nil {
			t.Fatal(err)
		}
	}
}

func newPlanningFixture(t *testing.T) processFixture {
	t.Helper()
	f := newModuleFixture(t, false)
	f.setPlanning(t, true)
	f.sqlite.SetClock(func() time.Time { return planningToday })
	return f
}

// call sends a request as token and decodes a JSON answer into T when the
// status is the expected one.
func call[T any](t *testing.T, f processFixture, token, method, path, body string, want int) T {
	t.Helper()
	code, raw := f.do(t, token, method, path, body)
	var out T
	if code != want {
		t.Fatalf("%s %s = %d %s, want %d", method, path, code, raw, want)
	}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return out
}

func expectError(t *testing.T, f processFixture, token, method, path, body string, want int, message string) {
	t.Helper()
	code, raw := f.do(t, token, method, path, body)
	if code != want {
		t.Fatalf("%s %s = %d %s, want %d", method, path, code, raw, want)
	}
	if message != "" {
		assertErrorResponse(t, raw, message)
	}
}

type planningRoute struct{ method, path, body string }

var planningRoutes = []planningRoute{
	{http.MethodGet, "/machine-types", ""},
	{http.MethodPost, "/machine-types", `{"name":"X"}`},
	{http.MethodPut, "/machine-types/x", `{"name":"X"}`},
	{http.MethodDelete, "/machine-types/x", ""},
	{http.MethodGet, "/machines", ""},
	{http.MethodPost, "/machines", `{"machineTypeId":"x","name":"X","inService":true}`},
	{http.MethodPut, "/machines/x", `{"machineTypeId":"x","name":"X","inService":true}`},
	{http.MethodDelete, "/machines/x", ""},
	{http.MethodGet, "/planning/qualifications", ""},
	{http.MethodPut, "/planning/qualifications/user-1", `{"machineTypeIds":[]}`},
	{http.MethodGet, "/planning/working-hours", ""},
	{http.MethodPut, "/planning/working-hours", `{"timeZone":"UTC","days":[]}`},
	{http.MethodGet, "/planning/plan", ""},
	{http.MethodPost, "/planning/plan/generate", `{"date":"2026-10-19"}`},
	{http.MethodPut, "/planning/plan/draft", `{"date":"2026-10-19","assignments":[]}`},
	{http.MethodDelete, "/planning/plan/draft?date=2026-10-19", ""},
	{http.MethodPost, "/planning/plan/publish", `{"date":"2026-10-19"}`},
	{http.MethodGet, "/planning/my-queue", ""},
	{http.MethodGet, "/planning/forecast", ""},
}

// adminOnly lists the routes an operator may not call.
func (r planningRoute) adminOnly() bool { return r.method != http.MethodGet }

func TestPlanningRoutesForbiddenWhileModuleOff(t *testing.T) {
	f := newModuleFixture(t, false)
	check := func(label string) {
		t.Helper()
		for _, route := range planningRoutes {
			for _, token := range []string{f.admin, f.operator} {
				code, body := f.do(t, token, route.method, route.path, route.body)
				var payload struct {
					Error string `json:"error"`
				}
				_ = json.Unmarshal(body, &payload)
				if code != http.StatusForbidden || payload.Error != planningDisabled {
					t.Errorf("%s: %s %s = %d %s", label, route.method, route.path, code, body)
				}
			}
		}
	}
	check("default")
	// Processes and stock on, planning still off.
	f.setModules(t, true, true)
	check("planning off")
	// Not signed in.
	for _, route := range planningRoutes {
		if code, _ := f.do(t, "", route.method, route.path, route.body); code != http.StatusUnauthorized {
			t.Errorf("anonymous %s %s = %d, want 401", route.method, route.path, code)
		}
	}
	// With all four on, the routes open.
	on := true
	if _, err := f.sqlite.SetTenantModules(t.Context(), "demo", domain.OrganizationModulesUpdate{Stock: &on, Processes: &on, Attendance: &on, Planning: &on}); err != nil {
		t.Fatal(err)
	}
	if code, _ := f.do(t, f.operator, http.MethodGet, "/planning/forecast", ""); code != http.StatusOK {
		t.Fatalf("forecast with planning on = %d", code)
	}
}

func TestPlanningOperatorsCannotWrite(t *testing.T) {
	f := newPlanningFixture(t)
	for _, route := range planningRoutes {
		code, body := f.do(t, f.operator, route.method, route.path, route.body)
		if route.adminOnly() {
			if code != http.StatusForbidden {
				t.Errorf("operator %s %s = %d %s, want 403", route.method, route.path, code, body)
			}
			assertErrorResponse(t, body, "Nemate dozvolu za ovu akciju.")
		} else if code != http.StatusOK {
			t.Errorf("operator %s %s = %d %s, want 200", route.method, route.path, code, body)
		}
	}
}

func TestMachineTypeAndMachineEndpoints(t *testing.T) {
	f := newPlanningFixture(t)

	machineType := call[domain.MachineType](t, f, f.admin, http.MethodPost, "/machine-types", `{"name":"Offset štampa"}`, http.StatusCreated)
	if machineType.ID == "" || machineType.Name != "Offset štampa" {
		t.Fatalf("created = %+v", machineType)
	}
	expectError(t, f, f.admin, http.MethodPost, "/machine-types", `{"name":"Offset štampa"}`, http.StatusConflict, "Tip mašine sa tim nazivom već postoji.")
	expectError(t, f, f.admin, http.MethodPost, "/machine-types", `{"name":"  "}`, http.StatusUnprocessableEntity, "Naziv tipa mašine je obavezan.")
	expectError(t, f, f.admin, http.MethodPost, "/machine-types", `{"name":"`+strings.Repeat("x", 121)+`"}`, http.StatusUnprocessableEntity, "")
	expectError(t, f, f.admin, http.MethodPost, "/machine-types", `{`, http.StatusBadRequest, "")
	other := call[domain.MachineType](t, f, f.admin, http.MethodPost, "/machine-types", `{"name":"Sečenje"}`, http.StatusCreated)
	expectError(t, f, f.admin, http.MethodPut, "/machine-types/"+other.ID, `{"name":"Offset štampa"}`, http.StatusConflict, "")
	renamed := call[domain.MachineType](t, f, f.admin, http.MethodPut, "/machine-types/"+other.ID, `{"name":"Giljotina"}`, http.StatusOK)
	if renamed.Name != "Giljotina" {
		t.Fatalf("renamed = %+v", renamed)
	}
	expectError(t, f, f.admin, http.MethodPut, "/machine-types/nope", `{"name":"X"}`, http.StatusNotFound, "Tip mašine nije pronađen.")
	// Another organization's admin cannot touch it.
	expectError(t, f, f.otherAdmin, http.MethodPut, "/machine-types/"+other.ID, `{"name":"X"}`, http.StatusNotFound, "")
	if types := call[[]domain.MachineType](t, f, f.operator, http.MethodGet, "/machine-types", "", http.StatusOK); len(types) != 2 || types[0].Name != "Giljotina" {
		t.Fatalf("types = %+v", types)
	}
	if types := call[[]domain.MachineType](t, f, f.otherAdmin, http.MethodGet, "/machine-types", "", http.StatusOK); len(types) != 0 {
		t.Fatalf("other organization sees %+v", types)
	}

	body := `{"machineTypeId":"` + machineType.ID + `","name":"Heidelberg #1","inService":true,"note":"stara"}`
	machine := call[domain.Machine](t, f, f.admin, http.MethodPost, "/machines", body, http.StatusCreated)
	if machine.ID == "" || machine.MachineTypeID != machineType.ID || !machine.InService || machine.Note != "stara" {
		t.Fatalf("machine = %+v", machine)
	}
	expectError(t, f, f.admin, http.MethodPost, "/machines", body, http.StatusConflict, "Mašina sa tim nazivom već postoji.")
	expectError(t, f, f.admin, http.MethodPost, "/machines", `{"machineTypeId":"nope","name":"M2","inService":true}`, http.StatusUnprocessableEntity, "Tip mašine nije pronađen.")
	expectError(t, f, f.admin, http.MethodPost, "/machines", `{"machineTypeId":"`+machineType.ID+`","name":"","inService":true}`, http.StatusUnprocessableEntity, "Naziv mašine je obavezan.")
	expectError(t, f, f.admin, http.MethodPost, "/machines", `{"machineTypeId":"`+machineType.ID+`","name":"M2","note":"`+strings.Repeat("x", 501)+`"}`, http.StatusUnprocessableEntity, "")
	updated := call[domain.Machine](t, f, f.admin, http.MethodPut, "/machines/"+machine.ID,
		`{"machineTypeId":"`+machineType.ID+`","name":"Heidelberg #1","inService":false}`, http.StatusOK)
	if updated.InService || updated.Note != "" {
		t.Fatalf("updated = %+v", updated)
	}
	expectError(t, f, f.admin, http.MethodPut, "/machines/nope", body, http.StatusNotFound, "Mašina nije pronađena.")
	expectError(t, f, f.otherAdmin, http.MethodPut, "/machines/"+machine.ID, body, http.StatusUnprocessableEntity, "Tip mašine nije pronađen.")
	if machines := call[[]domain.Machine](t, f, f.operator, http.MethodGet, "/machines", "", http.StatusOK); len(machines) != 1 {
		t.Fatalf("machines = %+v", machines)
	}

	// A type with machines cannot go; one without can, taking its qualifications.
	expectError(t, f, f.admin, http.MethodDelete, "/machine-types/"+machineType.ID, "", http.StatusConflict, "Tip mašine se koristi za mašine.")
	call[domain.WorkerQualifications](t, f, f.admin, http.MethodPut, "/planning/qualifications/user-1", `{"machineTypeIds":["`+other.ID+`"]}`, http.StatusOK)
	expectError(t, f, f.admin, http.MethodDelete, "/machine-types/"+other.ID, "", http.StatusNoContent, "")
	expectError(t, f, f.admin, http.MethodDelete, "/machine-types/"+other.ID, "", http.StatusNotFound, "")
	for _, entry := range call[[]domain.WorkerQualifications](t, f, f.admin, http.MethodGet, "/planning/qualifications", "", http.StatusOK) {
		if len(entry.MachineTypeIDs) != 0 {
			t.Fatalf("qualification outlived its type: %+v", entry)
		}
	}
	expectError(t, f, f.otherAdmin, http.MethodDelete, "/machines/"+machine.ID, "", http.StatusNotFound, "")
	expectError(t, f, f.admin, http.MethodDelete, "/machines/"+machine.ID, "", http.StatusNoContent, "")
	expectError(t, f, f.admin, http.MethodDelete, "/machines/"+machine.ID, "", http.StatusNotFound, "")
	expectError(t, f, f.admin, http.MethodDelete, "/machine-types/"+machineType.ID, "", http.StatusNoContent, "")
}

func TestQualificationAttendanceAndWorkingHoursEndpoints(t *testing.T) {
	f := newPlanningFixture(t)
	machineType := call[domain.MachineType](t, f, f.admin, http.MethodPost, "/machine-types", `{"name":"Štampa"}`, http.StatusCreated)

	quals := call[[]domain.WorkerQualifications](t, f, f.operator, http.MethodGet, "/planning/qualifications", "", http.StatusOK)
	if len(quals) != 2 || quals[0].Username != "admin" || quals[1].Username != "operater" || quals[0].MachineTypeIDs == nil {
		t.Fatalf("qualifications = %+v", quals)
	}
	set := call[domain.WorkerQualifications](t, f, f.admin, http.MethodPut, "/planning/qualifications/user-1", `{"machineTypeIds":["`+machineType.ID+`"]}`, http.StatusOK)
	if set.UserID != "user-1" || set.Username != "operater" || len(set.MachineTypeIDs) != 1 {
		t.Fatalf("set = %+v", set)
	}
	expectError(t, f, f.admin, http.MethodPut, "/planning/qualifications/ghost", `{"machineTypeIds":[]}`, http.StatusNotFound, "Korisnik nije pronađen.")
	expectError(t, f, f.admin, http.MethodPut, "/planning/qualifications/user-1", `{"machineTypeIds":["nope"]}`, http.StatusUnprocessableEntity, "Tip mašine nije pronađen.")
	expectError(t, f, f.otherAdmin, http.MethodPut, "/planning/qualifications/user-1", `{"machineTypeIds":[]}`, http.StatusNotFound, "")

	// Working hours.
	hours := call[domain.WorkingHours](t, f, f.operator, http.MethodGet, "/planning/working-hours", "", http.StatusOK)
	if hours.TimeZone != "Europe/Belgrade" || len(hours.Days) != 5 || hours.Days[0].Breaks[0].Start != "11:00" {
		t.Fatalf("default hours = %+v", hours)
	}
	if hours.TransferMinutes != 0 {
		t.Fatalf("default inter-operation time must be 0: %+v", hours)
	}
	custom := `{"timeZone":"Europe/Belgrade","days":[{"weekday":1,"start":"06:00","end":"14:00","breaks":[{"start":"10:00","end":"10:15"}]}],"transferMinutes":20}`
	saved := call[domain.WorkingHours](t, f, f.admin, http.MethodPut, "/planning/working-hours", custom, http.StatusOK)
	if len(saved.Days) != 1 || saved.Days[0].Start != "06:00" || saved.TransferMinutes != 20 {
		t.Fatalf("saved = %+v", saved)
	}
	if again := call[domain.WorkingHours](t, f, f.operator, http.MethodGet, "/planning/working-hours", "", http.StatusOK); len(again.Days) != 1 || again.TransferMinutes != 20 {
		t.Fatalf("read back = %+v", again)
	}
	for _, bad := range []string{
		`{"timeZone":"Mars/Olympus","days":[]}`,
		`{"timeZone":"UTC","days":[],"transferMinutes":481}`,
		`{"timeZone":"UTC","days":[],"transferMinutes":-5}`,
		`{"timeZone":"UTC","days":[{"weekday":9,"start":"06:00","end":"14:00","breaks":[]}]}`,
		`{"timeZone":"UTC","days":[{"weekday":1,"start":"14:00","end":"06:00","breaks":[]}]}`,
		`{"timeZone":"UTC","days":[{"weekday":1,"start":"06:00","end":"14:00","breaks":[{"start":"13:00","end":"15:00"}]}]}`,
	} {
		code, body := f.do(t, f.admin, http.MethodPut, "/planning/working-hours", bad)
		if code != http.StatusUnprocessableEntity {
			t.Errorf("hours %s = %d %s, want 422", bad, code, body)
		}
	}
	// The hours are per organization.
	if other := call[domain.WorkingHours](t, f, f.otherAdmin, http.MethodGet, "/planning/working-hours", "", http.StatusOK); len(other.Days) != 5 {
		t.Fatalf("other organization's hours = %+v", other)
	}
}

func TestMachineTypeReferenceInProcessSaves(t *testing.T) {
	f := newPlanningFixture(t)
	machineType := call[domain.MachineType](t, f, f.admin, http.MethodPost, "/machine-types", `{"name":"Štampa"}`, http.StatusCreated)
	graphFor := func(typeID string) string {
		return `{"nodes":[
			{"id":"print","kind":"step","label":"Štampa","x":0,"y":0,"machineTypeId":"` + typeID + `","crewSize":2,"setupMinutes":15,"minutesPerUnit":0.5},
			{"id":"out","kind":"product","label":"Otisci","x":200,"y":0}
		],"edges":[{"id":"e1","source":"print","target":"out"}]}`
	}
	expectError(t, f, f.admin, http.MethodPost, "/process-templates", templateBody("Loš", false, graphFor("nope")), http.StatusUnprocessableEntity, "Tip mašine nije pronađen.")
	template := call[domain.ProcessTemplate](t, f, f.admin, http.MethodPost, "/process-templates", templateBody("Dobar", false, graphFor(machineType.ID)), http.StatusCreated)
	if node := template.Graph.Nodes[0]; node.MachineTypeID != machineType.ID || node.CrewSize == nil || *node.CrewSize != 2 {
		t.Fatalf("step = %+v", node)
	}
	expectError(t, f, f.admin, http.MethodPut, "/process-templates/"+template.ID, templateBody("Dobar", false, graphFor("nope")), http.StatusUnprocessableEntity, "Tip mašine nije pronađen.")
	call[domain.WorkOrderProcess](t, f, f.admin, http.MethodPost, "/work-orders/"+f.orderID+"/process", `{"templateId":"`+template.ID+`"}`, http.StatusCreated)
	expectError(t, f, f.admin, http.MethodPut, "/work-orders/"+f.orderID+"/process", `{"graph":`+graphFor("nope")+`}`, http.StatusUnprocessableEntity, "Tip mašine nije pronađen.")

	// The Backoffice route validates against the organization's types too.
	cookie := signedInPlatform(t, f.server)
	base := "/platform/tenants/demo/process-templates"
	if rec := platformRequest(t, f.server, cookie, http.MethodPost, base, templateBody("Backoffice loš", false, graphFor("nope"))); rec.Code != http.StatusUnprocessableEntity ||
		!strings.Contains(rec.Body.String(), "Tip mašine nije pronađen.") {
		t.Fatalf("backoffice bad type = %d %s", rec.Code, rec.Body.String())
	}
	if rec := platformRequest(t, f.server, cookie, http.MethodPost, base, templateBody("Backoffice dobar", false, graphFor(machineType.ID))); rec.Code != http.StatusCreated {
		t.Fatalf("backoffice good type = %d %s", rec.Code, rec.Body.String())
	}
	// A type of another organization is unknown.
	if rec := platformRequest(t, f.server, cookie, http.MethodPost, "/platform/tenants/other/process-templates", templateBody("Tuđ tip", false, graphFor(machineType.ID))); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("other organization's type = %d %s", rec.Code, rec.Body.String())
	}

	// Deleting the type leaves the order's process and the template saveable.
	expectError(t, f, f.admin, http.MethodDelete, "/machine-types/"+machineType.ID, "", http.StatusNoContent, "")
	call[domain.ProcessTemplate](t, f, f.admin, http.MethodPut, "/process-templates/"+template.ID, templateBody("Dobar v2", false, graphFor(machineType.ID)), http.StatusOK)
	process := call[domain.WorkOrderProcess](t, f, f.admin, http.MethodGet, "/work-orders/"+f.orderID+"/process", "", http.StatusOK)
	process.Graph.Nodes[1].Label = "Otisci v2"
	raw, _ := json.Marshal(domain.WorkOrderProcessInput{Graph: process.Graph})
	call[domain.WorkOrderProcess](t, f, f.admin, http.MethodPut, "/work-orders/"+f.orderID+"/process", string(raw), http.StatusOK)
	// An operator saving only step status is not blocked by the stale type.
	process.Graph.Nodes[0].Status = domain.ProcessStepInProgress
	raw, _ = json.Marshal(domain.WorkOrderProcessInput{Graph: process.Graph})
	call[domain.WorkOrderProcess](t, f, f.operator, http.MethodPut, "/work-orders/"+f.orderID+"/process", string(raw), http.StatusOK)
}

// planningSetup creates a type, one machine, a qualified present operator and
// a process with a machine step on the fixture's work order.
func planningSetup(t *testing.T, f processFixture) {
	t.Helper()
	machineType := call[domain.MachineType](t, f, f.admin, http.MethodPost, "/machine-types", `{"name":"Štampa"}`, http.StatusCreated)
	call[domain.Machine](t, f, f.admin, http.MethodPost, "/machines", `{"machineTypeId":"`+machineType.ID+`","name":"M1","inService":true}`, http.StatusCreated)
	call[domain.WorkerQualifications](t, f, f.admin, http.MethodPut, "/planning/qualifications/user-1", `{"machineTypeIds":["`+machineType.ID+`"]}`, http.StatusOK)
	call[domain.AttendanceEntry](t, f, f.admin, http.MethodPut, "/attendance/user-1", `{"date":"2026-10-19","present":true}`, http.StatusOK)
	graph := `{"nodes":[
		{"id":"print","kind":"step","label":"Štampa","x":0,"y":0,"machineTypeId":"` + machineType.ID + `","setupMinutes":30,"minutesPerUnit":0.1},
		{"id":"out","kind":"product","label":"Otisci","x":200,"y":0}
	],"edges":[{"id":"e1","source":"print","target":"out"}]}`
	template := call[domain.ProcessTemplate](t, f, f.admin, http.MethodPost, "/process-templates", templateBody("Štampa", false, graph), http.StatusCreated)
	call[domain.WorkOrderProcess](t, f, f.admin, http.MethodPost, "/work-orders/"+f.orderID+"/process", `{"templateId":"`+template.ID+`"}`, http.StatusCreated)
}

func TestPlanningPlanEndpoints(t *testing.T) {
	f := newPlanningFixture(t)
	planningSetup(t, f)
	const today = "2026-10-19"

	// Nothing planned yet.
	day := call[domain.PlanDay](t, f, f.admin, http.MethodGet, "/planning/plan", "", http.StatusOK)
	if day.Date != today || day.Draft != nil || day.Published != nil || day.Drift != nil {
		t.Fatalf("empty day = %+v", day)
	}
	expectError(t, f, f.admin, http.MethodGet, "/planning/plan?date=nope", "", http.StatusBadRequest, "Neispravan datum.")
	expectError(t, f, f.admin, http.MethodPost, "/planning/plan/generate", `{"date":"2026-10-18"}`, http.StatusUnprocessableEntity, "Plan se ne može praviti za prošli datum.")
	expectError(t, f, f.admin, http.MethodPost, "/planning/plan/generate", `{"date":"2026-10-20","replan":true}`, http.StatusUnprocessableEntity, "Preplaniranje je moguće samo za današnji dan.")
	expectError(t, f, f.admin, http.MethodPost, "/planning/plan/generate", `{"date":"x"}`, http.StatusUnprocessableEntity, "Neispravan datum.")
	expectError(t, f, f.admin, http.MethodPut, "/planning/plan/draft", `{"date":"`+today+`","assignments":[]}`, http.StatusNotFound, "Nacrt plana nije pronađen.")
	expectError(t, f, f.admin, http.MethodPost, "/planning/plan/publish", `{"date":"`+today+`"}`, http.StatusNotFound, "Nacrt plana nije pronađen.")
	expectError(t, f, f.admin, http.MethodDelete, "/planning/plan/draft?date="+today, "", http.StatusNoContent, "")
	expectError(t, f, f.admin, http.MethodDelete, "/planning/plan/draft?date=x", "", http.StatusBadRequest, "")

	draft := call[domain.ProductionPlan](t, f, f.admin, http.MethodPost, "/planning/plan/generate", `{"date":"`+today+`"}`, http.StatusCreated)
	if draft.Status != domain.PlanStatusDraft || draft.GeneratedBy != "admin" || len(draft.Assignments) != 1 || draft.PublishedAt != nil {
		t.Fatalf("draft = %+v", draft)
	}
	block := draft.Assignments[0]
	if block.WorkOrderID != f.orderID || block.LeadUserID != "user-1" || block.MachineName != "M1" || block.Start != today+"T07:00" {
		t.Fatalf("block = %+v", block)
	}

	// The draft is hidden from operators.
	if day = call[domain.PlanDay](t, f, f.operator, http.MethodGet, "/planning/plan?date="+today, "", http.StatusOK); day.Draft != nil || day.Published != nil {
		t.Fatalf("operator day = %+v", day)
	}
	if day = call[domain.PlanDay](t, f, f.admin, http.MethodGet, "/planning/plan", "", http.StatusOK); day.Draft == nil || day.Draft.ID != draft.ID {
		t.Fatalf("admin day = %+v", day)
	}
	var rawDay map[string]json.RawMessage
	_, body := f.do(t, f.operator, http.MethodGet, "/planning/plan", "")
	_ = json.Unmarshal(body, &rawDay)
	if string(rawDay["draft"]) != "null" || string(rawDay["published"]) != "null" || string(rawDay["drift"]) != "null" {
		t.Fatalf("operator payload = %s", body)
	}

	// Hand edit, then the 2000-block limit.
	edited, _ := json.Marshal(domain.PlanDraftInput{Date: today, Assignments: draft.Assignments})
	saved := call[domain.ProductionPlan](t, f, f.admin, http.MethodPut, "/planning/plan/draft", string(edited), http.StatusOK)
	if saved.ID != draft.ID || saved.Issues == nil || len(saved.Assignments) != 1 {
		t.Fatalf("saved = %+v", saved)
	}
	tooMany := `{"date":"` + today + `","assignments":[` + strings.TrimSuffix(strings.Repeat("{},", 2001), ",") + `]}`
	expectError(t, f, f.admin, http.MethodPut, "/planning/plan/draft", tooMany, http.StatusUnprocessableEntity, "Plan može imati najviše 2000 blokova.")

	// Publish: the draft goes, the operator's queue fills.
	published := call[domain.ProductionPlan](t, f, f.admin, http.MethodPost, "/planning/plan/publish", `{"date":"`+today+`"}`, http.StatusOK)
	if published.Status != domain.PlanStatusPublished || published.PublishedBy == nil || *published.PublishedBy != "admin" {
		t.Fatalf("published = %+v", published)
	}
	day = call[domain.PlanDay](t, f, f.admin, http.MethodGet, "/planning/plan", "", http.StatusOK)
	if day.Draft != nil || day.Published == nil || day.Drift == nil || day.Drift.Suggested {
		t.Fatalf("day after publish = %+v", day)
	}
	if day = call[domain.PlanDay](t, f, f.operator, http.MethodGet, "/planning/plan", "", http.StatusOK); day.Published == nil {
		t.Fatalf("operator did not get the published plan: %+v", day)
	}
	queue := call[domain.MyQueue](t, f, f.operator, http.MethodGet, "/planning/my-queue", "", http.StatusOK)
	if queue.Date != today || queue.PublishedAt == nil || len(queue.Items) != 1 || !queue.Items[0].IsLead || queue.Items[0].StepStatus != domain.ProcessStepPending {
		t.Fatalf("operator queue = %+v", queue)
	}
	if queue = call[domain.MyQueue](t, f, f.admin, http.MethodGet, "/planning/my-queue", "", http.StatusOK); len(queue.Items) != 0 {
		t.Fatalf("admin queue = %+v", queue)
	}
	expectError(t, f, f.operator, http.MethodGet, "/planning/my-queue?date=1.1.2026", "", http.StatusBadRequest, "Neispravan datum.")
	// Another organization sees nothing of it.
	if day = call[domain.PlanDay](t, f, f.otherAdmin, http.MethodGet, "/planning/plan?date="+today, "", http.StatusOK); day.Published != nil {
		t.Fatalf("other organization's day = %+v", day)
	}

	// Forecast.
	forecast := call[[]domain.OrderForecast](t, f, f.operator, http.MethodGet, "/planning/forecast", "", http.StatusOK)
	if len(forecast) != 1 || forecast[0].WorkOrderID != f.orderID || forecast[0].EstimatedFinish == nil || *forecast[0].EstimatedFinish != today || forecast[0].Late || forecast[0].Unplannable {
		t.Fatalf("forecast = %+v", forecast)
	}

	// Two hours in, the block should have started: drift suggests a re-plan.
	f.sqlite.SetClock(func() time.Time { return time.Date(2026, 10, 19, 6, 0, 0, 0, time.UTC) })
	day = call[domain.PlanDay](t, f, f.operator, http.MethodGet, "/planning/plan", "", http.StatusOK)
	if day.Drift == nil || !day.Drift.Suggested || len(day.Drift.Reasons) == 0 {
		t.Fatalf("drift = %+v", day.Drift)
	}
	replan := call[domain.ProductionPlan](t, f, f.admin, http.MethodPost, "/planning/plan/generate", `{"date":"`+today+`","replan":true}`, http.StatusCreated)
	if replan.Status != domain.PlanStatusDraft || replan.ID == draft.ID {
		t.Fatalf("replan = %+v", replan)
	}
	expectError(t, f, f.admin, http.MethodDelete, "/planning/plan/draft?date="+today, "", http.StatusNoContent, "")
	if day = call[domain.PlanDay](t, f, f.admin, http.MethodGet, "/planning/plan", "", http.StatusOK); day.Draft != nil || day.Published == nil {
		t.Fatalf("day after discarding the draft = %+v", day)
	}
	// Without a date the discard defaults to today.
	call[domain.ProductionPlan](t, f, f.admin, http.MethodPost, "/planning/plan/generate", `{"date":"`+today+`"}`, http.StatusCreated)
	expectError(t, f, f.admin, http.MethodDelete, "/planning/plan/draft", "", http.StatusNoContent, "")
	if day = call[domain.PlanDay](t, f, f.admin, http.MethodGet, "/planning/plan", "", http.StatusOK); day.Draft != nil {
		t.Fatalf("draft survived the default-date discard: %+v", day)
	}
}

func TestPlanningModuleSwitchInBackoffice(t *testing.T) {
	f := newModuleFixture(t, false)
	cookie := signedInPlatform(t, f.server)
	path := "/platform/tenants/demo/modules"
	rec := platformRequest(t, f.server, cookie, http.MethodPut, path, `{"processes":false,"stock":true,"attendance":true,"planning":true}`)
	if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "Modul „Planiranje“ zahteva uključen modul „Procesi rada“.") {
		t.Fatalf("planning without processes = %d %s", rec.Code, rec.Body.String())
	}
	rec = platformRequest(t, f.server, cookie, http.MethodPut, path, `{"processes":true,"stock":true,"planning":true}`)
	if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "Modul „Planiranje“ zahteva uključen modul „Prisustvo“.") {
		t.Fatalf("planning without attendance = %d %s", rec.Code, rec.Body.String())
	}
	rec = platformRequest(t, f.server, cookie, http.MethodPut, path, `{"processes":true,"stock":true,"attendance":true,"planning":true}`)
	var tenant domain.PlatformTenant
	if err := json.Unmarshal(rec.Body.Bytes(), &tenant); err != nil || rec.Code != http.StatusOK || !tenant.Modules.Planning {
		t.Fatalf("switch on = %d %s", rec.Code, rec.Body.String())
	}
	settings := call[domain.OrganizationSettings](t, f, f.operator, http.MethodGet, "/settings", "", http.StatusOK)
	if !settings.Modules.Planning {
		t.Fatalf("settings modules = %+v", settings.Modules)
	}
	if code, _ := f.do(t, f.operator, http.MethodGet, "/planning/forecast", ""); code != http.StatusOK {
		t.Fatalf("forecast after the switch = %d", code)
	}
	// PUT /settings cannot switch it.
	f.setPlanning(t, false)
	call[domain.OrganizationSettings](t, f, f.admin, http.MethodPut, "/settings", `{"modules":{"planning":true,"processes":true,"stock":true,"attendance":true}}`, http.StatusOK)
	if code, _ := f.do(t, f.operator, http.MethodGet, "/planning/forecast", ""); code != http.StatusForbidden {
		t.Fatalf("forecast after PUT /settings = %d, want 403", code)
	}
	// Switching processes off in the Backoffice requires planning to go first.
	f.setPlanning(t, true)
	rec = platformRequest(t, f.server, cookie, http.MethodPut, path, `{"processes":false,"stock":true,"attendance":true,"planning":true}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("processes off with planning on = %d", rec.Code)
	}
}

func TestPlanningChangesAreTracedWhileImpersonating(t *testing.T) {
	f := newPlanningFixture(t)
	token, _, err := f.sqlite.CreateImpersonationSession(t.Context(), store.ImpersonationInput{
		AdminID: "platform-admin", AdminUsername: "ops", TenantID: store.DemoTenantID, UserID: "admin-1",
		ExpiresAt: time.Now().Add(time.Hour),
	})
	if err != nil {
		t.Fatal(err)
	}
	call[domain.MachineType](t, f, token, http.MethodPost, "/machine-types", `{"name":"Štampa"}`, http.StatusCreated)
	call[domain.WorkingHours](t, f, token, http.MethodGet, "/planning/working-hours", "", http.StatusOK)
	call[domain.WorkingHours](t, f, token, http.MethodPut, "/planning/working-hours", `{"timeZone":"UTC","days":[]}`, http.StatusOK)
	log, err := f.sqlite.PlatformAuditLog(t.Context(), 10, 0)
	if err != nil || len(log.Items) == 0 || log.Items[0].Impersonation == nil || log.Items[0].Impersonation.ActionCount != 2 {
		t.Fatalf("audit log = %+v, err %v", log, err)
	}
}
