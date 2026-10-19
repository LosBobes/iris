package api

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// GET /planning/calibration (D-028): admins only, behind the planning module.
func TestPlanningCalibrationEndpoint(t *testing.T) {
	f := newModuleFixture(t, false)
	expectError(t, f, f.admin, http.MethodGet, "/planning/calibration", "", http.StatusForbidden, planningDisabled)

	f = newPlanningFixture(t)
	expectError(t, f, f.operator, http.MethodGet, "/planning/calibration", "", http.StatusForbidden, "Nemate dozvolu za ovu akciju.")

	report := call[domain.PlanningCalibration](t, f, f.admin, http.MethodGet, "/planning/calibration", "", http.StatusOK)
	if report.Window != (domain.PlanningCalibrationWindow{From: "2026-08-21", To: "2026-10-19"}) ||
		report.Orders != 0 || report.AvgTransferMinutes != nil || report.Steps == nil {
		t.Fatalf("default report = %+v", report)
	}
	code, raw := f.do(t, f.admin, http.MethodGet, "/planning/calibration", "")
	if code != http.StatusOK || !jsonHasKeys(raw, "avgTransferMinutes", "medianTransferMinutes", "currentTransferMinutes", "steps", "ordersWithTimes") {
		t.Fatalf("report body = %d %s", code, raw)
	}

	window := call[domain.PlanningCalibration](t, f, f.admin, http.MethodGet, "/planning/calibration?from=2026-10-01&to=2026-10-10", "", http.StatusOK)
	if window.Window.From != "2026-10-01" || window.Window.To != "2026-10-10" {
		t.Fatalf("explicit window = %+v", window.Window)
	}
	expectError(t, f, f.admin, http.MethodGet, "/planning/calibration?from=yesterday", "", http.StatusBadRequest, invalidDateMessage)
	expectError(t, f, f.admin, http.MethodGet, "/planning/calibration?from=2026-10-10&to=2026-10-01", "", http.StatusUnprocessableEntity,
		"Početni datum mora biti pre krajnjeg ili isti.")
}

// jsonHasKeys reports whether a JSON object carries every key (a null value
// counts: the contract requires the nullable fields to be present).
func jsonHasKeys(raw []byte, keys ...string) bool {
	var object map[string]json.RawMessage
	if err := json.Unmarshal(raw, &object); err != nil {
		return false
	}
	for _, key := range keys {
		if _, ok := object[key]; !ok {
			return false
		}
	}
	return true
}
