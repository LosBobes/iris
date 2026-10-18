package planner

import (
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func TestValidateWorkingHours(t *testing.T) {
	day := func(weekday int, start, end string, breaks ...domain.WorkingBreak) domain.WorkingDay {
		return domain.WorkingDay{Weekday: weekday, Start: start, End: end, Breaks: breaks}
	}
	br := func(s, e string) domain.WorkingBreak { return domain.WorkingBreak{Start: s, End: e} }
	hours := func(tz string, days ...domain.WorkingDay) domain.WorkingHours {
		return domain.WorkingHours{TimeZone: tz, Days: days}
	}
	const tz = "Europe/Belgrade"

	valid := []struct {
		name  string
		hours domain.WorkingHours
	}{
		{"default", domain.DefaultWorkingHours()},
		{"no days", hours(tz)},
		{"utc", hours("UTC", day(1, "00:00", "23:59"))},
		{"touching breaks", hours(tz, day(1, "07:00", "15:00", br("10:00", "10:15"), br("10:15", "10:30")))},
		{"unsorted breaks", hours(tz, day(1, "07:00", "15:00", br("12:00", "12:30"), br("10:00", "10:15")))},
		{"break at the edges", hours(tz, day(1, "07:00", "15:00", br("07:00", "07:15"), br("14:45", "15:00")))},
	}
	for _, c := range valid {
		if msg := ValidateWorkingHours(c.hours); msg != "" {
			t.Errorf("%s: unexpected message %q", c.name, msg)
		}
	}

	invalid := []struct {
		name  string
		hours domain.WorkingHours
		want  string
	}{
		{"empty zone", hours("", day(1, "07:00", "15:00")), "Vremenska zona"},
		{"bad zone", hours("Mars/Olympus", day(1, "07:00", "15:00")), "„Mars/Olympus“"},
		{"local zone", hours("Local", day(1, "07:00", "15:00")), "Vremenska zona"},
		{"weekday 0", hours(tz, day(0, "07:00", "15:00")), "Dan u nedelji"},
		{"weekday 8", hours(tz, day(8, "07:00", "15:00")), "Dan u nedelji"},
		{"duplicate", hours(tz, day(2, "07:00", "15:00"), day(2, "08:00", "16:00")), "„utorak“ je naveden više puta"},
		{"bad start", hours(tz, day(1, "7:00", "15:00")), "Početak smene"},
		{"bad start hour", hours(tz, day(1, "24:00", "25:00")), "Početak smene"},
		{"bad end minutes", hours(tz, day(1, "07:00", "15:60")), "Kraj smene"},
		{"letters", hours(tz, day(1, "07:00", "ab:cd")), "Kraj smene"},
		{"start after end", hours(tz, day(1, "15:00", "07:00")), "pre njenog kraja"},
		{"start equals end", hours(tz, day(1, "07:00", "07:00")), "pre njenog kraja"},
		{"bad break start", hours(tz, day(1, "07:00", "15:00", br("1100", "11:30"))), "Početak pauze"},
		{"bad break end", hours(tz, day(1, "07:00", "15:00", br("11:00", "11:3"))), "Kraj pauze"},
		{"reversed break", hours(tz, day(1, "07:00", "15:00", br("12:00", "11:00"))), "Početak pauze"},
		{"break before shift", hours(tz, day(1, "07:00", "15:00", br("06:30", "07:30"))), "unutar smene"},
		{"break after shift", hours(tz, day(1, "07:00", "15:00", br("14:30", "15:30"))), "unutar smene"},
		{"overlapping breaks", hours(tz, day(1, "07:00", "15:00", br("10:00", "10:30"), br("10:15", "10:45"))), "se preklapaju"},
		{"second day invalid", hours(tz, day(1, "07:00", "15:00"), day(2, "09:00", "08:00")), "„utorak“"},
	}
	for _, c := range invalid {
		msg := ValidateWorkingHours(c.hours)
		if msg == "" || !strings.Contains(msg, c.want) {
			t.Errorf("%s: got %q, want it to contain %q", c.name, msg, c.want)
		}
	}
}
