package planner

import (
	"reflect"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Workstation load ("Zauzetost", D-028).

func loadBlock(id, machineID, machineName, start, end string, minutes int, lead string, crew ...string) domain.PlanAssignment {
	block := domain.PlanAssignment{
		ID: id, WorkOrderID: "o-" + id, OrderNumber: "2026-" + id, StepNodeID: "s1", StepLabel: "Korak " + id,
		MachineName: machineName, LeadUserID: lead, UserIDs: append([]string{lead}, crew...),
		Start: start, End: end, Minutes: minutes, Part: 1, Parts: 1,
	}
	if machineID != "" {
		block.MachineID = sp(machineID)
	}
	return block
}

func blockIDs(blocks []domain.PlanAssignment) []string {
	ids := make([]string, 0, len(blocks))
	for _, block := range blocks {
		ids = append(ids, block.ID)
	}
	return ids
}

func TestLoadBlocksPicksThePlanOfEachDate(t *testing.T) {
	p1 := domain.ProductionPlan{ID: "p1", Date: "2026-10-19", HorizonEnd: "2026-10-23", Assignments: []domain.PlanAssignment{
		loadBlock("a", "m1", "M1", "2026-10-19T07:00", "2026-10-19T08:00", 60, "u1"),
		loadBlock("b", "m1", "M1", "2026-10-20T07:00", "2026-10-20T08:00", 60, "u1"),
		loadBlock("c", "m1", "M1", "2026-10-22T07:00", "2026-10-22T08:00", 60, "u1"),
		loadBlock("d", "m1", "M1", "2026-10-23T07:00", "2026-10-23T08:00", 60, "u1"),
	}}
	// p2 kept only its own date (a plan stored before D-028 reads that way).
	p2 := domain.ProductionPlan{ID: "p2", Date: "2026-10-20", HorizonEnd: "", Assignments: []domain.PlanAssignment{
		loadBlock("e", "m1", "M1", "2026-10-20T09:00", "2026-10-20T10:00", 60, "u1"),
	}}
	p3 := domain.ProductionPlan{ID: "p3", Date: "2026-10-22", HorizonEnd: "2026-10-30", Assignments: []domain.PlanAssignment{
		loadBlock("f", "m1", "M1", "2026-10-22T09:00", "2026-10-22T10:00", 60, "u1"),
		loadBlock("g", "m1", "M1", "2026-10-26T07:00", "2026-10-26T08:00", 60, "u1"),
	}}
	// 19: p1's own; 20: p2's own (p1's projection loses); 21: p1 still covers
	// it but has nothing there; 22: p3's own; 23: p3 (the most recent plan
	// covering it) projected nothing, so p1's older projection is not used.
	got := blockIDs(LoadBlocks([]domain.ProductionPlan{p3, p2, p1}, "2026-10-19", "2026-10-23"))
	if want := []string{"a", "e", "f"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("blocks = %v, want %v", got, want)
	}
	// Before any plan, nothing; a later range takes p3's projection.
	if got := LoadBlocks([]domain.ProductionPlan{p1}, "2026-10-12", "2026-10-16"); len(got) != 0 || got == nil {
		t.Fatalf("blocks before the first plan = %v", got)
	}
	if got := blockIDs(LoadBlocks([]domain.ProductionPlan{p1, p3}, "2026-10-24", "2026-10-31")); !reflect.DeepEqual(got, []string{"g"}) {
		t.Fatalf("later range = %v", got)
	}
}

func TestLoadCountsPlannedAgainstAvailable(t *testing.T) {
	base := baseInput()
	hours := domain.DefaultWorkingHours()
	// Wednesday is a holiday.
	hours.Exceptions = []domain.WorkingHoursException{{Date: "2026-10-21", Off: true, Breaks: []domain.WorkingBreak{}}}
	machines := append([]domain.Machine(nil), base.Machines...)
	machines[1].InService = false // Heidelberg #2
	in := LoadInput{
		Hours: hours, From: "2026-10-19", To: "2026-10-25",
		// Types in reverse name order: the output sorts them.
		MachineTypes: []domain.MachineType{base.MachineTypes[1], base.MachineTypes[0]},
		Machines:     machines,
		Downtimes: []domain.MachineDowntime{
			// 10:00-12:00 spans the 11:00-11:30 break: 90 working minutes.
			downtime("d1", "m-cut-1", "2026-10-20T10:00", "2026-10-20T12:00"),
			// Overlapping windows count once.
			downtime("d2", "m-cut-1", "2026-10-20T10:30", "2026-10-20T11:00"),
		},
		Workers: []Worker{
			{UserID: "u-dana", Username: "dana"},
			{UserID: "u-boris", Username: "boris", Presence: map[string]bool{"2026-10-20": false}},
			{UserID: "u-ana", Username: "ana", Presence: map[string]bool{"2026-10-19": true}},
			{UserID: "u-cedo", Username: "cedo"},
		},
		Blocks: []domain.PlanAssignment{
			loadBlock("b2", "m-off-1", "Heidelberg #1", "2026-10-19T13:30", "2026-10-19T15:00", 90, "u-boris"),
			loadBlock("b1", "m-off-1", "Heidelberg #1", "2026-10-19T07:00", "2026-10-19T13:30", 400, "u-ana", "u-dana"),
			loadBlock("b3", "m-cut-1", "Sekač", "2026-10-20T07:00", "2026-10-20T12:30", 300, "u-cedo"),
			loadBlock("b4", "", "", "2026-10-20T13:00", "2026-10-20T14:00", 60, "u-dana"),
			loadBlock("b5", "m-gone", "Stara", "2026-10-22T07:00", "2026-10-22T07:30", 30, "u-ana"),
			// A block left on a Saturday keeps the day in the report.
			loadBlock("b6", "m-off-1", "Heidelberg #1", "2026-10-24T08:00", "2026-10-24T09:00", 60, "u-ana"),
			// Outside the range.
			loadBlock("b7", "m-off-1", "Heidelberg #1", "2026-10-26T07:00", "2026-10-26T08:00", 60, "u-ana"),
		},
	}
	load, err := Load(in)
	if err != nil {
		t.Fatal(err)
	}
	if load.From != in.From || load.To != in.To || load.Source != domain.LoadSourcePublished {
		t.Fatalf("header = %+v", load)
	}
	wantDays := []string{"2026-10-19", "2026-10-20", "2026-10-22", "2026-10-23", "2026-10-24"}
	if !reflect.DeepEqual(load.Days, wantDays) {
		t.Fatalf("days = %v, want %v", load.Days, wantDays)
	}

	var names []string
	for _, machineType := range load.MachineTypes {
		names = append(names, machineType.ID+"/"+machineType.Name)
		if len(machineType.Days) != len(wantDays) {
			t.Fatalf("%s days = %+v", machineType.Name, machineType.Days)
		}
		for _, unit := range machineType.Units {
			if len(unit.Days) != len(wantDays) {
				t.Fatalf("%s days = %+v", unit.Name, unit.Days)
			}
		}
	}
	if want := []string{"t-off/Offset B2", "t-cut/Sečenje", "/Bez mašine"}; !reflect.DeepEqual(names, want) {
		t.Fatalf("types = %v, want %v", names, want)
	}

	offset := load.MachineTypes[0]
	if len(offset.Units) != 2 || offset.Units[0].ID != "m-off-1" || offset.Units[1].ID != "m-off-2" || offset.Units[1].InService {
		t.Fatalf("offset units = %+v", offset.Units)
	}
	monday := offset.Units[0].Days[0]
	if monday.PlannedMinutes != 490 || monday.AvailableMinutes != 450 || !reflect.DeepEqual(
		[]string{monday.Blocks[0].OrderNumber, monday.Blocks[1].OrderNumber}, []string{"2026-b1", "2026-b2"},
	) || monday.Blocks[0].StepLabel != "Korak b1" || monday.Blocks[0].Minutes != 400 || monday.Blocks[0].LeadUserID != "u-ana" {
		t.Fatalf("Heidelberg #1 Monday = %+v", monday)
	}
	if saturday := offset.Units[0].Days[4]; saturday.PlannedMinutes != 60 || saturday.AvailableMinutes != 0 {
		t.Fatalf("Heidelberg #1 Saturday = %+v", saturday)
	}
	if out := offset.Units[1].Days[0]; out.AvailableMinutes != 0 || out.PlannedMinutes != 0 || out.Blocks == nil {
		t.Fatalf("out-of-service unit = %+v", out)
	}
	if total := offset.Days[0]; total != (domain.WorkstationLoadTotal{Date: "2026-10-19", PlannedMinutes: 490, AvailableMinutes: 450}) {
		t.Fatalf("offset Monday total = %+v", total)
	}
	if total := offset.Days[1]; total.PlannedMinutes != 0 || total.AvailableMinutes != 450 {
		t.Fatalf("offset Tuesday total = %+v", total)
	}

	cutter := load.MachineTypes[1].Units[0]
	if tuesday := cutter.Days[1]; tuesday.PlannedMinutes != 300 || tuesday.AvailableMinutes != 360 {
		t.Fatalf("cutter Tuesday = %+v", tuesday)
	}
	if monday := cutter.Days[0]; monday.AvailableMinutes != 450 {
		t.Fatalf("cutter Monday = %+v", monday)
	}

	pseudo := load.MachineTypes[2]
	if len(pseudo.Units) != 2 || pseudo.Units[0].ID != "" || pseudo.Units[0].Name != "Bez mašine" || !pseudo.Units[0].InService ||
		pseudo.Units[1].ID != "m-gone" || pseudo.Units[1].Name != "Stara" || pseudo.Units[1].InService {
		t.Fatalf("pseudo units = %+v", pseudo.Units)
	}
	if day := pseudo.Units[0].Days[1]; day.PlannedMinutes != 60 || day.AvailableMinutes != 0 {
		t.Fatalf("no-machine Tuesday = %+v", day)
	}
	if day := pseudo.Days[2]; day.PlannedMinutes != 30 || day.AvailableMinutes != 0 {
		t.Fatalf("pseudo Thursday total = %+v", day)
	}

	var people []string
	for _, person := range load.People {
		people = append(people, person.Username)
	}
	if !reflect.DeepEqual(people, []string{"ana", "boris", "cedo", "dana"}) {
		t.Fatalf("people = %v", people)
	}
	ana, boris, dana := load.People[0], load.People[1], load.People[3]
	if ana.Days[0].PlannedMinutes != 400 || ana.Days[0].AvailableMinutes != 450 || ana.Days[2].PlannedMinutes != 30 ||
		ana.Days[4].AvailableMinutes != 0 || ana.Days[4].PlannedMinutes != 60 {
		t.Fatalf("ana = %+v", ana.Days)
	}
	if boris.Days[0].PlannedMinutes != 90 || boris.Days[1].AvailableMinutes != 0 || boris.Days[2].AvailableMinutes != 450 {
		t.Fatalf("boris = %+v", boris.Days)
	}
	if dana.Days[0].PlannedMinutes != 400 || dana.Days[1].PlannedMinutes != 60 || len(dana.Days[1].Blocks) != 1 {
		t.Fatalf("dana = %+v", dana.Days)
	}

	// Deterministic: the same input gives the same answer.
	again, _ := Load(in)
	if !reflect.DeepEqual(load, again) {
		t.Fatal("Load is not deterministic")
	}

	// An unusable calendar is an error.
	in.Hours.TimeZone = ""
	if _, err := Load(in); err != ErrInvalidHours {
		t.Fatalf("invalid hours = %v", err)
	}
}
