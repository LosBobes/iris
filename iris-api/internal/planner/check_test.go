package planner

import (
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func checkInput() Input {
	in := baseInput()
	g := linearGraph(stepNode("s1", "Štampa", typeOffset, 60, 1), stepNode("s2", "Sečenje", typeCut, 30, 1))
	in.Orders = []Order{
		newOrder("o1", "2026-0001", g),
		newOrder("o2", "2026-0002", linearGraph(stepNode("s1", "Štampa", typeOffset, 60, 2))),
	}
	in.Machines = append(in.Machines, domain.Machine{ID: "m-off-3", MachineTypeID: typeOffset, Name: "Stari stroj", InService: false})
	return in
}

func blk(order, step, label, machine, lead string, users []string, start, end string) domain.PlanAssignment {
	a := domain.PlanAssignment{
		ID: order + ":" + step + ":1", WorkOrderID: order, OrderNumber: map[string]string{"o1": "2026-0001", "o2": "2026-0002"}[order],
		StepNodeID: step, StepLabel: label, LeadUserID: lead, UserIDs: users, Start: start, End: end,
		Part: 1, Parts: 1,
	}
	if machine != "" {
		a.MachineID = sp(machine)
	}
	return a
}

func TestCheckDraftConflicts(t *testing.T) {
	in := checkInput()
	cases := []struct {
		name  string
		draft []domain.PlanAssignment
		want  []string
	}{
		{"valid", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana"}, "2026-10-19T07:00", "2026-10-19T08:00"),
			blk("o1", "s2", "Sečenje", "m-cut-1", "u-cedo", []string{"u-cedo"}, "2026-10-19T08:00", "2026-10-19T08:30"),
		}, nil},
		{"block spanning a break is fine", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana"}, "2026-10-19T10:00", "2026-10-19T12:00"),
		}, nil},
		{"machine double-booked", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana"}, "2026-10-19T07:00", "2026-10-19T08:00"),
			blk("o2", "s1", "Štampa", "m-off-1", "u-boris", []string{"u-boris", "u-dana"}, "2026-10-19T07:30", "2026-10-19T08:30"),
		}, []string{"mašina „Heidelberg #1“ je istovremeno zauzeta: nalog 2026-0002", "mašina „Heidelberg #1“ je istovremeno zauzeta: nalog 2026-0001"}},
		{"person double-booked", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana"}, "2026-10-19T07:00", "2026-10-19T08:00"),
			blk("o2", "s1", "Štampa", "m-off-2", "u-boris", []string{"u-boris", "u-ana"}, "2026-10-19T07:30", "2026-10-19T08:30"),
		}, []string{"radnik „ana“ je istovremeno raspoređen"}},
		{"touching blocks are fine", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana"}, "2026-10-19T07:00", "2026-10-19T08:00"),
			blk("o2", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana", "u-boris"}, "2026-10-19T08:00", "2026-10-19T09:00"),
		}, nil},
		{"before the shift", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana"}, "2026-10-19T06:00", "2026-10-19T07:30"),
		}, []string{"van radnog vremena"}},
		{"after the shift", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana"}, "2026-10-19T14:30", "2026-10-19T15:30"),
		}, []string{"van radnog vremena"}},
		{"across midnight", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana"}, "2026-10-19T14:00", "2026-10-20T08:00"),
		}, []string{"van radnog vremena"}},
		{"on a day off", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana"}, "2026-10-24T08:00", "2026-10-24T09:00"),
		}, []string{"neradnom danu"}},
		{"inside a break", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana"}, "2026-10-19T11:05", "2026-10-19T11:25"),
		}, []string{"preklapa sa pauzom"}},
		{"ends in a break", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana"}, "2026-10-19T10:00", "2026-10-19T11:10"),
		}, []string{"preklapa sa pauzom"}},
		{"bad time", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana"}, "nope", "2026-10-19T11:10"),
		}, []string{"nije ispravno"}},
		{"end before start", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana"}, "2026-10-19T09:00", "2026-10-19T08:00"),
		}, []string{"nije ispravno"}},
		{"lead not qualified", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-off-1", "u-dana", []string{"u-dana"}, "2026-10-19T07:00", "2026-10-19T08:00"),
		}, []string{"radnik „dana“ nije osposobljen za tip mašine „Offset B2“"}},
		{"no lead", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-off-1", "", []string{"u-ana"}, "2026-10-19T07:00", "2026-10-19T08:00"),
		}, []string{"nije izabran vodeći radnik"}},
		{"machine out of service", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-off-3", "u-ana", []string{"u-ana"}, "2026-10-19T07:00", "2026-10-19T08:00"),
		}, []string{"mašina „Stari stroj“ je van upotrebe"}},
		{"wrong machine type", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-cut-1", "u-ana", []string{"u-ana"}, "2026-10-19T07:00", "2026-10-19T08:00"),
		}, []string{"mašina „Sekač“ nije tipa „Offset B2“ koji korak zahteva"}},
		{"machine missing", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "", "u-ana", []string{"u-ana"}, "2026-10-19T07:00", "2026-10-19T08:00"),
		}, []string{"korak zahteva mašinu tipa „Offset B2“"}},
		{"unknown machine", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-ghost", "u-ana", []string{"u-ana"}, "2026-10-19T07:00", "2026-10-19T08:00"),
		}, []string{"mašina ne postoji"}},
		{"crew too small", []domain.PlanAssignment{
			blk("o2", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana"}, "2026-10-19T07:00", "2026-10-19T08:00"),
		}, []string{"potrebno je 2 ljudi, a raspoređeno je 1"}},
		{"unknown worker", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana", "u-ghost"}, "2026-10-19T07:00", "2026-10-19T08:00"),
		}, []string{"radnik „u-ghost“ ne postoji"}},
		{"unknown order", []domain.PlanAssignment{
			blk("o9", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana"}, "2026-10-19T07:00", "2026-10-19T08:00"),
		}, []string{"nalog nema otvoren proces"}},
		{"unknown step", []domain.PlanAssignment{
			blk("o1", "zz", "Nepoznat", "m-off-1", "u-ana", []string{"u-ana"}, "2026-10-19T07:00", "2026-10-19T08:00"),
		}, []string{"korak ne postoji u procesu naloga"}},
		{"starts before upstream ends", []domain.PlanAssignment{
			blk("o1", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana"}, "2026-10-19T07:00", "2026-10-19T08:00"),
			blk("o1", "s2", "Sečenje", "m-cut-1", "u-cedo", []string{"u-cedo"}, "2026-10-19T07:30", "2026-10-19T08:00"),
		}, []string{"počinje pre nego što se završi prethodni korak „Štampa“"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := CheckDraft(in, c.draft)
			if got == nil {
				t.Fatal("must return a non-nil slice")
			}
			for _, is := range got {
				if is.Code != domain.PlanIssueConflict || is.Message == "" {
					t.Fatalf("bad issue: %+v", is)
				}
			}
			if len(c.want) == 0 {
				if len(got) != 0 {
					t.Fatalf("expected no conflicts, got %+v", got)
				}
				return
			}
			for _, want := range c.want {
				if !containsIssue(got, want) {
					t.Fatalf("missing %q in %+v", want, got)
				}
			}
		})
	}
}

func TestCheckDraftDeterministicAndDeduped(t *testing.T) {
	in := checkInput()
	draft := []domain.PlanAssignment{
		blk("o2", "s1", "Štampa", "m-off-1", "u-dana", []string{"u-dana"}, "2026-10-19T07:30", "2026-10-19T08:30"),
		blk("o1", "s1", "Štampa", "m-off-1", "u-ana", []string{"u-ana"}, "2026-10-19T07:00", "2026-10-19T08:00"),
	}
	first := CheckDraft(in, draft)
	reversed := []domain.PlanAssignment{draft[1], draft[0]}
	second := CheckDraft(in, reversed)
	if len(first) == 0 || len(first) != len(second) {
		t.Fatalf("%d vs %d", len(first), len(second))
	}
	for i := range first {
		if first[i] != second[i] {
			t.Fatalf("order differs at %d: %+v vs %+v", i, first[i], second[i])
		}
		if i > 0 && first[i] == first[i-1] {
			t.Fatal("duplicate issue")
		}
	}
}

func TestCheckDraftOfPlanIsClean(t *testing.T) {
	in := checkInput()
	res := mustPlan(t, in)
	if got := CheckDraft(in, res.Assignments); len(got) != 0 {
		t.Fatalf("planner output must be conflict-free: %+v", got)
	}
	// Carry-over blocks of a long step must be accepted too.
	in.Orders = []Order{singleStepOrder("o1", "1", typeOffset, 1000)}
	res = mustPlan(t, in)
	if got := CheckDraft(in, res.Assignments); len(got) != 0 {
		t.Fatalf("carry-over output must be conflict-free: %+v", got)
	}
}

func TestCheckDraftInvalidHours(t *testing.T) {
	in := checkInput()
	in.Hours.TimeZone = "nope"
	got := CheckDraft(in, nil)
	if len(got) != 1 || got[0].Code != domain.PlanIssueConflict {
		t.Fatalf("got %+v", got)
	}
}
