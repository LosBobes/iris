package store

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// planningNowFixed is Monday 2026-10-19 06:00 in Europe/Belgrade (UTC+2): an
// hour before the default shift starts.
var planningNowFixed = time.Date(2026, 10, 19, 4, 0, 0, 0, time.UTC)

func newPlanningStore(t *testing.T) (*SQLiteStore, context.Context) {
	t.Helper()
	ctx := testTenantContext()
	s := newSQLiteStoreForTest(t, ctx, filepath.Join(t.TempDir(), "iris.db"))
	s.SetClock(func() time.Time { return planningNowFixed })
	return s, ctx
}

func enablePlanning(t *testing.T, s *SQLiteStore, slug string) {
	t.Helper()
	on := true
	if _, err := s.SetTenantModules(context.Background(), slug, domain.OrganizationModulesUpdate{Stock: &on, Processes: &on, Attendance: &on, Planning: &on}); err != nil {
		t.Fatal(err)
	}
}

func TestPlanningModuleDependencyAndAudit(t *testing.T) {
	s, ctx := newPlanningStore(t)
	actor := AuditActor{AdminID: "p1", AdminUsername: "root"}

	_, err := s.PlatformSetTenantModules(ctx, actor, DemoTenantSlug, domain.OrganizationModules{Stock: true, Planning: true})
	requireValidation(t, err, ModulesPlanningDependencyMessage)
	on := true
	_, err = s.SetTenantModules(ctx, DemoTenantSlug, domain.OrganizationModulesUpdate{Planning: &on})
	requireValidation(t, err, ModulesPlanningDependencyMessage)

	// Stored planning without processes reads as off.
	if err := writeModules(ctx, s.db, DemoTenantID, domain.OrganizationModules{Stock: true, Planning: true}); err != nil {
		t.Fatal(err)
	}
	if modules, _ := s.OrganizationModules(ctx); modules != (domain.OrganizationModules{Stock: true}) {
		t.Fatalf("effective modules = %+v", modules)
	}

	// Data stored before attendance became its own module (no "attendance"
	// key) keeps it on wherever planning was on.
	for raw, want := range map[string]domain.OrganizationModules{
		`{"stock":true,"processes":true,"planning":true}`:                    {Stock: true, Processes: true, Planning: true, Attendance: true},
		`{"stock":true,"processes":true,"planning":false}`:                   {Stock: true, Processes: true},
		`{"stock":true,"processes":true,"planning":true,"attendance":false}`: {Stock: true, Processes: true},
	} {
		if got := parseModules(raw); got != want {
			t.Errorf("parseModules(%s) = %+v, want %+v", raw, got, want)
		}
	}

	// Planning also needs attendance.
	_, err = s.PlatformSetTenantModules(ctx, actor, DemoTenantSlug, domain.OrganizationModules{Stock: true, Processes: true, Planning: true})
	requireValidation(t, err, ModulesPlanningAttendanceMessage)

	want := domain.OrganizationModules{Stock: true, Processes: true, Attendance: true, Planning: true}
	tenant, err := s.PlatformSetTenantModules(ctx, actor, DemoTenantSlug, want)
	if err != nil || tenant == nil || tenant.Modules != want {
		t.Fatalf("set modules = %+v, %v", tenant, err)
	}
	if settings, err := s.OrganizationSettings(ctx); err != nil || settings.Modules != want {
		t.Fatalf("settings modules = %+v, %v", settings.Modules, err)
	}
	log, _ := s.PlatformAuditLog(ctx, 10, 0)
	if log.Total != 1 || log.Items[0].Detail["planning"] != "on" || log.Items[0].Detail["changed"] != "attendance,planning,processes" {
		t.Fatalf("audit = %+v", log)
	}

	// Turning processes off takes planning down with it on read.
	off := false
	if _, err := s.SetTenantModules(ctx, DemoTenantSlug, domain.OrganizationModulesUpdate{Planning: &off}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SetTenantModules(ctx, DemoTenantSlug, domain.OrganizationModulesUpdate{Processes: &off}); err != nil {
		t.Fatal(err)
	}
	if modules, _ := s.OrganizationModules(ctx); modules.Planning || modules.Processes || !modules.Attendance {
		t.Fatalf("modules after off = %+v", modules)
	}

	fixture := NewFixtureStore(t.TempDir())
	fixture.SetOrganizationModules(domain.OrganizationModules{Planning: true, Processes: true})
	if modules, _ := fixture.OrganizationModules(ctx); modules.Planning {
		t.Fatalf("fixture counted planning without stock: %+v", modules)
	}
}

func TestMachineTypesAndMachines(t *testing.T) {
	s, ctx := newPlanningStore(t)
	other := ContextWithTenant(context.Background(), "tenant-other")
	if err := s.EnsureTenant(context.Background(), "tenant-other", "other", "Other"); err != nil {
		t.Fatal(err)
	}

	offset, err := s.CreateMachineType(ctx, domain.MachineTypeInput{Name: "  Offset štampa "})
	if err != nil || offset.Name != "Offset štampa" || offset.CreatedAt == "" {
		t.Fatalf("create type = %+v, %v", offset, err)
	}
	if _, err := s.CreateMachineType(ctx, domain.MachineTypeInput{Name: "Offset štampa"}); !errors.Is(err, ErrMachineTypeNameTaken) {
		t.Fatalf("duplicate type = %v", err)
	}
	_, err = s.CreateMachineType(ctx, domain.MachineTypeInput{Name: " "})
	requireValidation(t, err, machineTypeNameRequired)
	_, err = s.CreateMachineType(ctx, domain.MachineTypeInput{Name: string(make([]rune, 121))})
	var validation *ValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("long name = %v", err)
	}
	// The same name is free in another organization.
	if _, err := s.CreateMachineType(other, domain.MachineTypeInput{Name: "Offset štampa"}); err != nil {
		t.Fatalf("same name in other tenant: %v", err)
	}
	cutter, err := s.CreateMachineType(ctx, domain.MachineTypeInput{Name: "Sečenje"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.UpdateMachineType(ctx, cutter.ID, domain.MachineTypeInput{Name: "Offset štampa"}); !errors.Is(err, ErrMachineTypeNameTaken) {
		t.Fatalf("rename to taken = %v", err)
	}
	renamed, err := s.UpdateMachineType(ctx, cutter.ID, domain.MachineTypeInput{Name: "Giljotina"})
	if err != nil || renamed.Name != "Giljotina" || renamed.CreatedAt != cutter.CreatedAt {
		t.Fatalf("rename = %+v, %v", renamed, err)
	}
	if _, err := s.UpdateMachineType(other, cutter.ID, domain.MachineTypeInput{Name: "X"}); !errors.Is(err, ErrMachineTypeNotFound) {
		t.Fatalf("cross-tenant rename = %v", err)
	}
	types, _ := s.MachineTypes(ctx)
	if len(types) != 2 || types[0].Name != "Giljotina" || types[1].Name != "Offset štampa" {
		t.Fatalf("types = %+v", types)
	}
	if otherTypes, _ := s.MachineTypes(other); len(otherTypes) != 1 {
		t.Fatalf("other tenant types = %+v", otherTypes)
	}

	// Machines.
	_, err = s.CreateMachine(ctx, domain.MachineInput{MachineTypeID: "nope", Name: "M1", InService: true})
	requireValidation(t, err, MachineTypeNotFoundMessage)
	_, err = s.CreateMachine(ctx, domain.MachineInput{MachineTypeID: offset.ID, Name: ""})
	requireValidation(t, err, machineNameRequired)
	_, err = s.CreateMachine(ctx, domain.MachineInput{MachineTypeID: offset.ID, Name: "M1", Note: string(make([]rune, 501))})
	requireValidation(t, err, machineNoteTooLong)
	// A type of another organization is unknown here.
	otherType, _ := s.MachineTypes(other)
	_, err = s.CreateMachine(ctx, domain.MachineInput{MachineTypeID: otherType[0].ID, Name: "M1", InService: true})
	requireValidation(t, err, MachineTypeNotFoundMessage)

	machine, err := s.CreateMachine(ctx, domain.MachineInput{MachineTypeID: offset.ID, Name: "Heidelberg #1", InService: true, Note: " stara "})
	if err != nil || machine.Note != "stara" || !machine.InService {
		t.Fatalf("create machine = %+v, %v", machine, err)
	}
	if _, err := s.CreateMachine(ctx, domain.MachineInput{MachineTypeID: offset.ID, Name: "Heidelberg #1", InService: true}); !errors.Is(err, ErrMachineNameTaken) {
		t.Fatalf("duplicate machine = %v", err)
	}
	updated, err := s.UpdateMachine(ctx, machine.ID, domain.MachineInput{MachineTypeID: offset.ID, Name: "Heidelberg #1", InService: false})
	if err != nil || updated.InService || updated.Note != "" || updated.CreatedAt != machine.CreatedAt {
		t.Fatalf("update machine = %+v, %v", updated, err)
	}
	if _, err := s.UpdateMachine(ctx, "nope", domain.MachineInput{MachineTypeID: offset.ID, Name: "X"}); !errors.Is(err, ErrMachineNotFound) {
		t.Fatalf("update unknown machine = %v", err)
	}
	if _, err := s.UpdateMachine(other, machine.ID, domain.MachineInput{MachineTypeID: otherType[0].ID, Name: "X"}); !errors.Is(err, ErrMachineNotFound) {
		t.Fatalf("cross-tenant machine update = %v", err)
	}

	// A type with machines cannot be deleted; deleting it removes qualifications.
	if err := s.DeleteMachineType(ctx, offset.ID); !errors.Is(err, ErrMachineTypeInUse) {
		t.Fatalf("delete type in use = %v", err)
	}
	if err := s.CreateUser(ctx, "u-ana", "ana", "pass12345", domain.RoleUser, false); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SetQualifications(ctx, "u-ana", domain.WorkerQualificationsInput{MachineTypeIDs: []string{cutter.ID}}); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteMachineType(other, cutter.ID); !errors.Is(err, ErrMachineTypeNotFound) {
		t.Fatalf("cross-tenant type delete = %v", err)
	}
	if err := s.DeleteMachineType(ctx, cutter.ID); err != nil {
		t.Fatal(err)
	}
	quals, _ := s.Qualifications(ctx)
	for _, entry := range quals {
		if entry.UserID == "u-ana" && len(entry.MachineTypeIDs) != 0 {
			t.Fatalf("qualification survived type deletion: %+v", entry)
		}
	}
	if err := s.DeleteMachineType(ctx, cutter.ID); !errors.Is(err, ErrMachineTypeNotFound) {
		t.Fatalf("delete again = %v", err)
	}
	if err := s.DeleteMachine(other, machine.ID); !errors.Is(err, ErrMachineNotFound) {
		t.Fatalf("cross-tenant machine delete = %v", err)
	}
	if err := s.DeleteMachine(ctx, machine.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteMachine(ctx, machine.ID); !errors.Is(err, ErrMachineNotFound) {
		t.Fatalf("delete machine again = %v", err)
	}
	if err := s.DeleteMachineType(ctx, offset.ID); err != nil {
		t.Fatalf("delete type after machines gone: %v", err)
	}
}

func TestQualificationsAndAttendance(t *testing.T) {
	s, ctx := newPlanningStore(t)
	if err := s.EnsureTenant(context.Background(), "tenant-other", "other", "Other"); err != nil {
		t.Fatal(err)
	}
	other := ContextWithTenant(context.Background(), "tenant-other")
	for _, user := range []struct{ id, name string }{{"u-ana", "ana"}, {"u-bora", "Bora"}} {
		if err := s.CreateUser(ctx, user.id, user.name, "pass12345", domain.RoleUser, false); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.CreateUser(other, "u-other", "zoran", "pass12345", domain.RoleUser, false); err != nil {
		t.Fatal(err)
	}
	printType, _ := s.CreateMachineType(ctx, domain.MachineTypeInput{Name: "Štampa"})

	quals, err := s.Qualifications(ctx)
	if err != nil || len(quals) != 2 || quals[0].Username != "ana" || quals[1].Username != "Bora" ||
		quals[0].MachineTypeIDs == nil {
		t.Fatalf("qualifications = %+v, %v", quals, err)
	}
	if _, err := s.SetQualifications(ctx, "u-ghost", domain.WorkerQualificationsInput{}); !errors.Is(err, ErrPlanningUserNotFound) {
		t.Fatalf("unknown user = %v", err)
	}
	if _, err := s.SetQualifications(ctx, "u-other", domain.WorkerQualificationsInput{}); !errors.Is(err, ErrPlanningUserNotFound) {
		t.Fatalf("other tenant's user = %v", err)
	}
	_, err = s.SetQualifications(ctx, "u-ana", domain.WorkerQualificationsInput{MachineTypeIDs: []string{printType.ID, "nope"}})
	requireValidation(t, err, MachineTypeNotFoundMessage)
	set, err := s.SetQualifications(ctx, "u-ana", domain.WorkerQualificationsInput{MachineTypeIDs: []string{printType.ID, printType.ID}})
	if err != nil || len(set.MachineTypeIDs) != 1 {
		t.Fatalf("set = %+v, %v", set, err)
	}
	if set, err = s.SetQualifications(ctx, "u-ana", domain.WorkerQualificationsInput{}); err != nil || set.MachineTypeIDs == nil || len(set.MachineTypeIDs) != 0 {
		t.Fatalf("clear = %+v, %v", set, err)
	}

	// Attendance: ana signed in on the local day (07:00 Belgrade = 05:00Z); Bora
	// signed in at 23:30 local the evening before (21:30Z), which is another day.
	if err := s.RecordLogin(ctx, DemoTenantID, "u-ana", time.Date(2026, 10, 19, 5, 0, 0, 0, time.UTC)); err != nil {
		t.Fatal(err)
	}
	if err := s.RecordLogin(ctx, DemoTenantID, "u-bora", time.Date(2026, 10, 18, 21, 30, 0, 0, time.UTC)); err != nil {
		t.Fatal(err)
	}
	entries, err := s.Attendance(ctx, "")
	if err != nil || len(entries) != 2 || entries[0].Date != "2026-10-19" {
		t.Fatalf("attendance = %+v, %v", entries, err)
	}
	if !entries[0].SignedIn || !entries[0].Present || entries[0].Override != nil || entries[1].SignedIn || entries[1].Present {
		t.Fatalf("attendance flags = %+v", entries)
	}
	absent, present := false, true
	entry, err := s.SetAttendance(ctx, "u-ana", domain.AttendanceInput{Date: "2026-10-19", Present: &absent})
	if err != nil || entry.Override == nil || *entry.Override || !entry.SignedIn || entry.Present {
		t.Fatalf("absent override = %+v, %v", entry, err)
	}
	entry, err = s.SetAttendance(ctx, "u-bora", domain.AttendanceInput{Date: "2026-10-19", Present: &present})
	if err != nil || !entry.Present || entry.SignedIn {
		t.Fatalf("present override = %+v, %v", entry, err)
	}
	entry, err = s.SetAttendance(ctx, "u-ana", domain.AttendanceInput{Date: "2026-10-19"})
	if err != nil || entry.Override != nil || !entry.Present {
		t.Fatalf("cleared override = %+v, %v", entry, err)
	}
	// The override is for that date only.
	if entries, _ = s.Attendance(ctx, "2026-10-20"); entries[1].Override != nil {
		t.Fatalf("override leaked to the next day: %+v", entries)
	}
	_, err = s.SetAttendance(ctx, "u-ana", domain.AttendanceInput{Date: "19.10.2026", Present: &present})
	requireValidation(t, err, invalidPlanningDate)
	if _, err := s.SetAttendance(ctx, "u-other", domain.AttendanceInput{Date: "2026-10-19", Present: &present}); !errors.Is(err, ErrPlanningUserNotFound) {
		t.Fatalf("other tenant's user = %v", err)
	}
	if _, err := s.Attendance(ctx, "2026-13-40"); err == nil {
		t.Fatal("malformed date accepted")
	}
	// Another organization's sign-ins and users never show up.
	if entries, _ := s.Attendance(other, "2026-10-19"); len(entries) != 1 || entries[0].SignedIn {
		t.Fatalf("other tenant attendance = %+v", entries)
	}
}

func TestWorkingHoursDefaultAndValidation(t *testing.T) {
	s, ctx := newPlanningStore(t)
	hours, err := s.WorkingHours(ctx)
	if err != nil || hours.TimeZone != domain.DefaultPlanningTimeZone || len(hours.Days) != 5 {
		t.Fatalf("default hours = %+v, %v", hours, err)
	}
	custom := domain.WorkingHours{TimeZone: "UTC", Days: []domain.WorkingDay{
		{Weekday: 3, Start: "08:00", End: "16:00"},
		{Weekday: 1, Start: "06:00", End: "14:00", Breaks: []domain.WorkingBreak{{Start: "10:00", End: "10:15"}}},
	}}
	saved, err := s.SetWorkingHours(ctx, custom)
	if err != nil || saved.Days[0].Weekday != 1 || saved.Days[1].Breaks == nil {
		t.Fatalf("saved = %+v, %v", saved, err)
	}
	if got, _ := s.WorkingHours(ctx); got.TimeZone != "UTC" || len(got.Days) != 2 {
		t.Fatalf("read back = %+v", got)
	}
	for name, bad := range map[string]domain.WorkingHours{
		"zone":    {TimeZone: "Mars/Olympus", Days: custom.Days},
		"weekday": {TimeZone: "UTC", Days: []domain.WorkingDay{{Weekday: 8, Start: "08:00", End: "16:00"}}},
		"order":   {TimeZone: "UTC", Days: []domain.WorkingDay{{Weekday: 1, Start: "16:00", End: "08:00"}}},
		"repeat": {TimeZone: "UTC", Days: []domain.WorkingDay{
			{Weekday: 1, Start: "08:00", End: "16:00"}, {Weekday: 1, Start: "08:00", End: "16:00"},
		}},
	} {
		_, err := s.SetWorkingHours(ctx, bad)
		var validation *ValidationError
		if !errors.As(err, &validation) || validation.Error() == "" {
			t.Errorf("%s: err = %v, want validation error", name, err)
		}
	}
	if got, _ := s.WorkingHours(ctx); got.TimeZone != "UTC" {
		t.Fatalf("a rejected save changed the hours: %+v", got)
	}
}

func machineStepGraph(typeID string) domain.ProcessGraph {
	setup, perUnit, crew := 30.0, 0.1, 1
	return domain.ProcessGraph{
		Nodes: []domain.ProcessNode{
			{ID: "print", Kind: domain.ProcessNodeStep, Label: "Štampa", MachineTypeID: typeID, CrewSize: &crew, SetupMinutes: &setup, MinutesPerUnit: &perUnit},
			{ID: "out", Kind: domain.ProcessNodeProduct, Label: "Otisci", Quantity: stockQty(1000)},
		},
		Edges: []domain.ProcessEdge{{ID: "e1", Source: "print", Target: "out"}},
	}
}

func TestProcessGraphMachineTypeValidation(t *testing.T) {
	s, ctx := newPlanningStore(t)
	enablePlanning(t, s, DemoTenantSlug)
	machineType, err := s.CreateMachineType(ctx, domain.MachineTypeInput{Name: "Štampa"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.CreateProcessTemplate(ctx, domain.ProcessTemplateInput{Name: "Loš", Graph: machineStepGraph("mtype-missing")})
	requireValidation(t, err, MachineTypeNotFoundMessage)
	template, err := s.CreateProcessTemplate(ctx, domain.ProcessTemplateInput{Name: "Dobar", Graph: machineStepGraph(machineType.ID)})
	if err != nil || template.Graph.Nodes[0].MachineTypeID != machineType.ID {
		t.Fatalf("create = %+v, %v", template, err)
	}
	if _, err := s.UpdateProcessTemplate(ctx, template.ID, domain.ProcessTemplateInput{Name: "Dobar", Graph: machineStepGraph("mtype-missing")}); err == nil {
		t.Fatal("changed to an unknown type was accepted")
	}

	order := newStockOrder(t, ctx, s)
	process, err := s.ApplyProcessTemplate(ctx, order.ID, template.ID, "admin")
	if err != nil {
		t.Fatal(err)
	}
	// Deleting the type does not make the stored process or template unsavable.
	if err := s.DeleteMachineType(ctx, machineType.ID); err != nil {
		t.Fatal(err)
	}
	renamed := domain.CloneProcessGraph(process.Graph)
	renamed.Nodes[1].Label = "Otisci v2"
	if _, err := s.UpdateWorkOrderProcess(ctx, order.ID, renamed, "admin", true); err != nil {
		t.Fatalf("save with a stale unchanged type: %v", err)
	}
	if _, err := s.UpdateProcessTemplate(ctx, template.ID, domain.ProcessTemplateInput{Name: "Dobar v2", Graph: machineStepGraph(machineType.ID)}); err != nil {
		t.Fatalf("template save with a stale unchanged type: %v", err)
	}
	// ...but pointing a step at the deleted type again is refused.
	other := domain.CloneProcessGraph(renamed)
	other.Nodes[0].ID = "print2"
	other.Edges[0].Source = "print2"
	if _, err := s.UpdateWorkOrderProcess(ctx, order.ID, other, "admin", true); err == nil {
		t.Fatal("a renamed step kept a stale type")
	}
}

func TestPlanningTablesInTenantExport(t *testing.T) {
	s, ctx := newPlanningStore(t)
	machineType, _ := s.CreateMachineType(ctx, domain.MachineTypeInput{Name: "Štampa"})
	if _, err := s.CreateMachine(ctx, domain.MachineInput{MachineTypeID: machineType.ID, Name: "M1", InService: true}); err != nil {
		t.Fatal(err)
	}
	if err := s.CreateUser(ctx, "u-ana", "ana", "pass12345", domain.RoleUser, false); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SetQualifications(ctx, "u-ana", domain.WorkerQualificationsInput{MachineTypeIDs: []string{machineType.ID}}); err != nil {
		t.Fatal(err)
	}
	present := true
	if _, err := s.SetAttendance(ctx, "u-ana", domain.AttendanceInput{Date: "2026-10-19", Present: &present}); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"machine_types", "machines", "worker_qualifications", "attendance_overrides", "production_plans"} {
		found := false
		for _, listed := range tenantDataTables {
			found = found || listed.name == table
		}
		if !found {
			t.Errorf("%s missing from tenantDataTables", table)
		}
	}
}

type planningScenario struct {
	s       *SQLiteStore
	ctx     context.Context
	typeID  string
	machine *domain.Machine
	orderID string
}

func (p planningScenario) newOrder(t *testing.T, client string, quantity int, due *string, typeID string) *domain.WorkOrder {
	t.Helper()
	order, err := p.s.CreateWorkOrder(p.ctx, domain.CreateWorkOrderInput{
		ClientName: client, JobDescription: "Posao", IssuedBy: "admin", IssueDate: "2026-10-01", DueDate: due,
		JobDetails: &domain.JobDetails{Quantity: &quantity}, Assignment: domain.Assignment{Priority: "normal"},
	})
	if err != nil {
		t.Fatal(err)
	}
	template, err := p.s.CreateProcessTemplate(p.ctx, domain.ProcessTemplateInput{Name: "Proces " + client, Graph: machineStepGraph(typeID)})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := p.s.ApplyProcessTemplate(p.ctx, order.ID, template.ID, "admin"); err != nil {
		t.Fatal(err)
	}
	return order
}

func (p planningScenario) setStepStatus(t *testing.T, orderID string, status domain.ProcessStepStatus) {
	t.Helper()
	process, err := p.s.WorkOrderProcess(p.ctx, orderID)
	if err != nil || process == nil {
		t.Fatalf("process = %v, %v", process, err)
	}
	graph := domain.CloneProcessGraph(process.Graph)
	for i := range graph.Nodes {
		if graph.Nodes[i].Kind == domain.ProcessNodeStep {
			graph.Nodes[i].Status = status
		}
	}
	if _, err := p.s.UpdateWorkOrderProcess(p.ctx, orderID, graph, "ana", false); err != nil {
		t.Fatal(err)
	}
}

func newPlanningScenario(t *testing.T) planningScenario {
	t.Helper()
	s, ctx := newPlanningStore(t)
	enablePlanning(t, s, DemoTenantSlug)
	machineType, err := s.CreateMachineType(ctx, domain.MachineTypeInput{Name: "Štampa"})
	if err != nil {
		t.Fatal(err)
	}
	machine, err := s.CreateMachine(ctx, domain.MachineInput{MachineTypeID: machineType.ID, Name: "M1", InService: true})
	if err != nil {
		t.Fatal(err)
	}
	for _, user := range []struct{ id, name string }{{"u-ana", "ana"}, {"u-bora", "bora"}} {
		if err := s.CreateUser(ctx, user.id, user.name, "pass12345", domain.RoleUser, false); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.SetQualifications(ctx, "u-ana", domain.WorkerQualificationsInput{MachineTypeIDs: []string{machineType.ID}}); err != nil {
		t.Fatal(err)
	}
	// Only ana signed in today (05:00 local).
	if err := s.RecordLogin(ctx, DemoTenantID, "u-ana", time.Date(2026, 10, 19, 3, 0, 0, 0, time.UTC)); err != nil {
		t.Fatal(err)
	}
	p := planningScenario{s: s, ctx: ctx, typeID: machineType.ID, machine: machine}
	p.orderID = p.newOrder(t, "Alfa", 1000, nil, machineType.ID).ID
	return p
}

func TestPlanLifecycle(t *testing.T) {
	p := newPlanningScenario(t)
	s, ctx := p.s, p.ctx
	const today = "2026-10-19"

	// Dates that cannot be planned.
	_, err := s.GeneratePlan(ctx, domain.PlanGenerateInput{Date: "2026-10-18"}, "admin")
	requireValidation(t, err, planPastDateMessage)
	_, err = s.GeneratePlan(ctx, domain.PlanGenerateInput{Date: "2026-10-20", Replan: true}, "admin")
	requireValidation(t, err, planReplanTodayMessage)
	_, err = s.GeneratePlan(ctx, domain.PlanGenerateInput{Date: "soon"}, "admin")
	requireValidation(t, err, invalidPlanningDate)

	// No draft yet.
	if _, err := s.SavePlanDraft(ctx, domain.PlanDraftInput{Date: today}, "admin"); !errors.Is(err, ErrPlanDraftNotFound) {
		t.Fatalf("save without draft = %v", err)
	}
	if _, err := s.PublishPlan(ctx, domain.PlanPublishInput{Date: today}, "admin"); !errors.Is(err, ErrPlanDraftNotFound) {
		t.Fatalf("publish without draft = %v", err)
	}
	if err := s.DiscardPlanDraft(ctx, today); err != nil {
		t.Fatalf("discard without draft = %v", err)
	}

	// A day off yields an empty plan.
	empty, err := s.GeneratePlan(ctx, domain.PlanGenerateInput{Date: "2026-10-24"}, "admin")
	if err != nil || len(empty.Assignments) != 0 || empty.Assignments == nil || empty.Issues == nil || empty.LateOrders == nil {
		t.Fatalf("day off plan = %+v, %v", empty, err)
	}

	// An order whose step names a machine type that no longer exists is reported.
	ghostType, _ := s.CreateMachineType(ctx, domain.MachineTypeInput{Name: "Privremena"})
	ghost := p.newOrder(t, "Duh", 10, nil, ghostType.ID)
	if err := s.DeleteMachineType(ctx, ghostType.ID); err != nil {
		t.Fatal(err)
	}

	draft, err := s.GeneratePlan(ctx, domain.PlanGenerateInput{Date: today}, "admin")
	if err != nil {
		t.Fatal(err)
	}
	if draft.Status != domain.PlanStatusDraft || draft.Date != today || draft.GeneratedBy != "admin" || draft.PublishedAt != nil {
		t.Fatalf("draft = %+v", draft)
	}
	if len(draft.Assignments) != 1 {
		t.Fatalf("assignments = %+v", draft.Assignments)
	}
	block := draft.Assignments[0]
	if block.WorkOrderID != p.orderID || block.LeadUserID != "u-ana" || block.MachineName != "M1" ||
		block.Start != today+"T07:00" || block.Minutes != 130 || block.Part != 1 || block.Parts != 1 || block.Locked {
		t.Fatalf("block = %+v", block)
	}
	foundGhost := false
	for _, issue := range draft.Issues {
		foundGhost = foundGhost || (issue.Code == domain.PlanIssueUnknownMachineType && issue.WorkOrderID == ghost.ID)
	}
	if !foundGhost {
		t.Fatalf("issues = %+v", draft.Issues)
	}

	// Generating again replaces the draft instead of adding a second one.
	again, err := s.GeneratePlan(ctx, domain.PlanGenerateInput{Date: today}, "admin")
	if err != nil || again.ID == draft.ID {
		t.Fatalf("regenerate = %+v, %v", again, err)
	}
	var drafts int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM production_plans WHERE status = 'draft' AND date = ?`, today).Scan(&drafts)
	if drafts != 1 {
		t.Fatalf("drafts = %d", drafts)
	}

	// Admins see the draft, operators do not.
	day, err := s.PlanDay(ctx, "", true)
	if err != nil || day.Date != today || day.Draft == nil || day.Published != nil || day.Drift != nil {
		t.Fatalf("admin day = %+v, %v", day, err)
	}
	if day, _ = s.PlanDay(ctx, today, false); day.Draft != nil {
		t.Fatalf("operator saw the draft: %+v", day)
	}

	// Save a hand edit: moved to bora (not qualified), who is not present, plus
	// a second block booked on the same machine at the same time.
	edited := again.Assignments[0]
	edited.LeadUserID, edited.UserIDs = "u-bora", []string{"u-bora"}
	twin := again.Assignments[0]
	twin.ID = "twin"
	saved, err := s.SavePlanDraft(ctx, domain.PlanDraftInput{Date: today, Assignments: []domain.PlanAssignment{edited, twin}}, "boss")
	if err != nil || len(saved.Assignments) != 2 || saved.UpdatedBy != "boss" || saved.GeneratedBy != "admin" || saved.Issues == nil {
		t.Fatalf("saved = %+v, %v", saved, err)
	}
	conflicts := 0
	for _, issue := range saved.Issues {
		if issue.Code == domain.PlanIssueConflict {
			conflicts++
		}
	}
	if conflicts == 0 {
		t.Fatalf("no conflicts reported for a double booking: %+v", saved.Issues)
	}
	tooMany := make([]domain.PlanAssignment, domain.MaxPlanAssignments+1)
	_, err = s.SavePlanDraft(ctx, domain.PlanDraftInput{Date: today, Assignments: tooMany}, "boss")
	requireValidation(t, err, "Plan može imati najviše 2000 blokova.")

	// Restore the generated plan and publish it.
	if _, err := s.SavePlanDraft(ctx, domain.PlanDraftInput{Date: today, Assignments: again.Assignments}, "boss"); err != nil {
		t.Fatal(err)
	}
	published, err := s.PublishPlan(ctx, domain.PlanPublishInput{Date: today}, "boss")
	if err != nil || published.Status != domain.PlanStatusPublished || published.PublishedBy == nil || *published.PublishedBy != "boss" ||
		published.PublishedAt == nil || len(published.Assignments) != 1 {
		t.Fatalf("published = %+v, %v", published, err)
	}
	day, _ = s.PlanDay(ctx, today, true)
	if day.Draft != nil || day.Published == nil || day.Drift == nil || day.Drift.Suggested || day.Drift.Reasons == nil {
		t.Fatalf("day after publish = %+v", day)
	}
	// Publishing replaces the earlier published plan of the date.
	if _, err := s.GeneratePlan(ctx, domain.PlanGenerateInput{Date: today}, "admin"); err != nil {
		t.Fatal(err)
	}
	second, err := s.PublishPlan(ctx, domain.PlanPublishInput{Date: today}, "admin")
	if err != nil || second.ID == published.ID {
		t.Fatalf("second publish = %+v, %v", second, err)
	}
	var plans int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM production_plans WHERE date = ?`, today).Scan(&plans)
	if plans != 1 {
		t.Fatalf("plans for the date = %d, want only the published one", plans)
	}

	// My queue: only the crew sees the block, with the step's current status.
	queue, err := s.MyQueue(ctx, "u-ana", "")
	if err != nil || queue.Date != today || queue.PublishedAt == nil || len(queue.Items) != 1 {
		t.Fatalf("ana queue = %+v, %v", queue, err)
	}
	if item := queue.Items[0]; !item.IsLead || item.StepStatus != domain.ProcessStepPending || item.MachineName != "M1" {
		t.Fatalf("item = %+v", item)
	}
	if queue, _ = s.MyQueue(ctx, "u-bora", today); queue.Items == nil || len(queue.Items) != 0 {
		t.Fatalf("bora queue = %+v", queue)
	}
	if queue, _ = s.MyQueue(ctx, "u-ana", "2026-10-20"); queue.PublishedAt != nil || queue.Items == nil || len(queue.Items) != 0 {
		t.Fatalf("queue without a plan = %+v", queue)
	}
	p.setStepStatus(t, p.orderID, domain.ProcessStepInProgress)
	if queue, _ = s.MyQueue(ctx, "u-ana", today); queue.Items[0].StepStatus != domain.ProcessStepInProgress {
		t.Fatalf("status = %+v", queue.Items[0])
	}
	p.setStepStatus(t, p.orderID, domain.ProcessStepPending)

	// Drift: two hours into the shift the block should have started.
	s.SetClock(func() time.Time { return time.Date(2026, 10, 19, 6, 0, 0, 0, time.UTC) }) // 08:00 local
	day, _ = s.PlanDay(ctx, today, true)
	if day.Drift == nil || !day.Drift.Suggested || len(day.Drift.Reasons) == 0 {
		t.Fatalf("drift = %+v", day.Drift)
	}
	// Re-plan with the step now in progress keeps it as a locked block.
	p.setStepStatus(t, p.orderID, domain.ProcessStepInProgress)
	replan, err := s.GeneratePlan(ctx, domain.PlanGenerateInput{Date: today, Replan: true}, "admin")
	if err != nil {
		t.Fatal(err)
	}
	lockedFound := false
	for _, assignment := range replan.Assignments {
		if assignment.WorkOrderID == p.orderID && assignment.Locked {
			lockedFound = true
		}
	}
	if !lockedFound {
		t.Fatalf("replan lost the locked block: %+v", replan.Assignments)
	}
	if day, _ = s.PlanDay(ctx, today, true); day.Draft == nil || day.Published == nil {
		t.Fatalf("draft and published should coexist: %+v", day)
	}

	// Tenant isolation.
	if err := s.EnsureTenant(context.Background(), "tenant-other", "other", "Other"); err != nil {
		t.Fatal(err)
	}
	other := ContextWithTenant(context.Background(), "tenant-other")
	if day, err = s.PlanDay(other, today, true); err != nil || day.Draft != nil || day.Published != nil {
		t.Fatalf("other tenant day = %+v, %v", day, err)
	}
	if _, err := s.PublishPlan(other, domain.PlanPublishInput{Date: today}, "x"); !errors.Is(err, ErrPlanDraftNotFound) {
		t.Fatalf("other tenant publish = %v", err)
	}
	if forecast, err := s.Forecast(other); err != nil || len(forecast) != 0 {
		t.Fatalf("other tenant forecast = %+v, %v", forecast, err)
	}
}

func TestPlanFutureDateCountsEveryonePresent(t *testing.T) {
	p := newPlanningScenario(t)
	// Tomorrow nobody has signed in yet, but ana (the only qualified person) is
	// presumed present, so the order is planned; marking her absent leaves it
	// without workers.
	plan, err := p.s.GeneratePlan(p.ctx, domain.PlanGenerateInput{Date: "2026-10-20"}, "admin")
	if err != nil || len(plan.Assignments) != 1 || plan.Assignments[0].Start != "2026-10-20T07:00" {
		t.Fatalf("future plan = %+v, %v", plan, err)
	}
	absent := false
	if _, err := p.s.SetAttendance(p.ctx, "u-ana", domain.AttendanceInput{Date: "2026-10-20", Present: &absent}); err != nil {
		t.Fatal(err)
	}
	plan, err = p.s.GeneratePlan(p.ctx, domain.PlanGenerateInput{Date: "2026-10-20"}, "admin")
	if err != nil || len(plan.Assignments) != 0 {
		t.Fatalf("plan with the only qualified worker absent = %+v, %v", plan, err)
	}
	// The step slips to the next day she is present instead.
	forecast, err := p.s.Forecast(p.ctx)
	if err != nil || len(forecast) != 1 || forecast[0].EstimatedFinish == nil {
		t.Fatalf("forecast = %+v, %v", forecast, err)
	}
}

func TestPlanningForecast(t *testing.T) {
	p := newPlanningScenario(t)
	late := "2026-10-19"
	lateOrder := p.newOrder(t, "Kasni", 2000, &late, p.typeID) // 230 min after Alfa's 130
	forecast, err := p.s.Forecast(p.ctx)
	if err != nil || len(forecast) != 2 {
		t.Fatalf("forecast = %+v, %v", forecast, err)
	}
	for _, entry := range forecast {
		if entry.EstimatedFinish == nil || entry.Unplannable {
			t.Fatalf("entry = %+v", entry)
		}
	}
	byID := map[string]domain.OrderForecast{}
	for _, entry := range forecast {
		byID[entry.WorkOrderID] = entry
	}
	if byID[lateOrder.ID].DueDate == nil || byID[p.orderID].Late {
		t.Fatalf("forecast = %+v", forecast)
	}
	// Unplannable orders sort last.
	ghostType, _ := p.s.CreateMachineType(p.ctx, domain.MachineTypeInput{Name: "Privremena"})
	ghost := p.newOrder(t, "Duh", 10, nil, ghostType.ID)
	if err := p.s.DeleteMachineType(p.ctx, ghostType.ID); err != nil {
		t.Fatal(err)
	}
	forecast, err = p.s.Forecast(p.ctx)
	if err != nil || len(forecast) != 3 || forecast[2].WorkOrderID != ghost.ID || !forecast[2].Unplannable || forecast[2].EstimatedFinish != nil {
		t.Fatalf("forecast with an unplannable order = %+v, %v", forecast, err)
	}
	// Completed orders are not forecast.
	for _, status := range []string{"assigned", "inProgress", "completed"} {
		if _, err := p.s.UpdateWorkOrder(p.ctx, p.orderID, domain.UpdateWorkOrderInput{"status": []byte(`"` + status + `"`)}); err != nil {
			t.Fatal(err)
		}
	}
	if forecast, _ = p.s.Forecast(p.ctx); len(forecast) != 2 {
		t.Fatalf("forecast after completing an order = %+v", forecast)
	}
}

// TestPlanningMigration upgrades a v30 database: v31 adds the planning tables
// (v28 stays absent), keeps existing rows, and cascades qualifications and
// overrides when a user goes away.
func TestPlanningMigration(t *testing.T) {
	ctx := context.Background()
	db, err := sql.Open("sqlite", buildDSN(filepath.Join(t.TempDir(), "iris.db")))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(2)
	migrateSQLiteBelow(t, ctx, db, 31)
	if _, err := db.ExecContext(ctx, `INSERT INTO tenants(id, slug, name) VALUES ('t1', 'prva', 'Prva')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO users(id, tenant_id, username, password_hash, role) VALUES ('u1', 't1', 'ana', 'x', 'user')`); err != nil {
		t.Fatal(err)
	}
	if err := RunMigrations(ctx, db); err != nil {
		t.Fatal(err)
	}
	var versions string
	if err := db.QueryRowContext(ctx, `SELECT group_concat(version) FROM schema_migrations WHERE version >= 27`).Scan(&versions); err != nil {
		t.Fatal(err)
	}
	if versions != "27,29,30,31" {
		t.Fatalf("versions = %s", versions)
	}
	mustExec := func(query string, args ...any) {
		t.Helper()
		if _, err := db.ExecContext(ctx, query, args...); err != nil {
			t.Fatalf("%s: %v", query, err)
		}
	}
	mustExec(`INSERT INTO machine_types(id, tenant_id, name, created_at, updated_at) VALUES ('mt1', 't1', 'Štampa', 'now', 'now')`)
	mustExec(`INSERT INTO machines(id, tenant_id, machine_type_id, name, created_at, updated_at) VALUES ('m1', 't1', 'mt1', 'M1', 'now', 'now')`)
	mustExec(`INSERT INTO worker_qualifications(tenant_id, user_id, machine_type_id) VALUES ('t1', 'u1', 'mt1')`)
	mustExec(`INSERT INTO attendance_overrides(tenant_id, user_id, date, present) VALUES ('t1', 'u1', '2026-10-19', 1)`)
	mustExec(`INSERT INTO production_plans(id, tenant_id, date, status, generated_at, updated_at, data) VALUES ('p1', 't1', '2026-10-19', 'draft', 'now', 'now', '{}')`)
	if _, err := db.ExecContext(ctx, `INSERT INTO production_plans(id, tenant_id, date, status, generated_at, updated_at, data) VALUES ('p2', 't1', '2026-10-19', 'draft', 'now', 'now', '{}')`); err == nil {
		t.Fatal("two drafts for one date were accepted")
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO production_plans(id, tenant_id, date, status, generated_at, updated_at, data) VALUES ('p3', 't1', '2026-10-19', 'weird', 'now', 'now', '{}')`); err == nil {
		t.Fatal("unknown plan status was accepted")
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO machine_types(id, tenant_id, name, created_at, updated_at) VALUES ('mt2', 't1', 'štampa', 'now', 'now')`); err != nil {
		t.Fatalf("non-ASCII case differs in SQLite NOCASE: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO machine_types(id, tenant_id, name, created_at, updated_at) VALUES ('mt3', 't1', 'STAMPA', 'now', 'now')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO machine_types(id, tenant_id, name, created_at, updated_at) VALUES ('mt4', 't1', 'stampa', 'now', 'now')`); err == nil {
		t.Fatal("machine type names are not unique case-insensitively")
	}
	mustExec(`DELETE FROM users WHERE id = 'u1'`)
	for _, table := range []string{"worker_qualifications", "attendance_overrides"} {
		var rows int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM `+table).Scan(&rows); err != nil || rows != 0 {
			t.Fatalf("%s rows after deleting the user = %d, %v", table, rows, err)
		}
	}
}

func TestPlanningMigrationTranslatesForPostgres(t *testing.T) {
	translated := translateToPostgres(planningMigration)
	if strings.Contains(translated, "NOCASE") || strings.Contains(translated, "COLLATE NOCASE") {
		t.Fatalf("NOCASE left in the Postgres statement:\n%s", translated)
	}
	for _, table := range []string{"machine_types", "machines", "worker_qualifications", "attendance_overrides", "production_plans"} {
		if !strings.Contains(translated, "CREATE TABLE IF NOT EXISTS "+table) {
			t.Errorf("%s missing from the translated migration", table)
		}
	}
}
