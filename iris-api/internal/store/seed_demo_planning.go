package store

import (
	"fmt"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Planning, attendance and the platform side of the demo: machine types and
// units (one out of service), who may run what, working hours with a Saturday
// shift, two weeks of sign-in history, attendance overrides, a published plan
// for today and the next working day, a draft for the day after, and the
// welcome announcement and organization notes the Backoffice shows.

// demoMachineTypes are the print shop's machine types (D-026) with their units.
var demoMachineTypes = []struct {
	key, name string
	units     []demoMachine
}{
	{"ctp", "CTP (osvetljavanje ploča)", []demoMachine{{name: "Kodak Magnus 400"}}},
	{"offset", "Offset štampa B2", []demoMachine{{name: "Heidelberg SM52 #1"}, {name: "Heidelberg SM52 #2", outOfService: true, note: "Servis valjaka – vraća se u pogon u petak."}}},
	{"digital", "Digitalna štampa", []demoMachine{{name: "Konica Minolta C14000"}, {name: "Xerox Versant 280"}}},
	{"ploter", "Ploter velikog formata", []demoMachine{{name: "Mimaki JV330"}}},
	{"sekac", "Sekač (giljotina)", []demoMachine{{name: "Polar 78"}}},
	{"savijacica", "Savijačica", []demoMachine{{name: "Horizon AF-406F"}}},
	{"povez", "Mašina za povez žicom", []demoMachine{{name: "Müller Martini Presto"}}},
	{"spirala", "Spiralni povez", []demoMachine{{name: "Renz SRW 360"}}},
}

type demoMachine struct {
	name         string
	outOfService bool
	note         string
}

// demoQualifications says which machine types each demo user may lead.
var demoQualifications = map[string][]string{
	demoAdminUsername:    {"ctp", "offset", "digital", "ploter", "sekac", "savijacica", "povez", "spirala"},
	demoOperatorUsername: {"offset", "digital", "sekac"},
	"ana.jovic":          {"offset", "ctp", "ploter"},
	"marko.petrovic":     {"digital", "ploter", "sekac"},
	"jelena.markovic":    {"savijacica", "povez", "sekac", "spirala"},
	"stefan.nikolic":     {"offset", "povez", "digital"},
}

// machines adds the machine types and units, the users' qualifications and the
// working hours: the default Monday–Friday shift plus a short Saturday.
func (b *demoContentBuilder) machines() error {
	for _, mt := range demoMachineTypes {
		created, err := b.s.CreateMachineType(b.ctx, domain.MachineTypeInput{Name: mt.name})
		if err != nil {
			return fmt.Errorf("demo machine type %s: %w", mt.name, err)
		}
		b.machineTypes[mt.key] = created.ID
		for _, unit := range mt.units {
			if _, err := b.s.CreateMachine(b.ctx, domain.MachineInput{
				MachineTypeID: created.ID, Name: unit.name, InService: !unit.outOfService, Note: unit.note,
			}); err != nil {
				return fmt.Errorf("demo machine %s: %w", unit.name, err)
			}
			b.machineCount++
		}
	}
	workers, err := b.s.Qualifications(b.ctx)
	if err != nil {
		return err
	}
	for _, worker := range workers {
		keys, ok := demoQualifications[worker.Username]
		if !ok {
			continue
		}
		ids := make([]string, 0, len(keys))
		for _, key := range keys {
			ids = append(ids, b.machineTypes[key])
		}
		if _, err := b.s.SetQualifications(b.ctx, worker.UserID, domain.WorkerQualificationsInput{MachineTypeIDs: ids}); err != nil {
			return fmt.Errorf("demo qualifications %s: %w", worker.Username, err)
		}
	}
	hours := domain.DefaultWorkingHours()
	hours.Days = append(hours.Days, domain.WorkingDay{Weekday: 6, Start: "08:00", End: "12:00", Breaks: []domain.WorkingBreak{}})
	if _, err := b.s.SetWorkingHours(b.ctx, hours); err != nil {
		return fmt.Errorf("demo working hours: %w", err)
	}
	return nil
}

// demoSignIns says which working days of the last two weeks each user signed
// in on (offset from today, as a skip list) and at what minute past the shift
// start. Today only some have arrived, so "Prisustvo" shows a mix and the
// day's plan uses the people actually in.
var demoSignIns = map[string]struct {
	minute int
	skip   map[int]bool
	today  bool
}{
	demoAdminUsername:    {minute: 5, today: true},
	demoOperatorUsername: {minute: -2, today: true},
	"marko.petrovic":     {minute: 10, skip: map[int]bool{-9: true, -3: true}, today: true},
	"ana.jovic":          {minute: 3, skip: map[int]bool{-12: true, -11: true, -10: true}},
	"jelena.markovic":    {minute: 7, skip: map[int]bool{-6: true}, today: true},
	"stefan.nikolic":     {minute: 15, skip: map[int]bool{-13: true, -8: true, -4: true, -1: true}},
}

// attendance records the sign-in history (login_events, which also feeds the
// Backoffice activity counts) and two overrides: one operator marked present
// today although not signed in, one on leave on the next working day.
func (b *demoContentBuilder) attendance() error {
	tenantID, err := tenantFromContext(b.ctx)
	if err != nil {
		return err
	}
	hours, err := b.s.WorkingHours(b.ctx)
	if err != nil {
		return err
	}
	for offset := -14; offset <= 0; offset++ {
		date := b.day(offset)
		day, working := workingDay(hours, date)
		if !working {
			continue
		}
		shift, ok := clockOn(date, day.Start, b.location)
		if !ok {
			return fmt.Errorf("demo attendance: bad shift start %q", day.Start)
		}
		for username, pattern := range demoSignIns {
			user, ok := b.users[username]
			if !ok || pattern.skip[offset] || (offset == 0 && !pattern.today) {
				continue
			}
			at := shift.Add(time.Duration(pattern.minute) * time.Minute)
			if offset == 0 && !at.Before(b.now) {
				at = b.now.Add(-time.Minute)
			}
			if err := b.s.RecordLogin(b.ctx, tenantID, user.ID, at); err != nil {
				return fmt.Errorf("demo sign-in %s: %w", username, err)
			}
		}
	}
	present, absent := true, false
	if _, working := workingDay(hours, b.day(0)); working {
		if _, err := b.s.SetAttendance(b.ctx, b.users["stefan.nikolic"].ID, domain.AttendanceInput{Date: b.day(0), Present: &present}); err != nil {
			return fmt.Errorf("demo attendance override: %w", err)
		}
	}
	if _, err := b.s.SetAttendance(b.ctx, b.users["jelena.markovic"].ID, domain.AttendanceInput{Date: b.nextWorkingDay(hours, 1), Present: &absent}); err != nil {
		return fmt.Errorf("demo attendance override: %w", err)
	}
	return nil
}

// nextWorkingDay returns the first working day strictly after today + from - 1,
// i.e. from = 1 gives the next working day after today.
func (b *demoContentBuilder) nextWorkingDay(hours domain.WorkingHours, from int) string {
	for offset := from; offset < from+14; offset++ {
		if _, working := workingDay(hours, b.day(offset)); working {
			return b.day(offset)
		}
	}
	return b.day(from)
}

// plans generates and publishes today's plan (on a working day) and the next
// working day's, and leaves a draft for the day after so the planning page
// shows both states and "Moj red" has a queue.
func (b *demoContentBuilder) plans() error {
	hours, err := b.s.WorkingHours(b.ctx)
	if err != nil {
		return err
	}
	publish := func(date string) error {
		if _, err := b.s.GeneratePlan(b.ctx, domain.PlanGenerateInput{Date: date}, demoAdminUsername); err != nil {
			return fmt.Errorf("demo plan %s: %w", date, err)
		}
		if _, err := b.s.PublishPlan(b.ctx, domain.PlanPublishInput{Date: date}, demoAdminUsername); err != nil {
			return fmt.Errorf("demo publish plan %s: %w", date, err)
		}
		b.publishedPlans = append(b.publishedPlans, date)
		return nil
	}
	if _, working := workingDay(hours, b.day(0)); working {
		if err := publish(b.day(0)); err != nil {
			return err
		}
	}
	next := b.nextWorkingDay(hours, 1)
	if err := publish(next); err != nil {
		return err
	}
	nextOffset := 1
	for b.day(nextOffset) != next {
		nextOffset++
	}
	after := b.nextWorkingDay(hours, nextOffset+1)
	if _, err := b.s.GeneratePlan(b.ctx, domain.PlanGenerateInput{Date: after}, demoAdminUsername); err != nil {
		return fmt.Errorf("demo draft plan %s: %w", after, err)
	}
	b.draftPlan = after
	return nil
}

// platform writes the two platform-level rows that show inside the demo
// organization or on its Backoffice card: a welcome announcement (visible in
// the app and on /login/demo) and the superadmins' internal notes.
func (b *demoContentBuilder) platform() error {
	if _, err := b.s.PlatformCreateAnnouncement(b.ctx, demoSeedActor, domain.PlatformAnnouncementInput{
		Message:     "Dobro došli u demo organizaciju. Podaci su izmišljeni i povremeno se vraćaju na početno stanje – slobodno menjajte šta god želite.",
		Severity:    domain.AnnouncementInfo,
		TenantSlugs: []string{b.slug},
	}, b.now); err != nil {
		return fmt.Errorf("demo announcement: %w", err)
	}
	if _, err := b.s.PlatformSetTenantNotes(b.ctx, demoSeedActor, b.slug, domain.PlatformTenantNotesInput{
		ContactName: "Iris tim", ContactEmail: "demo@iris.example", Plan: "Demo",
		Notes: "Pokazna organizacija koju pravi irisctl seed-demo. Nije klijent – ne naplaćuje se.",
	}); err != nil {
		return fmt.Errorf("demo tenant notes: %w", err)
	}
	return nil
}
