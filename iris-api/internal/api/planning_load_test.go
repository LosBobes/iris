package api

import (
	"net/http"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func TestPlanningLoadEndpoint(t *testing.T) {
	f := newModuleFixture(t, false)
	// Planning off: 403 for everyone.
	for _, token := range []string{f.admin, f.operator} {
		expectError(t, f, token, http.MethodGet, "/planning/load", "", http.StatusForbidden, planningDisabled)
	}
	if code, _ := f.do(t, "", http.MethodGet, "/planning/load", ""); code != http.StatusUnauthorized {
		t.Fatalf("anonymous = %d, want 401", code)
	}

	f = newPlanningFixture(t)
	planningSetup(t, f)
	const today = "2026-10-19"
	call[domain.ProductionPlan](t, f, f.admin, http.MethodPost, "/planning/plan/generate", `{"date":"`+today+`"}`, http.StatusCreated)
	call[domain.ProductionPlan](t, f, f.admin, http.MethodPost, "/planning/plan/publish", `{"date":"`+today+`"}`, http.StatusOK)

	// Operators read it too; the default range is the kept horizon.
	load := call[domain.WorkstationLoad](t, f, f.operator, http.MethodGet, "/planning/load", "", http.StatusOK)
	if load.From != today || load.To != "2026-11-05" || load.Source != domain.LoadSourcePublished || len(load.Days) != 14 ||
		len(load.MachineTypes) != 1 || len(load.MachineTypes[0].Units) != 1 || len(load.People) == 0 {
		t.Fatalf("load = %+v", load)
	}
	day := load.MachineTypes[0].Units[0].Days[0]
	if day.PlannedMinutes == 0 || day.AvailableMinutes != 450 || len(day.Blocks) != 1 || day.Blocks[0].WorkOrderID != f.orderID {
		t.Fatalf("today = %+v", day)
	}
	load = call[domain.WorkstationLoad](t, f, f.admin, http.MethodGet, "/planning/load?from="+today+"&to=2026-10-20&plan=published", "", http.StatusOK)
	if load.To != "2026-10-20" || len(load.Days) != 2 {
		t.Fatalf("explicit range = %+v", load)
	}

	expectError(t, f, f.admin, http.MethodGet, "/planning/load?from=nope", "", http.StatusBadRequest, "Neispravan datum.")
	expectError(t, f, f.admin, http.MethodGet, "/planning/load?to=2026-13-01", "", http.StatusBadRequest, "Neispravan datum.")
	expectError(t, f, f.admin, http.MethodGet, "/planning/load?plan=other", "", http.StatusBadRequest, "Parametar „plan“ može biti samo „draft“.")
	expectError(t, f, f.admin, http.MethodGet, "/planning/load?from=2026-10-20&to="+today, "", http.StatusUnprocessableEntity, "Datum „do“ ne može biti pre datuma „od“.")
	expectError(t, f, f.admin, http.MethodGet, "/planning/load?from="+today+"&to=2026-11-19", "", http.StatusUnprocessableEntity, "Opseg može imati najviše 31 dana.")

	// The draft is the admin's: operators may not ask for it, and it must exist.
	expectError(t, f, f.operator, http.MethodGet, "/planning/load?plan=draft", "", http.StatusForbidden, "Nemate dozvolu za ovu akciju.")
	expectError(t, f, f.admin, http.MethodGet, "/planning/load?plan=draft", "", http.StatusNotFound, "Nacrt plana nije pronađen.")
	expectError(t, f, f.admin, http.MethodGet, "/planning/load?plan=draft&from=2026-10-20", "", http.StatusUnprocessableEntity, "Nacrt plana može da se prikaže samo kad opseg počinje danas.")
	call[domain.ProductionPlan](t, f, f.admin, http.MethodPost, "/planning/plan/generate", `{"date":"`+today+`","replan":true}`, http.StatusCreated)
	if load = call[domain.WorkstationLoad](t, f, f.admin, http.MethodGet, "/planning/load?plan=draft", "", http.StatusOK); load.Source != domain.LoadSourceDraft {
		t.Fatalf("draft load = %+v", load)
	}
}
