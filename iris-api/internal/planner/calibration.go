package planner

import (
	"math"
	"sort"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Calibration report (D-028, "Actual step times"). The source model calibrates
// its one inter-operation constant from reality: MO = actual cycle time − sum
// of operation times, averaged over closed orders, and corrects time norms
// from measured operation times. Like the planner it is pure: no clock reads.

// CalibrationOrder is one finished work order's process as Calibrate needs it.
type CalibrationOrder struct {
	// Quantity multiplies MinutesPerUnit for the planned step minutes; below 1
	// counts as 1.
	Quantity int
	Graph    domain.ProcessGraph
}

// Calibration is the computed part of domain.PlanningCalibration.
type Calibration struct {
	// OrdersWithTimes counts the orders where every done step has both a
	// startedAt and a finishedAt (finishedAt not before startedAt).
	OrdersWithTimes int
	// TransferSamples is the number of orders that yielded an inter-operation
	// time (OrdersWithTimes minus those with fewer than two chained done steps).
	TransferSamples int
	// AvgTransferMinutes and MedianTransferMinutes are the mean and median
	// measured inter-operation time, rounded to 5 minutes and clamped to
	// 0–domain.MaxTransferMinutes; nil without samples.
	AvgTransferMinutes    *int
	MedianTransferMinutes *int
	// Steps compares planned and measured minutes per step label, sorted by
	// |ratio − 1| (largest first), then count (largest first), then label.
	Steps []domain.PlanningCalibrationStep
}

// ProcessCompletion is when a process finished: every step is done or
// skipped, at least one is done, and the moment is the latest finishedAt of
// its steps (UTC). ok is false for an unfinished process or one without any
// finishedAt (finished before step times were recorded).
func ProcessCompletion(graph domain.ProcessGraph) (time.Time, bool) {
	var latest time.Time
	done, stamped := false, false
	for _, node := range graph.Nodes {
		if node.Kind != domain.ProcessNodeStep {
			continue
		}
		switch node.Status {
		case domain.ProcessStepDone:
			done = true
		case domain.ProcessStepSkipped:
		default:
			return time.Time{}, false
		}
		if node.FinishedAt == "" {
			continue
		}
		at, err := time.Parse(time.RFC3339, node.FinishedAt)
		if err != nil {
			continue
		}
		if !stamped || at.After(latest) {
			latest, stamped = at.UTC(), true
		}
	}
	if !done || !stamped {
		return time.Time{}, false
	}
	return latest, true
}

// Calibrate measures the orders over the working-hours calendar (breaks,
// nights and days off excluded). Per order with times: cycle = working minutes
// from the earliest step startedAt to the latest finishedAt; along the longest
// chain of done steps (most done steps; at equal count the most measured
// minutes) tech = the chain's measured step minutes and gaps = its done steps
// − 1; the order's inter-operation time is (cycle − tech) / gaps, skipped when
// gaps is 0. Steps: every done step with both timestamps and planned times,
// grouped by trimmed label; planned = domain.StepDurationMinutes with the
// node's current times and the order quantity, actual = measured working
// minutes. It returns ErrInvalidHours for invalid working hours.
func Calibrate(hours domain.WorkingHours, orders []CalibrationOrder) (Calibration, error) {
	cal, err := newCalendar(hours)
	if err != nil {
		return Calibration{}, err
	}
	type labelSum struct {
		count            int
		planned, actuals float64
	}
	byLabel := map[string]*labelSum{}
	var samples []float64
	out := Calibration{Steps: []domain.PlanningCalibrationStep{}}
	for _, order := range orders {
		gi := indexGraph(order.Graph)
		actual := map[string]int64{}
		allTimes, anyDone := true, false
		var first, last int64
		for _, id := range gi.stepIDs {
			node := gi.nodes[id]
			if node.Status != domain.ProcessStepDone {
				continue
			}
			anyDone = true
			start, ok1 := timestampMinute(node.StartedAt)
			end, ok2 := timestampMinute(node.FinishedAt)
			if !ok1 || !ok2 || end < start {
				allTimes = false
				continue
			}
			minutes := cal.workingBetween(start, end)
			actual[id] = minutes
			if len(actual) == 1 || start < first {
				first = start
			}
			if len(actual) == 1 || end > last {
				last = end
			}
			if label := strings.TrimSpace(node.Label); label != "" {
				if planned, ok := domain.StepDurationMinutes(node, order.Quantity); ok {
					sum := byLabel[label]
					if sum == nil {
						sum = &labelSum{}
						byLabel[label] = sum
					}
					sum.count++
					sum.planned += float64(planned)
					sum.actuals += float64(minutes)
				}
			}
		}
		if !anyDone || !allTimes {
			continue
		}
		out.OrdersWithTimes++
		count, tech := longestDoneChain(gi, actual)
		if count < 2 {
			continue
		}
		cycle := cal.workingBetween(first, last)
		samples = append(samples, float64(cycle-tech)/float64(count-1))
	}
	out.TransferSamples = len(samples)
	if len(samples) > 0 {
		var total float64
		for _, v := range samples {
			total += v
		}
		avg := transferRecommendation(total / float64(len(samples)))
		sort.Float64s(samples)
		mid := len(samples) / 2
		median := samples[mid]
		if len(samples)%2 == 0 {
			median = (samples[mid-1] + samples[mid]) / 2
		}
		med := transferRecommendation(median)
		out.AvgTransferMinutes, out.MedianTransferMinutes = &avg, &med
	}
	for label, sum := range byLabel {
		planned := sum.planned / float64(sum.count)
		if planned <= 0 {
			continue
		}
		actualAvg := sum.actuals / float64(sum.count)
		out.Steps = append(out.Steps, domain.PlanningCalibrationStep{
			Label: label, Count: sum.count,
			PlannedMinutesAvg: roundTo(planned, 1), ActualMinutesAvg: roundTo(actualAvg, 1),
			Ratio: roundTo(actualAvg/planned, 2),
		})
	}
	sort.Slice(out.Steps, func(i, j int) bool {
		a, b := out.Steps[i], out.Steps[j]
		da, db := math.Abs(a.Ratio-1), math.Abs(b.Ratio-1)
		if da != db {
			return da > db
		}
		if a.Count != b.Count {
			return a.Count > b.Count
		}
		return a.Label < b.Label
	})
	return out, nil
}

// longestDoneChain walks the step graph (through item nodes) and returns the
// chain with the most done steps (those in actual) and, at equal count, the
// most measured minutes: its done-step count and their minutes.
func longestDoneChain(gi *graphIndex, actual map[string]int64) (int, int64) {
	type best struct {
		count   int
		minutes int64
	}
	better := func(a, b best) bool {
		if a.count != b.count {
			return a.count > b.count
		}
		return a.minutes > b.minutes
	}
	memo := map[string]best{}
	visiting := map[string]bool{}
	var walk func(id string) best
	walk = func(id string) best {
		if v, ok := memo[id]; ok {
			return v
		}
		if visiting[id] {
			return best{}
		}
		visiting[id] = true
		var tail best
		for _, next := range gi.successors(id) {
			if v := walk(next); better(v, tail) {
				tail = v
			}
		}
		visiting[id] = false
		own := tail
		if minutes, ok := actual[id]; ok {
			own = best{count: tail.count + 1, minutes: tail.minutes + minutes}
		}
		memo[id] = own
		return own
	}
	var top best
	for _, id := range gi.stepIDs {
		if v := walk(id); better(v, top) {
			top = v
		}
	}
	return top.count, top.minutes
}

// transferRecommendation rounds a measured inter-operation time to 5 minutes
// and clamps it to 0–domain.MaxTransferMinutes.
func transferRecommendation(minutes float64) int {
	v := int(math.Round(minutes/5)) * 5
	if v < 0 {
		return 0
	}
	if v > domain.MaxTransferMinutes {
		return domain.MaxTransferMinutes
	}
	return v
}

func roundTo(v float64, decimals int) float64 {
	scale := math.Pow(10, float64(decimals))
	return math.Round(v*scale) / scale
}
