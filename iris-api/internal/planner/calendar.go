package planner

import (
	"fmt"
	"sort"
	"time"
	// Embedded zone data so planning works on hosts without a zoneinfo database.
	_ "time/tzdata"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

const (
	layoutDate     = "2006-01-02"
	layoutDateTime = "2006-01-02T15:04"
)

var weekdayNames = [...]string{"", "ponedeljak", "utorak", "sreda", "četvrtak", "petak", "subota", "nedelja"}

// parseClock parses a strict "HH:MM" (00:00-23:59) into minutes after midnight.
func parseClock(s string) (int, bool) {
	if len(s) != 5 || s[2] != ':' {
		return 0, false
	}
	for _, i := range []int{0, 1, 3, 4} {
		if s[i] < '0' || s[i] > '9' {
			return 0, false
		}
	}
	h := int(s[0]-'0')*10 + int(s[1]-'0')
	m := int(s[3]-'0')*10 + int(s[4]-'0')
	if h > 23 || m > 59 {
		return 0, false
	}
	return h*60 + m, true
}

// ValidateWorkingHours checks a working-hours setting: a loadable IANA time
// zone, weekdays 1-7 at most once each, "HH:MM" times with start < end, and
// breaks inside their shift that do not overlap. It returns a user-facing
// Serbian message, or "" when valid.
func ValidateWorkingHours(hours domain.WorkingHours) string {
	if hours.TimeZone == "" || hours.TimeZone == "Local" {
		return "Vremenska zona nije ispravna."
	}
	if _, err := time.LoadLocation(hours.TimeZone); err != nil {
		return fmt.Sprintf("Vremenska zona „%s“ nije ispravna.", hours.TimeZone)
	}
	seen := map[int]bool{}
	for _, day := range hours.Days {
		if day.Weekday < 1 || day.Weekday > 7 {
			return "Dan u nedelji mora biti između 1 (ponedeljak) i 7 (nedelja)."
		}
		name := weekdayNames[day.Weekday]
		if seen[day.Weekday] {
			return fmt.Sprintf("Dan „%s“ je naveden više puta.", name)
		}
		seen[day.Weekday] = true
		start, ok := parseClock(day.Start)
		if !ok {
			return fmt.Sprintf("Početak smene za dan „%s“ („%s“) nije u formatu HH:MM.", name, day.Start)
		}
		end, ok := parseClock(day.End)
		if !ok {
			return fmt.Sprintf("Kraj smene za dan „%s“ („%s“) nije u formatu HH:MM.", name, day.End)
		}
		if start >= end {
			return fmt.Sprintf("Početak smene za dan „%s“ mora biti pre njenog kraja.", name)
		}
		type span struct{ s, e int }
		breaks := make([]span, 0, len(day.Breaks))
		for _, br := range day.Breaks {
			bs, ok := parseClock(br.Start)
			if !ok {
				return fmt.Sprintf("Početak pauze za dan „%s“ („%s“) nije u formatu HH:MM.", name, br.Start)
			}
			be, ok := parseClock(br.End)
			if !ok {
				return fmt.Sprintf("Kraj pauze za dan „%s“ („%s“) nije u formatu HH:MM.", name, br.End)
			}
			if bs >= be {
				return fmt.Sprintf("Početak pauze za dan „%s“ mora biti pre njenog kraja.", name)
			}
			if bs < start || be > end {
				return fmt.Sprintf("Pauza %s–%s za dan „%s“ mora biti unutar smene.", br.Start, br.End, name)
			}
			breaks = append(breaks, span{bs, be})
		}
		sort.Slice(breaks, func(i, j int) bool { return breaks[i].s < breaks[j].s })
		for i := 1; i < len(breaks); i++ {
			if breaks[i].s < breaks[i-1].e {
				return fmt.Sprintf("Pauze za dan „%s“ se preklapaju.", name)
			}
		}
	}
	return ""
}

// shiftDef is one weekday's shift in minutes after local midnight.
type shiftDef struct {
	start, end int
	breaks     [][2]int
}

// seg is a continuous stretch of working time in absolute minutes (unix
// seconds / 60). day indexes the planner's horizon day list.
type seg struct {
	s, e int64
	day  int
}

// shift is one concrete local date's shift in absolute minutes.
type shift struct {
	start, end int64
	breaks     [][2]int64
	segs       []seg
}

type calendar struct {
	loc  *time.Location
	defs map[int]shiftDef
	memo map[string]*shift
}

func newCalendar(hours domain.WorkingHours) (*calendar, error) {
	if ValidateWorkingHours(hours) != "" {
		return nil, ErrInvalidHours
	}
	loc, err := time.LoadLocation(hours.TimeZone)
	if err != nil {
		return nil, ErrInvalidHours
	}
	c := &calendar{loc: loc, defs: map[int]shiftDef{}, memo: map[string]*shift{}}
	for _, day := range hours.Days {
		start, _ := parseClock(day.Start)
		end, _ := parseClock(day.End)
		def := shiftDef{start: start, end: end}
		for _, br := range day.Breaks {
			bs, _ := parseClock(br.Start)
			be, _ := parseClock(br.End)
			def.breaks = append(def.breaks, [2]int{bs, be})
		}
		sort.Slice(def.breaks, func(i, j int) bool { return def.breaks[i][0] < def.breaks[j][0] })
		c.defs[day.Weekday] = def
	}
	return c, nil
}

// shiftOn returns the shift of a civil date (a UTC-midnight time.Time), or nil
// on a day off. Wall-clock times are built with time.Date in the zone so DST
// days come out right.
func (c *calendar) shiftOn(day time.Time) *shift {
	key := day.Format(layoutDate)
	if sh, ok := c.memo[key]; ok {
		return sh
	}
	iso := int(day.Weekday())
	if iso == 0 {
		iso = 7
	}
	var sh *shift
	if def, ok := c.defs[iso]; ok {
		y, m, d := day.Date()
		at := func(minutes int) int64 {
			return time.Date(y, m, d, minutes/60, minutes%60, 0, 0, c.loc).Unix() / 60
		}
		sh = &shift{start: at(def.start), end: at(def.end)}
		cur := sh.start
		for _, br := range def.breaks {
			bs, be := at(br[0]), at(br[1])
			sh.breaks = append(sh.breaks, [2]int64{bs, be})
			if bs > cur {
				sh.segs = append(sh.segs, seg{s: cur, e: bs})
			}
			cur = be
		}
		if sh.end > cur {
			sh.segs = append(sh.segs, seg{s: cur, e: sh.end})
		}
	}
	c.memo[key] = sh
	return sh
}

// minutesOn is the working time of a civil date, clipped at startMin.
func (c *calendar) minutesOn(day time.Time, startMin int64, clip bool) int64 {
	sh := c.shiftOn(day)
	if sh == nil {
		return 0
	}
	var total int64
	for _, sg := range sh.segs {
		if clip {
			if sg.e <= startMin {
				continue
			}
			if sg.s < startMin {
				sg.s = startMin
			}
		}
		total += sg.e - sg.s
	}
	return total
}

// horizon lists the first n working days from date (dates "YYYY-MM-DD") and
// their working segments, with nothing before startMin when clip is set. A
// working day whose shift is already over still counts as a horizon day.
func (c *calendar) horizon(date time.Time, n int, startMin int64, clip bool) ([]string, []seg) {
	var dates []string
	var segs []seg
	for i := 0; len(dates) < n && i < n*7+14; i++ {
		d := date.AddDate(0, 0, i)
		sh := c.shiftOn(d)
		if sh == nil {
			continue
		}
		idx := len(dates)
		dates = append(dates, d.Format(layoutDate))
		for _, sg := range sh.segs {
			if clip {
				if sg.e <= startMin {
					continue
				}
				if sg.s < startMin {
					sg.s = startMin
				}
			}
			sg.day = idx
			segs = append(segs, sg)
		}
	}
	return dates, segs
}

func (c *calendar) format(minutes int64) string {
	return time.Unix(minutes*60, 0).In(c.loc).Format(layoutDateTime)
}

func (c *calendar) formatDate(minutes int64) string {
	return time.Unix(minutes*60, 0).In(c.loc).Format(layoutDate)
}

// parse reads a local "YYYY-MM-DDTHH:MM" into absolute minutes.
func (c *calendar) parse(s string) (int64, bool) {
	t, err := time.ParseInLocation(layoutDateTime, s, c.loc)
	if err != nil {
		return 0, false
	}
	return t.Unix() / 60, true
}

// snap moves t to the nearest working time at or after it. For zero-length
// blocks (inclusive) the end of a segment is acceptable too. It returns the
// adjusted time and the index of its segment.
func snap(segs []seg, t int64, inclusive bool) (int64, int, bool) {
	i := sort.Search(len(segs), func(i int) bool {
		if inclusive {
			return segs[i].e >= t
		}
		return segs[i].e > t
	})
	if i == len(segs) {
		return 0, 0, false
	}
	if t < segs[i].s {
		t = segs[i].s
	}
	return t, i, true
}

// part is one day's share of a block: the whole span from start to end
// (breaks included) holding minutes of work.
type part struct {
	day        int
	start, end int64
	minutes    int
}

// chain lays duration minutes of work from t (inside segs[i]) over the
// following working time, one part per day. ok is false when the horizon ends
// first.
func chain(segs []seg, i int, t int64, duration int) ([]part, bool) {
	if duration <= 0 {
		return []part{{day: segs[i].day, start: t, end: t}}, true
	}
	remaining := int64(duration)
	var parts []part
	for ; i < len(segs); i++ {
		sg := segs[i]
		start := sg.s
		if len(parts) == 0 {
			start = t
		}
		use := sg.e - start
		if use > remaining {
			use = remaining
		}
		if n := len(parts); n > 0 && parts[n-1].day == sg.day {
			parts[n-1].end = start + use
			parts[n-1].minutes += int(use)
		} else {
			parts = append(parts, part{day: sg.day, start: start, end: start + use, minutes: int(use)})
		}
		remaining -= use
		if remaining == 0 {
			return parts, true
		}
	}
	return nil, false
}
