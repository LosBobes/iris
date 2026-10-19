package api

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

const attendanceDisabled = "Modul „Prisustvo“ nije uključen za ovu organizaciju."

var attendanceRoutes = []planningRoute{
	{http.MethodGet, "/attendance", ""},
	{http.MethodPut, "/attendance/user-1", `{"date":"2026-10-19","present":true}`},
}

// newAttendanceFixture switches on the attendance module alone: no stock,
// processes or planning.
func newAttendanceFixture(t *testing.T) processFixture {
	t.Helper()
	f := newModuleFixture(t, false)
	on := true
	if _, err := f.sqlite.SetTenantModules(t.Context(), "demo", domain.OrganizationModulesUpdate{Attendance: &on}); err != nil {
		t.Fatal(err)
	}
	f.sqlite.SetClock(func() time.Time { return planningToday })
	return f
}

func TestAttendanceRoutesForbiddenWhileModuleOff(t *testing.T) {
	f := newModuleFixture(t, false)
	// Every other module on is not enough: attendance has its own switch.
	f.setModules(t, true, true)
	for _, route := range attendanceRoutes {
		for _, token := range []string{f.admin, f.operator} {
			code, body := f.do(t, token, route.method, route.path, route.body)
			var payload struct {
				Error string `json:"error"`
			}
			_ = json.Unmarshal(body, &payload)
			if code != http.StatusForbidden || payload.Error != attendanceDisabled {
				t.Errorf("%s %s = %d %s", route.method, route.path, code, body)
			}
		}
		if code, _ := f.do(t, "", route.method, route.path, route.body); code != http.StatusUnauthorized {
			t.Errorf("anonymous %s %s = %d, want 401", route.method, route.path, code)
		}
	}
}

func TestAttendanceWorksWithoutPlanning(t *testing.T) {
	f := newAttendanceFixture(t)
	settings := call[domain.OrganizationSettings](t, f, f.operator, http.MethodGet, "/settings", "", http.StatusOK)
	if settings.Modules != (domain.OrganizationModules{Attendance: true}) {
		t.Fatalf("modules = %+v", settings.Modules)
	}
	// Planning stays closed.
	expectError(t, f, f.operator, http.MethodGet, "/planning/forecast", "", http.StatusForbidden, planningDisabled)

	// Defaults to today (clock: 2026-10-19), nobody has signed in.
	entries := call[[]domain.AttendanceEntry](t, f, f.operator, http.MethodGet, "/attendance", "", http.StatusOK)
	if len(entries) != 2 || entries[0].Date != "2026-10-19" || entries[0].Present || entries[0].Override != nil {
		t.Fatalf("attendance = %+v", entries)
	}
	entry := call[domain.AttendanceEntry](t, f, f.admin, http.MethodPut, "/attendance/user-1", `{"date":"2026-10-19","present":true}`, http.StatusOK)
	if entry.Override == nil || !*entry.Override || !entry.Present || entry.SignedIn {
		t.Fatalf("override = %+v", entry)
	}
	raw := call[map[string]any](t, f, f.admin, http.MethodPut, "/attendance/user-1", `{"date":"2026-10-19","present":null}`, http.StatusOK)
	if value, ok := raw["override"]; !ok || value != nil || raw["present"] != false {
		t.Fatalf("cleared override = %+v", raw)
	}
	expectError(t, f, f.operator, http.MethodPut, "/attendance/user-1", `{"date":"2026-10-19","present":true}`, http.StatusForbidden, "")
	expectError(t, f, f.admin, http.MethodPut, "/attendance/ghost", `{"date":"2026-10-19","present":true}`, http.StatusNotFound, "Korisnik nije pronađen.")
	expectError(t, f, f.otherAdmin, http.MethodPut, "/attendance/user-1", `{"date":"2026-10-19","present":true}`, http.StatusForbidden, attendanceDisabled)
	expectError(t, f, f.admin, http.MethodPut, "/attendance/user-1", `{"date":"19.10.2026","present":true}`, http.StatusUnprocessableEntity, "Neispravan datum.")
	expectError(t, f, f.operator, http.MethodGet, "/attendance?date=19.10.2026", "", http.StatusBadRequest, "Neispravan datum.")
}
