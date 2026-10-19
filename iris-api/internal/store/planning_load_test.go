package store

import (
	"errors"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func loadPerson(t *testing.T, load domain.WorkstationLoad, username string) domain.WorkstationLoadPerson {
	t.Helper()
	for _, person := range load.People {
		if person.Username == username {
			return person
		}
	}
	t.Fatalf("no %s in %+v", username, load.People)
	return domain.WorkstationLoadPerson{}
}

// TestPlanningLoad: the load report reads the published plan's kept horizon,
// the downtime windows and the attendance rules (D-028).
func TestPlanningLoad(t *testing.T) {
	p := newPlanningScenario(t)
	s, ctx := p.s, p.ctx
	const today, tomorrow = "2026-10-19", "2026-10-20"
	// Beta (330 min) runs 07:00-13:00, Alfa 13:00-15:00 and carries 10 minutes
	// over to tomorrow.
	p.newOrder(t, "Beta", 3000, nil, p.typeID)
	if _, err := s.CreateMachineDowntime(ctx, p.machine.ID, domain.MachineDowntimeInput{From: tomorrow + "T13:00", To: tomorrow + "T14:00"}); err != nil {
		t.Fatal(err)
	}

	// Nothing published yet: an empty range of today only.
	load, err := s.PlanningLoad(ctx, LoadQuery{})
	if err != nil || load.From != today || load.To != today || len(load.Days) != 1 || load.Source != domain.LoadSourcePublished {
		t.Fatalf("empty load = %+v, %v", load, err)
	}

	if _, err := s.GeneratePlan(ctx, domain.PlanGenerateInput{Date: today}, "admin"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.PublishPlan(ctx, domain.PlanPublishInput{Date: today}, "admin"); err != nil {
		t.Fatal(err)
	}

	// The default range is the published plan's kept horizon.
	load, err = s.PlanningLoad(ctx, LoadQuery{})
	if err != nil || load.From != today || load.To != "2026-11-05" || len(load.Days) != 14 || load.Days[0] != today || load.Days[1] != tomorrow {
		t.Fatalf("load = %+v, %v", load, err)
	}
	if len(load.MachineTypes) != 1 || load.MachineTypes[0].Name != "Štampa" || len(load.MachineTypes[0].Units) != 1 {
		t.Fatalf("types = %+v", load.MachineTypes)
	}
	unit := load.MachineTypes[0].Units[0]
	if unit.ID != p.machine.ID || !unit.InService {
		t.Fatalf("unit = %+v", unit)
	}
	if day := unit.Days[0]; day.PlannedMinutes != 450 || day.AvailableMinutes != 450 || len(day.Blocks) != 2 {
		t.Fatalf("today = %+v", day)
	}
	// Tomorrow: the carry-over part projected by today's plan, and an hour of downtime.
	if day := unit.Days[1]; day.PlannedMinutes != 10 || day.AvailableMinutes != 390 || len(day.Blocks) != 1 || day.Blocks[0].WorkOrderID != p.orderID {
		t.Fatalf("tomorrow = %+v", day)
	}
	// Attendance: today counts the sign-ins (only ana), later days everyone.
	ana, bora := loadPerson(t, load, "ana"), loadPerson(t, load, "bora")
	if ana.Days[0].AvailableMinutes != 450 || ana.Days[0].PlannedMinutes != 450 || bora.Days[0].AvailableMinutes != 0 ||
		bora.Days[1].AvailableMinutes != 450 || ana.Days[1].PlannedMinutes != 10 {
		t.Fatalf("ana = %+v, bora = %+v", ana.Days[:2], bora.Days[:2])
	}
	// An override wins over the default.
	absent := false
	if _, err := s.SetAttendance(ctx, "u-ana", domain.AttendanceInput{Date: tomorrow, Present: &absent}); err != nil {
		t.Fatal(err)
	}
	load, _ = s.PlanningLoad(ctx, LoadQuery{From: tomorrow, To: tomorrow})
	if len(load.Days) != 1 || loadPerson(t, load, "ana").Days[0].AvailableMinutes != 0 || loadPerson(t, load, "bora").Days[0].AvailableMinutes != 450 {
		t.Fatalf("tomorrow with ana absent = %+v", load.People)
	}

	// A re-plan draft of today, for admins.
	if _, err := s.PlanningLoad(ctx, LoadQuery{Draft: true}); !errors.Is(err, ErrPlanDraftNotFound) {
		t.Fatalf("draft without one = %v", err)
	}
	p.newOrder(t, "Gama", 300, nil, p.typeID) // 60 min more
	if _, err := s.GeneratePlan(ctx, domain.PlanGenerateInput{Date: today}, "admin"); err != nil {
		t.Fatal(err)
	}
	// Over the whole kept horizon (ana is away tomorrow, so work moves later).
	draft, err := s.PlanningLoad(ctx, LoadQuery{Draft: true})
	if err != nil || draft.Source != domain.LoadSourceDraft {
		t.Fatalf("draft load = %+v, %v", draft, err)
	}
	total := 0
	for _, day := range draft.MachineTypes[0].Days {
		total += day.PlannedMinutes
	}
	if total != 520 {
		t.Fatalf("draft planned minutes = %d, want 520", total)
	}

	// Ranges that cannot be read.
	_, err = s.PlanningLoad(ctx, LoadQuery{From: tomorrow, To: today})
	requireValidation(t, err, loadRangeOrderMessage)
	_, err = s.PlanningLoad(ctx, LoadQuery{From: today, To: "2026-11-19"})
	requireValidation(t, err, loadRangeTooLongMessage)
	if _, err = s.PlanningLoad(ctx, LoadQuery{From: today, To: "2026-11-18"}); err != nil {
		t.Fatalf("31 days = %v", err)
	}
	_, err = s.PlanningLoad(ctx, LoadQuery{From: tomorrow, Draft: true})
	requireValidation(t, err, loadDraftTodayMessage)
	_, err = s.PlanningLoad(ctx, LoadQuery{From: "nope"})
	requireValidation(t, err, invalidPlanningDate)
}
