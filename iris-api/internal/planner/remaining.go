package planner

import (
	"fmt"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Remaining minutes of in-progress steps (D-028, "Actual step times"): a step
// an operator started at StartedAt has already used part of its duration, so a
// re-plan places it only for what is left.

// workingSpanDays bounds how many civil days workingBetween walks (a step
// started longer ago counts only the working time of this window).
const workingSpanDays = 400

// workingBetween is the working time in [from, to) (absolute minutes): shift
// segments only, so breaks, nights and days off are excluded. Zero when
// to <= from.
func (c *calendar) workingBetween(from, to int64) int64 {
	if to <= from {
		return 0
	}
	first, err1 := parseCivil(c.formatDate(from))
	last, err2 := parseCivil(c.formatDate(to))
	if err1 != nil || err2 != nil {
		return 0
	}
	if days := int(last.Sub(first).Hours() / 24); days > workingSpanDays {
		first = last.AddDate(0, 0, -workingSpanDays)
	}
	var total int64
	for day := first; !day.After(last); day = day.AddDate(0, 0, 1) {
		sh := c.shiftOn(day)
		if sh == nil {
			continue
		}
		for _, sg := range sh.segs {
			s, e := sg.s, sg.e
			if s < from {
				s = from
			}
			if e > to {
				e = to
			}
			if e > s {
				total += e - s
			}
		}
	}
	return total
}

// timestampMinute reads a step timestamp (RFC 3339) as absolute minutes,
// rounded down to the minute. ok is false when it is empty or malformed.
func timestampMinute(value string) (int64, bool) {
	if value == "" {
		return 0, false
	}
	t, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return 0, false
	}
	unix := t.Unix()
	minute := unix / 60
	if unix < 0 && unix%60 != 0 {
		minute--
	}
	return minute, true
}

// remainingMinutes is what is left of a step of duration minutes after
// worked minutes of work: max(duration - worked, 0).
func remainingMinutes(duration int, worked int64) int {
	if worked >= int64(duration) {
		return 0
	}
	if worked <= 0 {
		return duration
	}
	return duration - int(worked)
}

// referenceMinute is "now" for the remaining-minutes rule: Input.Start, or
// the first working minute of the horizon when no Start was given.
func (p *planner) referenceMinute() (int64, bool) {
	if p.hasStart {
		return p.startMin, true
	}
	if len(p.segs) > 0 {
		return p.segs[0].s, true
	}
	return 0, false
}

// applyRemaining shortens an in-progress step with a StartedAt and a duration
// to its remaining minutes: the full duration minus the working time between
// StartedAt and the planning start (capped at the duration). The block keeps
// at least 1 minute so it stays visible; a step with nothing left is treated
// as finishing where that block starts. It also records the worked minutes
// for the overrun check.
func (p *planner) applyRemaining(s *stepRun) {
	if !s.inProgress || !s.durOK || s.dur <= 0 {
		return
	}
	started, ok := timestampMinute(s.node.StartedAt)
	if !ok {
		return
	}
	ref, ok := p.referenceMinute()
	if !ok {
		return
	}
	s.fullDur = s.dur
	s.worked = p.cal.workingBetween(started, ref)
	left := remainingMinutes(s.dur, s.worked)
	if left == 0 {
		s.finishAtStart = true
		left = 1
	}
	s.dur = left
}

// flagOverruns reports every in-progress step that has been worked on longer
// than its planned duration (PlanIssueOverrun). The issue is informational:
// the order stays plannable.
func (p *planner) flagOverruns() {
	for _, o := range p.orders {
		for _, s := range o.steps {
			if !s.inProgress || s.fullDur <= 0 || s.worked <= int64(s.fullDur) {
				continue
			}
			p.issues = append(p.issues, domain.PlanIssue{
				Code: domain.PlanIssueOverrun, WorkOrderID: o.order.ID, OrderNumber: o.order.Number,
				StepNodeID: s.id, StepLabel: s.node.Label,
				Message: p.message(o, s, fmt.Sprintf(
					"u toku je već %d min rada, a planirano trajanje je %d min.", s.worked, s.fullDur)),
			})
		}
	}
}
