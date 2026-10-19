package planner

import (
	"encoding/json"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func driftOrder(status domain.ProcessStepStatus) Order {
	n := stepNode("s1", "Štampa", typeOffset, 60, 1)
	n.Status = status
	return newOrder("o1", "2026-0012", linearGraph(n))
}

func driftPlan(blocks ...domain.PlanAssignment) domain.ProductionPlan {
	return domain.ProductionPlan{Date: "2026-10-19", Status: domain.PlanStatusPublished, Assignments: blocks}
}

func driftBlock(id, start, end string) domain.PlanAssignment {
	return domain.PlanAssignment{ID: id, WorkOrderID: "o1", OrderNumber: "2026-0012", StepNodeID: "s1", StepLabel: "Štampa", Start: start, End: end}
}

func TestDrift(t *testing.T) {
	now := at("2026-10-19T09:30")
	cases := []struct {
		name   string
		plan   domain.ProductionPlan
		status domain.ProcessStepStatus
		want   []string
	}{
		{"on track", driftPlan(driftBlock("b", "2026-10-19T09:00", "2026-10-19T10:00")), domain.ProcessStepInProgress, nil},
		{"pending started within grace", driftPlan(driftBlock("b", "2026-10-19T09:20", "2026-10-19T10:00")), domain.ProcessStepPending, nil},
		{"pending exactly at grace", driftPlan(driftBlock("b", "2026-10-19T09:15", "2026-10-19T10:00")), domain.ProcessStepPending, nil},
		{"pending past grace", driftPlan(driftBlock("b", "2026-10-19T09:00", "2026-10-19T10:00")), domain.ProcessStepPending,
			[]string{"Nalog 2026-0012, korak „Štampa“: trebalo je da počne u 09:00, a još nije započet."}},
		{"pending future", driftPlan(driftBlock("b", "2026-10-19T13:00", "2026-10-19T14:00")), domain.ProcessStepPending, nil},
		{"ended but in progress", driftPlan(driftBlock("b", "2026-10-19T08:00", "2026-10-19T09:00")), domain.ProcessStepInProgress,
			[]string{
				"Nalog 2026-0012, korak „Štampa“: trebalo je da se završi u 09:00, a nije završen.",
				"Nalog 2026-0012, korak „Štampa“: u toku je, a nije planiran za ovaj trenutak.",
			}},
		{"ended and still pending reports once", driftPlan(driftBlock("b", "2026-10-19T08:00", "2026-10-19T09:00")), domain.ProcessStepPending,
			[]string{"Nalog 2026-0012, korak „Štampa“: trebalo je da počne u 08:00, a još nije započet."}},
		{"ended and done", driftPlan(driftBlock("b", "2026-10-19T08:00", "2026-10-19T09:00")), domain.ProcessStepDone, nil},
		{"ended and skipped", driftPlan(driftBlock("b", "2026-10-19T08:00", "2026-10-19T09:00")), domain.ProcessStepSkipped, nil},
		{"short pending block ended inside grace", driftPlan(driftBlock("b", "2026-10-19T09:20", "2026-10-19T09:25")), domain.ProcessStepPending,
			[]string{"Nalog 2026-0012, korak „Štampa“: trebalo je da se završi u 09:25, a nije završen."}},
		{"in progress without any block", driftPlan(), domain.ProcessStepInProgress,
			[]string{"Nalog 2026-0012, korak „Štampa“: u toku je, a nije planiran za ovaj trenutak."}},
		{"in progress, block only later", driftPlan(driftBlock("b", "2026-10-19T13:00", "2026-10-19T14:00")), domain.ProcessStepInProgress,
			[]string{"Nalog 2026-0012, korak „Štampa“: u toku je, a nije planiran za ovaj trenutak."}},
		{"unknown step in plan is ignored", driftPlan(domain.PlanAssignment{ID: "x", WorkOrderID: "gone", StepNodeID: "s9", Start: "2026-10-19T07:00", End: "2026-10-19T08:00"}), domain.ProcessStepDone, nil},
		{"duplicate reasons are merged", driftPlan(
			driftBlock("b1", "2026-10-19T09:00", "2026-10-19T10:00"),
			driftBlock("b2", "2026-10-19T09:00", "2026-10-19T10:00"),
		), domain.ProcessStepPending, []string{"Nalog 2026-0012, korak „Štampa“: trebalo je da počne u 09:00, a još nije započet."}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := Drift(c.plan, []Order{driftOrder(c.status)}, now)
			if got.Reasons == nil {
				t.Fatal("Reasons must never be nil")
			}
			if got.Suggested != (len(c.want) > 0) {
				t.Fatalf("suggested = %v for %v", got.Suggested, got.Reasons)
			}
			if len(got.Reasons) != len(c.want) {
				t.Fatalf("reasons = %q, want %q", got.Reasons, c.want)
			}
			for i := range c.want {
				if got.Reasons[i] != c.want[i] {
					t.Fatalf("reason %d = %q, want %q", i, got.Reasons[i], c.want[i])
				}
			}
		})
	}
}

func TestDriftOnTrackMarshalsEmptyArray(t *testing.T) {
	got := Drift(driftPlan(), nil, at("2026-10-19T09:30"))
	raw, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != `{"suggested":false,"reasons":[]}` {
		t.Fatalf("json: %s", raw)
	}
}

func TestDriftDeterministicOrder(t *testing.T) {
	a := driftOrder(domain.ProcessStepPending)
	b := driftOrder(domain.ProcessStepInProgress)
	b.ID, b.Number = "o2", "2026-0013"
	plan := driftPlan(
		driftBlock("b1", "2026-10-19T08:00", "2026-10-19T08:30"),
		domain.PlanAssignment{ID: "b2", WorkOrderID: "o2", StepNodeID: "s1", Start: "2026-10-19T07:00", End: "2026-10-19T08:00"},
	)
	now := at("2026-10-19T09:30")
	first := Drift(plan, []Order{a, b}, now)
	second := Drift(plan, []Order{b, a}, now)
	if len(first.Reasons) != len(second.Reasons) || len(first.Reasons) < 3 {
		t.Fatalf("%q vs %q", first.Reasons, second.Reasons)
	}
	for i := range first.Reasons {
		if first.Reasons[i] != second.Reasons[i] {
			t.Fatalf("order differs: %q vs %q", first.Reasons, second.Reasons)
		}
	}
}
