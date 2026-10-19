package planner

import (
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Calibration report (D-028). Default hours: Monday-Friday 07:00-15:00 with a
// 11:00-11:30 break, Europe/Belgrade (CEST = UTC+2 in October 2026).

// doneStep is a done step with planned setup minutes and measured times
// (RFC 3339 UTC; "" leaves the timestamp out).
func doneStep(id, label string, planned float64, startedAt, finishedAt string) domain.ProcessNode {
	n := stepNode(id, label, "", planned, 1)
	n.Status = domain.ProcessStepDone
	n.StartedAt, n.FinishedAt = startedAt, finishedAt
	return n
}

func calibrationOrder(nodes ...domain.ProcessNode) CalibrationOrder {
	return CalibrationOrder{Quantity: 1, Graph: linearGraph(nodes...)}
}

func mustCalibrate(t *testing.T, orders ...CalibrationOrder) Calibration {
	t.Helper()
	out, err := Calibrate(domain.DefaultWorkingHours(), orders)
	if err != nil {
		t.Fatalf("Calibrate: %v", err)
	}
	return out
}

func intValue(p *int) int {
	if p == nil {
		return -1
	}
	return *p
}

func TestCalibrateTransferAcrossBreak(t *testing.T) {
	// 07:00-08:00, 08:30-09:30, 10:00-12:00 (90 working minutes around the
	// break). Cycle 07:00-12:00 = 270, tech 210, 2 gaps: 30 minutes each.
	order := calibrationOrder(
		doneStep("s1", "Štampa", 60, "2026-10-19T05:00:00Z", "2026-10-19T06:00:00Z"),
		doneStep("s2", "Plastifikacija", 60, "2026-10-19T06:30:00Z", "2026-10-19T07:30:00Z"),
		doneStep("s3", "Sečenje", 60, "2026-10-19T08:00:00Z", "2026-10-19T10:00:00Z"),
	)
	out := mustCalibrate(t, order)
	if out.OrdersWithTimes != 1 || out.TransferSamples != 1 {
		t.Fatalf("counts: %+v", out)
	}
	if intValue(out.AvgTransferMinutes) != 30 || intValue(out.MedianTransferMinutes) != 30 {
		t.Fatalf("transfer: avg %d median %d", intValue(out.AvgTransferMinutes), intValue(out.MedianTransferMinutes))
	}
	// Sečenje took 90 of 60 planned minutes: the largest deviation comes first.
	if len(out.Steps) != 3 || out.Steps[0].Label != "Sečenje" || out.Steps[0].Ratio != 1.5 ||
		out.Steps[0].PlannedMinutesAvg != 60 || out.Steps[0].ActualMinutesAvg != 90 || out.Steps[0].Count != 1 {
		t.Fatalf("steps: %+v", out.Steps)
	}
}

func TestCalibrateAcrossNightAveragesAndRounds(t *testing.T) {
	// Order A: 30-minute gaps (as above). Order B: s1 Monday 14:00-15:00, s2
	// Tuesday 08:00-09:00: the gap is 07:00-08:00 = 60 working minutes, the
	// night excluded. Order C: 3 gaps of 10, 10 and 20 = 13.33 per gap.
	a := calibrationOrder(
		doneStep("s1", "Štampa", 60, "2026-10-19T05:00:00Z", "2026-10-19T06:00:00Z"),
		doneStep("s2", "Plastifikacija", 60, "2026-10-19T06:30:00Z", "2026-10-19T07:30:00Z"),
		doneStep("s3", "Sečenje", 60, "2026-10-19T08:00:00Z", "2026-10-19T10:00:00Z"),
	)
	b := calibrationOrder(
		doneStep("s1", "Štampa", 60, "2026-10-19T12:00:00Z", "2026-10-19T13:00:00Z"),
		doneStep("s2", "Sečenje", 60, "2026-10-20T06:00:00Z", "2026-10-20T07:00:00Z"),
	)
	c := calibrationOrder(
		doneStep("s1", "Štampa", 30, "2026-10-21T05:00:00Z", "2026-10-21T05:30:00Z"),
		doneStep("s2", "Štampa", 30, "2026-10-21T05:40:00Z", "2026-10-21T06:10:00Z"),
		doneStep("s3", "Štampa", 30, "2026-10-21T06:20:00Z", "2026-10-21T06:50:00Z"),
		doneStep("s4", "Štampa", 30, "2026-10-21T07:10:00Z", "2026-10-21T07:40:00Z"),
	)
	out := mustCalibrate(t, a, b, c)
	// Mean (30 + 60 + 13.33) / 3 = 34.4 -> 35; median 30.
	if intValue(out.AvgTransferMinutes) != 35 || intValue(out.MedianTransferMinutes) != 30 {
		t.Fatalf("transfer: avg %d median %d", intValue(out.AvgTransferMinutes), intValue(out.MedianTransferMinutes))
	}
	if out.OrdersWithTimes != 3 || out.TransferSamples != 3 {
		t.Fatalf("counts: %+v", out)
	}
}

func TestCalibrateSkipsOrdersWithoutTimesOrGaps(t *testing.T) {
	single := calibrationOrder(doneStep("s1", "Štampa", 60, "2026-10-19T05:00:00Z", "2026-10-19T06:00:00Z"))
	missing := calibrationOrder(
		doneStep("s1", "Štampa", 60, "", "2026-10-19T06:00:00Z"),
		doneStep("s2", "Sečenje", 30, "2026-10-19T07:00:00Z", "2026-10-19T07:45:00Z"),
	)
	out := mustCalibrate(t, single, missing)
	if out.OrdersWithTimes != 1 || out.TransferSamples != 0 || out.AvgTransferMinutes != nil || out.MedianTransferMinutes != nil {
		t.Fatalf("want one order with times and no transfer sample: %+v", out)
	}
	// Steps still count every measured done step: Štampa 60/60, Sečenje 45/30.
	if len(out.Steps) != 2 || out.Steps[0].Label != "Sečenje" || out.Steps[0].Ratio != 1.5 ||
		out.Steps[1].Label != "Štampa" || out.Steps[1].Ratio != 1 {
		t.Fatalf("steps: %+v", out.Steps)
	}
}

func TestCalibrateParallelBranchUsesLongestChain(t *testing.T) {
	// s1 -> s2 -> s4 and s1 -> s3 (parallel with s2). The longest chain is
	// s1, s2, s4 (3 done steps; s3 is not on it): cycle 07:00-10:00 = 180,
	// tech 60 + 60 + 30 = 150, 2 gaps -> 15.
	g := domain.ProcessGraph{
		Nodes: []domain.ProcessNode{
			doneStep("s1", "Priprema", 60, "2026-10-19T05:00:00Z", "2026-10-19T06:00:00Z"),
			doneStep("s2", "Štampa", 60, "2026-10-19T06:10:00Z", "2026-10-19T07:10:00Z"),
			doneStep("s3", "Lakiranje", 120, "2026-10-19T06:00:00Z", "2026-10-19T07:30:00Z"),
			doneStep("s4", "Pakovanje", 30, "2026-10-19T07:30:00Z", "2026-10-19T08:00:00Z"),
		},
		Edges: []domain.ProcessEdge{edge("s1", "s2"), edge("s1", "s3"), edge("s2", "s4")},
	}
	out := mustCalibrate(t, CalibrationOrder{Quantity: 1, Graph: g})
	if intValue(out.AvgTransferMinutes) != 15 {
		t.Fatalf("transfer: %d", intValue(out.AvgTransferMinutes))
	}
}

func TestCalibrateClampsAndUsesQuantity(t *testing.T) {
	// Overlapping steps (the next started before the previous finished) give
	// a negative gap, clamped to 0.
	overlap := calibrationOrder(
		doneStep("s1", "Štampa", 60, "2026-10-19T05:00:00Z", "2026-10-19T06:00:00Z"),
		doneStep("s2", "Sečenje", 60, "2026-10-19T05:30:00Z", "2026-10-19T06:30:00Z"),
	)
	out := mustCalibrate(t, overlap)
	if intValue(out.AvgTransferMinutes) != 0 {
		t.Fatalf("negative transfer must clamp to 0: %d", intValue(out.AvgTransferMinutes))
	}

	// Planned minutes follow the order quantity: 10 + 2 x 25 = 60.
	node := doneStep("s1", "Savijanje", 10, "2026-10-19T05:00:00Z", "2026-10-19T06:00:00Z")
	node.MinutesPerUnit = fl(2)
	out = mustCalibrate(t, CalibrationOrder{Quantity: 25, Graph: linearGraph(node)})
	if len(out.Steps) != 1 || out.Steps[0].PlannedMinutesAvg != 60 || out.Steps[0].Ratio != 1 {
		t.Fatalf("steps: %+v", out.Steps)
	}
}

func TestProcessCompletion(t *testing.T) {
	skipped := stepNode("s2", "Lak", "", 10, 1)
	skipped.Status = domain.ProcessStepSkipped
	skipped.FinishedAt = "2026-10-19T09:00:00Z"
	g := linearGraph(doneStep("s1", "Štampa", 60, "2026-10-19T05:00:00Z", "2026-10-19T06:00:00Z"), skipped)
	at, ok := ProcessCompletion(g)
	if !ok || at.Format("2006-01-02T15:04Z07:00") != "2026-10-19T09:00Z" {
		t.Fatalf("completion: %v %v", at, ok)
	}

	open := linearGraph(doneStep("s1", "Štampa", 60, "", "2026-10-19T06:00:00Z"), stepNode("s2", "Sečenje", "", 10, 1))
	if _, ok := ProcessCompletion(open); ok {
		t.Fatal("a process with a pending step is not complete")
	}
	legacy := linearGraph(doneStep("s1", "Štampa", 60, "", ""))
	if _, ok := ProcessCompletion(legacy); ok {
		t.Fatal("a process without any finishedAt has no completion moment")
	}
	allSkipped := skipped
	allSkipped.ID = "s1"
	if _, ok := ProcessCompletion(linearGraph(allSkipped)); ok {
		t.Fatal("a process with no done step is not complete")
	}
}
