package store

import (
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// calibrationGraph is two steps chained through an item: Štampa (60 min) then
// Sečenje (30 min), no machine type.
func calibrationGraph() domain.ProcessGraph {
	print, cut := 60.0, 30.0
	return domain.ProcessGraph{
		Nodes: []domain.ProcessNode{
			{ID: "print", Kind: domain.ProcessNodeStep, Label: "Štampa", SetupMinutes: &print},
			{ID: "sheets", Kind: domain.ProcessNodeProduct, Label: "Tabaci"},
			{ID: "cut", Kind: domain.ProcessNodeStep, Label: "Sečenje", SetupMinutes: &cut},
		},
		Edges: []domain.ProcessEdge{
			{ID: "e1", Source: "print", Target: "sheets"},
			{ID: "e2", Source: "sheets", Target: "cut"},
		},
	}
}

// calibrationOrder creates an order with the calibration process and sets
// each step's status and times (RFC 3339 UTC) as given.
func (p planningScenario) calibrationOrder(t *testing.T, client string, steps map[string][3]string) string {
	t.Helper()
	quantity := 1
	order, err := p.s.CreateWorkOrder(p.ctx, domain.CreateWorkOrderInput{
		ClientName: client, JobDescription: "Posao", IssuedBy: "admin", IssueDate: "2026-10-01",
		JobDetails: &domain.JobDetails{Quantity: &quantity}, Assignment: domain.Assignment{Priority: "normal"},
	})
	if err != nil {
		t.Fatal(err)
	}
	template, err := p.s.CreateProcessTemplate(p.ctx, domain.ProcessTemplateInput{Name: "Kalibracija " + client, Graph: calibrationGraph()})
	if err != nil {
		t.Fatal(err)
	}
	process, err := p.s.ApplyProcessTemplate(p.ctx, order.ID, template.ID, "admin")
	if err != nil {
		t.Fatal(err)
	}
	graph := domain.CloneProcessGraph(process.Graph)
	for i := range graph.Nodes {
		if values, ok := steps[graph.Nodes[i].ID]; ok {
			graph.Nodes[i].Status = domain.ProcessStepStatus(values[0])
			graph.Nodes[i].StartedAt, graph.Nodes[i].FinishedAt = values[1], values[2]
		}
	}
	if _, err := p.s.UpdateWorkOrderProcess(p.ctx, order.ID, graph, "admin", false); err != nil {
		t.Fatal(err)
	}
	return order.ID
}

func TestPlanningCalibration(t *testing.T) {
	p := newPlanningScenario(t) // its order Alfa has an open process: not completed
	// Monday 2026-10-12: Štampa 07:00-08:00, Sečenje 08:40-09:20 (40 of 30
	// planned minutes): one 40-minute gap.
	p.calibrationOrder(t, "Gotov", map[string][3]string{
		"print": {"done", "2026-10-12T05:00:00Z", "2026-10-12T06:00:00Z"},
		"cut":   {"done", "2026-10-12T06:40:00Z", "2026-10-12T07:20:00Z"},
	})
	// Finished in June: outside the default window.
	p.calibrationOrder(t, "Staro", map[string][3]string{
		"print": {"done", "2026-06-01T05:00:00Z", "2026-06-01T06:00:00Z"},
		"cut":   {"done", "2026-06-01T07:00:00Z", "2026-06-01T07:30:00Z"},
	})
	// Finished but without a startedAt: counted, not measured.
	p.calibrationOrder(t, "Bez vremena", map[string][3]string{
		"print": {"done", "", "2026-10-13T06:00:00Z"},
		"cut":   {"skipped", "", "2026-10-13T07:00:00Z"},
	})
	// Finished but cancelled: left out.
	cancelled := p.calibrationOrder(t, "Otkazan", map[string][3]string{
		"print": {"done", "2026-10-14T05:00:00Z", "2026-10-14T06:00:00Z"},
		"cut":   {"done", "2026-10-14T08:00:00Z", "2026-10-14T08:30:00Z"},
	})
	if _, err := p.s.UpdateWorkOrder(p.ctx, cancelled, domain.UpdateWorkOrderInput{"status": []byte(`"cancelled"`)}); err != nil {
		t.Fatal(err)
	}
	// Still running: not completed.
	p.calibrationOrder(t, "U toku", map[string][3]string{
		"print": {"done", "2026-10-15T05:00:00Z", "2026-10-15T06:00:00Z"},
		"cut":   {"in_progress", "2026-10-15T06:30:00Z", ""},
	})
	if _, err := p.s.SetWorkingHours(p.ctx, withTransfer(t, p, 15)); err != nil {
		t.Fatal(err)
	}

	report, err := p.s.PlanningCalibration(p.ctx, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if report.Window != (domain.PlanningCalibrationWindow{From: "2026-08-21", To: "2026-10-19"}) {
		t.Fatalf("default window = %+v", report.Window)
	}
	if report.Orders != 2 || report.OrdersWithTimes != 1 || report.CurrentTransferMinutes != 15 {
		t.Fatalf("report = %+v", report)
	}
	if report.AvgTransferMinutes == nil || *report.AvgTransferMinutes != 40 || report.MedianTransferMinutes == nil || *report.MedianTransferMinutes != 40 {
		t.Fatalf("transfer = %v / %v", report.AvgTransferMinutes, report.MedianTransferMinutes)
	}
	if len(report.Steps) != 2 || report.Steps[0].Label != "Sečenje" || report.Steps[0].Ratio != 1.33 || report.Steps[1].Ratio != 1 {
		t.Fatalf("steps = %+v", report.Steps)
	}

	// An explicit window picks up the June order only.
	june, err := p.s.PlanningCalibration(p.ctx, "2026-06-01", "2026-06-30")
	if err != nil || june.Orders != 1 || june.AvgTransferMinutes == nil || *june.AvgTransferMinutes != 60 {
		t.Fatalf("june = %+v, %v", june, err)
	}

	// Window validation.
	_, err = p.s.PlanningCalibration(p.ctx, "2026-10-19", "2026-10-01")
	requireValidation(t, err, calibrationWindowOrderMessage)
	_, err = p.s.PlanningCalibration(p.ctx, "2025-01-01", "2026-10-19")
	if err == nil {
		t.Fatal("a window over the limit was accepted")
	}
	_, err = p.s.PlanningCalibration(p.ctx, "soon", "")
	requireValidation(t, err, invalidPlanningDate)

	// Empty data gives an empty, well-formed report.
	other, err := p.s.PlanningCalibration(p.ctx, "2026-01-01", "2026-01-31")
	if err != nil || other.Orders != 0 || other.AvgTransferMinutes != nil || other.Steps == nil || len(other.Steps) != 0 {
		t.Fatalf("empty report = %+v, %v", other, err)
	}
}

func withTransfer(t *testing.T, p planningScenario, minutes int) domain.WorkingHours {
	t.Helper()
	hours, err := p.s.WorkingHours(p.ctx)
	if err != nil {
		t.Fatal(err)
	}
	hours.TransferMinutes = minutes
	return hours
}
