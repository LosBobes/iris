package planner

import (
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Latest start (D-028): an informational backward pass from an order's due
// date over its remaining steps. It is not backward finite loading: machines,
// people and other orders are ignored; only working time (shifts, breaks,
// exception dates) and the inter-operation time Hours.TransferMinutes count.

// latestStartWindowDays bounds how far back the pass looks for working time,
// both for a due date that is a day off and for each subtraction.
const latestStartWindowDays = lagHorizonDays

// dueEnd is the end of the last working shift on or before the civil date
// due. ok is false when no working day lies within latestStartWindowDays.
func (c *calendar) dueEnd(due time.Time) (int64, bool) {
	for i := 0; i <= latestStartWindowDays; i++ {
		if sh := c.shiftOn(due.AddDate(0, 0, -i)); sh != nil && len(sh.segs) > 0 {
			return sh.end, true
		}
	}
	return 0, false
}

// subWorking returns the moment `minutes` of working time before t (absolute
// minutes): the mirror of addWorking. Work pauses for breaks, the time before
// a shift and days off, so the result may lie days before t. ok is false when
// the minutes do not fit within latestStartWindowDays before t.
func (c *calendar) subWorking(t int64, minutes int) (int64, bool) {
	if minutes <= 0 {
		return t, true
	}
	day, err := parseCivil(c.formatDate(t))
	if err != nil {
		return 0, false
	}
	remaining := int64(minutes)
	for i := 0; i <= latestStartWindowDays; i++ {
		sh := c.shiftOn(day.AddDate(0, 0, -i))
		if sh == nil {
			continue
		}
		for j := len(sh.segs) - 1; j >= 0; j-- {
			sg := sh.segs[j]
			end := sg.e
			if end > t {
				end = t
			}
			if end <= sg.s {
				continue
			}
			if avail := end - sg.s; remaining > avail {
				remaining -= avail
				continue
			}
			return end - remaining, true
		}
	}
	return 0, false
}

// stepOpen reports whether a step still has work left (pending or in
// progress). It reads the order's step status, not the run's state, so it is
// the same before and after placement.
func stepOpen(s *stepRun) bool {
	return s.node.Status != domain.ProcessStepDone && s.node.Status != domain.ProcessStepSkipped
}

// latestStart is the local date ("YYYY-MM-DD") by which the order's remaining
// work must start to finish by the end of its due date's shift (or of the last
// working shift before it, when the due date is a day off). Each open step's
// latest finish is the due end or, for a step with open successors, the
// earliest of their latest starts less the inter-operation time; its latest
// start is that finish less its duration, all in working time. The order's
// latest start is the earliest over its open steps: the longest chain.
// In-progress steps count with their full duration.
//
// nil when the order has no (valid) due date or no open step, an open step
// has no duration set, or the calendar has no working time in the window.
func (p *planner) latestStart(o *orderRun) *string {
	if o.order.DueDate == nil {
		return nil
	}
	due, err := parseCivil(*o.order.DueDate)
	if err != nil {
		return nil
	}
	var open []*stepRun
	for _, s := range o.steps {
		if !stepOpen(s) {
			continue
		}
		if !s.durOK {
			return nil
		}
		open = append(open, s)
	}
	if len(open) == 0 {
		return nil
	}
	end, ok := p.cal.dueEnd(due)
	if !ok {
		return nil
	}
	lag := p.in.Hours.TransferMinutes
	type mark struct {
		at int64
		ok bool
	}
	memo := make(map[*stepRun]mark, len(open))
	visiting := map[*stepRun]bool{}
	var latest func(s *stepRun) (int64, bool)
	latest = func(s *stepRun) (int64, bool) {
		if m, done := memo[s]; done {
			return m.at, m.ok
		}
		if visiting[s] {
			// A validated graph has no cycle; treat such an edge as absent.
			return end, true
		}
		visiting[s] = true
		finish, valid := end, true
		for _, n := range s.succ {
			if !stepOpen(n) {
				continue
			}
			succStart, ok := latest(n)
			if !ok {
				valid = false
				break
			}
			before, ok := p.cal.subWorking(succStart, lag)
			if !ok {
				valid = false
				break
			}
			if before < finish {
				finish = before
			}
		}
		var at int64
		if valid {
			at, valid = p.cal.subWorking(finish, s.dur)
		}
		visiting[s] = false
		memo[s] = mark{at: at, ok: valid}
		return at, valid
	}
	var earliest int64
	for i, s := range open {
		at, ok := latest(s)
		if !ok {
			return nil
		}
		if i == 0 || at < earliest {
			earliest = at
		}
	}
	date := p.cal.formatDate(earliest)
	return &date
}
