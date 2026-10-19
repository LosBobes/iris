package store

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func TestMachineDowntimes(t *testing.T) {
	s, ctx := newPlanningStore(t)
	other := ContextWithTenant(context.Background(), "tenant-other")
	if err := s.EnsureTenant(context.Background(), "tenant-other", "other", "Other"); err != nil {
		t.Fatal(err)
	}
	machineType, err := s.CreateMachineType(ctx, domain.MachineTypeInput{Name: "Offset"})
	if err != nil {
		t.Fatal(err)
	}
	machine, err := s.CreateMachine(ctx, domain.MachineInput{MachineTypeID: machineType.ID, Name: "M1", InService: true})
	if err != nil {
		t.Fatal(err)
	}

	if list, err := s.MachineDowntimes(ctx, machine.ID); err != nil || list == nil || len(list) != 0 {
		t.Fatalf("empty list = %#v, %v", list, err)
	}
	if _, err := s.MachineDowntimes(ctx, "nope"); !errors.Is(err, ErrMachineNotFound) {
		t.Fatalf("unknown machine list = %v", err)
	}
	if _, err := s.MachineDowntimes(other, machine.ID); !errors.Is(err, ErrMachineNotFound) {
		t.Fatalf("cross-tenant list = %v", err)
	}

	_, err = s.CreateMachineDowntime(ctx, machine.ID, domain.MachineDowntimeInput{From: "2026-10-20 08:00", To: "2026-10-20T10:00"})
	requireValidation(t, err, machineDowntimeTimeInvalid)
	_, err = s.CreateMachineDowntime(ctx, machine.ID, domain.MachineDowntimeInput{From: "2026-10-20T10:00", To: "2026-10-20T08:00"})
	requireValidation(t, err, machineDowntimeOrder)
	_, err = s.CreateMachineDowntime(ctx, machine.ID, domain.MachineDowntimeInput{From: "2026-10-20T08:00", To: "2026-10-20T10:00", Note: strings.Repeat("x", 501)})
	requireValidation(t, err, machineDowntimeNoteTooLong)
	if _, err := s.CreateMachineDowntime(ctx, "nope", domain.MachineDowntimeInput{From: "2026-10-20T08:00", To: "2026-10-20T10:00"}); !errors.Is(err, ErrMachineNotFound) {
		t.Fatalf("unknown machine create = %v", err)
	}
	if _, err := s.CreateMachineDowntime(other, machine.ID, domain.MachineDowntimeInput{From: "2026-10-20T08:00", To: "2026-10-20T10:00"}); !errors.Is(err, ErrMachineNotFound) {
		t.Fatalf("cross-tenant create = %v", err)
	}

	later, err := s.CreateMachineDowntime(ctx, machine.ID, domain.MachineDowntimeInput{From: "2026-10-21T08:00", To: "2026-10-22T15:00", Note: " Servis "})
	if err != nil || later.ID == "" || later.MachineID != machine.ID || later.Note != "Servis" || later.CreatedAt == "" {
		t.Fatalf("create = %+v, %v", later, err)
	}
	earlier, err := s.CreateMachineDowntime(ctx, machine.ID, domain.MachineDowntimeInput{From: "2026-10-20T08:00", To: "2026-10-20T10:00"})
	if err != nil {
		t.Fatal(err)
	}
	list, err := s.MachineDowntimes(ctx, machine.ID)
	if err != nil || len(list) != 2 || list[0].ID != earlier.ID || list[1].ID != later.ID {
		t.Fatalf("list = %+v, %v", list, err)
	}
	all, err := listMachineDowntimes(ctx, s.db, DemoTenantID, "")
	if err != nil || len(all) != 2 {
		t.Fatalf("all = %+v, %v", all, err)
	}

	if err := s.DeleteMachineDowntime(ctx, machine.ID, "nope"); !errors.Is(err, ErrMachineDowntimeNotFound) {
		t.Fatalf("delete unknown = %v", err)
	}
	if err := s.DeleteMachineDowntime(other, machine.ID, earlier.ID); !errors.Is(err, ErrMachineNotFound) {
		t.Fatalf("cross-tenant delete = %v", err)
	}
	if err := s.DeleteMachineDowntime(ctx, machine.ID, earlier.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteMachineDowntime(ctx, machine.ID, earlier.ID); !errors.Is(err, ErrMachineDowntimeNotFound) {
		t.Fatalf("delete again = %v", err)
	}
	// Deleting the machine removes its windows.
	if err := s.DeleteMachine(ctx, machine.ID); err != nil {
		t.Fatal(err)
	}
	var rows int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM machine_downtimes`).Scan(&rows); err != nil || rows != 0 {
		t.Fatalf("downtimes after deleting the machine = %d, %v", rows, err)
	}
}

func TestWorkingHoursExceptionsAndDowntimesInPlans(t *testing.T) {
	p := newPlanningScenario(t)
	s, ctx := p.s, p.ctx
	const today = "2026-10-19"

	// A downtime on the only machine this morning pushes the step after it.
	if _, err := s.CreateMachineDowntime(ctx, p.machine.ID, domain.MachineDowntimeInput{From: today + "T07:00", To: today + "T09:00"}); err != nil {
		t.Fatal(err)
	}
	draft, err := s.GeneratePlan(ctx, domain.PlanGenerateInput{Date: today}, "admin")
	if err != nil || len(draft.Assignments) != 1 || draft.Assignments[0].Start != today+"T09:00" {
		t.Fatalf("draft with downtime = %+v, %v", draft, err)
	}
	// A hand-moved block into the window is a conflict.
	moved := draft.Assignments
	moved[0].Start, moved[0].End = today+"T07:30", today+"T08:30"
	saved, err := s.SavePlanDraft(ctx, domain.PlanDraftInput{Date: today, Assignments: moved}, "admin")
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, issue := range saved.Issues {
		if issue.Code == domain.PlanIssueConflict && strings.Contains(issue.Message, "van pogona") {
			found = true
		}
	}
	if !found {
		t.Fatalf("no downtime conflict in %+v", saved.Issues)
	}
	// Published with the step in progress: drift suggests a re-plan.
	if _, err := s.PublishPlan(ctx, domain.PlanPublishInput{Date: today}, "admin"); err != nil {
		t.Fatal(err)
	}
	p.setStepStatus(t, p.orderID, domain.ProcessStepInProgress)
	day, err := s.PlanDay(ctx, today, true)
	if err != nil || day.Drift == nil || !day.Drift.Suggested {
		t.Fatalf("drift with downtime = %+v, %v", day.Drift, err)
	}
	downtimeReason := false
	for _, reason := range day.Drift.Reasons {
		if strings.Contains(reason, "van pogona") {
			downtimeReason = true
		}
	}
	if !downtimeReason {
		t.Fatalf("drift reasons = %+v", day.Drift.Reasons)
	}
	p.setStepStatus(t, p.orderID, domain.ProcessStepPending)

	// An exception makes today a day off: the re-planned day is empty and, once
	// that is published (the forecast pins published blocks, so the stale plan
	// from before the exception would otherwise still count), the forecast
	// moves to the next working day.
	hours, _ := s.WorkingHours(ctx)
	hours.Exceptions = []domain.WorkingHoursException{{Date: today, Off: true}}
	if _, err := s.SetWorkingHours(ctx, hours); err != nil {
		t.Fatal(err)
	}
	draft, err = s.GeneratePlan(ctx, domain.PlanGenerateInput{Date: today}, "admin")
	if err != nil || len(draft.Assignments) != 0 {
		t.Fatalf("draft on an exception day off = %+v, %v", draft, err)
	}
	if _, err := s.PublishPlan(ctx, domain.PlanPublishInput{Date: today}, "admin"); err != nil {
		t.Fatal(err)
	}
	forecast, err := s.Forecast(ctx)
	if err != nil || len(forecast) != 1 || forecast[0].EstimatedFinish == nil || *forecast[0].EstimatedFinish != "2026-10-20" {
		t.Fatalf("forecast across the day off = %+v, %v", forecast, err)
	}
	// Attendance for the day still answers (nobody is planned, presence unchanged).
	if entries, err := s.Attendance(ctx, today); err != nil || len(entries) == 0 {
		t.Fatalf("attendance on a day off = %+v, %v", entries, err)
	}
	// One-off Saturday hours make Saturday plannable.
	hours.Exceptions = []domain.WorkingHoursException{{Date: "2026-10-24", Start: "08:00", End: "12:00"}}
	if _, err := s.SetWorkingHours(ctx, hours); err != nil {
		t.Fatal(err)
	}
	draft, err = s.GeneratePlan(ctx, domain.PlanGenerateInput{Date: "2026-10-24"}, "admin")
	if err != nil || len(draft.Assignments) != 1 || draft.Assignments[0].Start != "2026-10-24T08:00" {
		t.Fatalf("saturday draft = %+v, %v", draft, err)
	}
	// Normalization: exceptions sorted by date, day-off shift fields cleared.
	hours.Exceptions = []domain.WorkingHoursException{
		{Date: "2026-12-25", Off: true, Start: "08:00", End: "12:00"},
		{Date: "2026-10-24", Start: "08:00", End: "12:00"},
	}
	saved2, err := s.SetWorkingHours(ctx, hours)
	if err != nil || saved2.Exceptions[0].Date != "2026-10-24" || saved2.Exceptions[1].Start != "" || saved2.Exceptions[1].Breaks == nil {
		t.Fatalf("normalized = %+v, %v", saved2, err)
	}
}

func TestMachineDowntimesMigrationTranslatesForPostgres(t *testing.T) {
	translated := translateToPostgres(machineDowntimesMigration)
	if !strings.Contains(translated, "CREATE TABLE IF NOT EXISTS machine_downtimes") {
		t.Fatalf("table missing from the translated migration:\n%s", translated)
	}
	found := false
	for _, listed := range tenantDataTables {
		found = found || listed.name == "machine_downtimes"
	}
	if !found {
		t.Fatal("machine_downtimes missing from tenantDataTables")
	}
}
