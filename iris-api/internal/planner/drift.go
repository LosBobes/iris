package planner

import (
	"fmt"
	"sort"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// parseCivil reads "YYYY-MM-DD" as a UTC-midnight civil date.
func parseCivil(date string) (time.Time, error) {
	return time.Parse(layoutDate, date)
}

const driftGrace = 15 * time.Minute

func drift(plan domain.ProductionPlan, orders []Order, now time.Time) domain.PlanDrift {
	type key struct{ order, step string }
	statuses := map[key]domain.ProcessStepStatus{}
	labels := map[key]string{}
	numbers := map[string]string{}
	var progress []key
	sorted := append([]Order(nil), orders...)
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].Number != sorted[j].Number {
			return sorted[i].Number < sorted[j].Number
		}
		return sorted[i].ID < sorted[j].ID
	})
	for _, o := range sorted {
		numbers[o.ID] = o.Number
		gi := indexGraph(o.Graph)
		for _, id := range gi.stepIDs {
			node := gi.nodes[id]
			k := key{o.ID, id}
			status := node.Status
			if status == "" {
				status = domain.ProcessStepPending
			}
			statuses[k], labels[k] = status, node.Label
			if status == domain.ProcessStepInProgress {
				progress = append(progress, k)
			}
		}
	}

	blocks := append([]domain.PlanAssignment(nil), plan.Assignments...)
	sort.SliceStable(blocks, func(i, j int) bool {
		if blocks[i].Start != blocks[j].Start {
			return blocks[i].Start < blocks[j].Start
		}
		return blocks[i].ID < blocks[j].ID
	})

	reasons := []string{}
	seen := map[string]bool{}
	add := func(text string) {
		if !seen[text] {
			seen[text] = true
			reasons = append(reasons, text)
		}
	}
	loc := now.Location()
	covered := map[key]bool{}
	for _, a := range blocks {
		k := key{a.WorkOrderID, a.StepNodeID}
		start, err1 := time.ParseInLocation(layoutDateTime, a.Start, loc)
		end, err2 := time.ParseInLocation(layoutDateTime, a.End, loc)
		if err1 != nil || err2 != nil {
			continue
		}
		if !now.Before(start) && now.Before(end) {
			covered[k] = true
		}
		status, known := statuses[k]
		if !known {
			continue
		}
		label := labels[k]
		number := numbers[a.WorkOrderID]
		switch {
		case status == domain.ProcessStepPending && now.Sub(start) > driftGrace:
			add(fmt.Sprintf("Nalog %s, korak „%s“: trebalo je da počne u %s, a još nije započet.", number, label, start.Format("15:04")))
		case status != domain.ProcessStepDone && status != domain.ProcessStepSkipped && end.Before(now):
			add(fmt.Sprintf("Nalog %s, korak „%s“: trebalo je da se završi u %s, a nije završen.", number, label, end.Format("15:04")))
		}
	}
	for _, k := range progress {
		if !covered[k] {
			add(fmt.Sprintf("Nalog %s, korak „%s“: u toku je, a nije planiran za ovaj trenutak.", numbers[k.order], labels[k]))
		}
	}
	return domain.PlanDrift{Suggested: len(reasons) > 0, Reasons: reasons}
}
