package planner

import (
	"fmt"
	"sort"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

type draftItem struct {
	a      domain.PlanAssignment
	s, e   int64
	timeOK bool
}

func checkDraft(in Input, assignments []domain.PlanAssignment) []domain.PlanIssue {
	issues := []domain.PlanIssue{}
	cal, err := newCalendar(in.Hours)
	if err != nil {
		return append(issues, domain.PlanIssue{
			Code: domain.PlanIssueConflict, Message: "Radno vreme nije ispravno podešeno.",
		})
	}

	machines := map[string]domain.Machine{}
	for _, m := range in.Machines {
		machines[m.ID] = m
	}
	downtimes := cal.downtimeWindows(in.Downtimes)
	typeNames := map[string]string{}
	for _, t := range in.MachineTypes {
		typeNames[t.ID] = t.Name
	}
	typeName := func(id string) string {
		if name, ok := typeNames[id]; ok {
			return name
		}
		return id
	}
	workers := map[string]Worker{}
	for _, w := range in.Workers {
		workers[w.UserID] = w
	}
	orders := map[string]Order{}
	graphs := map[string]*graphIndex{}
	for _, o := range in.Orders {
		orders[o.ID] = o
		graphs[o.ID] = indexGraph(o.Graph)
	}

	items := make([]draftItem, 0, len(assignments))
	for _, a := range assignments {
		it := draftItem{a: a}
		s, ok1 := cal.parse(a.Start)
		e, ok2 := cal.parse(a.End)
		it.s, it.e, it.timeOK = s, e, ok1 && ok2 && e >= s
		items = append(items, it)
	}
	sort.SliceStable(items, func(i, j int) bool {
		a, b := items[i].a, items[j].a
		switch {
		case a.Start != b.Start:
			return a.Start < b.Start
		case a.End != b.End:
			return a.End < b.End
		case a.ID != b.ID:
			return a.ID < b.ID
		}
		return a.StepNodeID < b.StepNodeID
	})

	add := func(a domain.PlanAssignment, text string) {
		issues = append(issues, domain.PlanIssue{
			Code: domain.PlanIssueConflict, WorkOrderID: a.WorkOrderID, OrderNumber: a.OrderNumber,
			StepNodeID: a.StepNodeID, StepLabel: a.StepLabel,
			Message: fmt.Sprintf("Nalog %s, korak „%s“: %s", a.OrderNumber, a.StepLabel, text),
		})
	}
	userName := func(id string) string {
		if w, ok := workers[id]; ok && w.Username != "" {
			return w.Username
		}
		return id
	}
	machineName := func(a domain.PlanAssignment) string {
		if a.MachineID != nil {
			if m, ok := machines[*a.MachineID]; ok {
				return m.Name
			}
		}
		return a.MachineName
	}

	// Latest end of every step's blocks, for the upstream check.
	stepEnd := map[string]int64{}
	for _, it := range items {
		if !it.timeOK {
			continue
		}
		key := it.a.WorkOrderID + "\x00" + it.a.StepNodeID
		if end, ok := stepEnd[key]; !ok || it.e > end {
			stepEnd[key] = it.e
		}
	}
	// A successor may start only once the inter-operation time (D-028) has
	// elapsed after the upstream end; a lag that never elapses blocks forever.
	lag := in.Hours.TransferMinutes
	lagEnds := map[int64]int64{}
	afterLag := func(end int64) int64 {
		if lag <= 0 {
			return end
		}
		if at, ok := lagEnds[end]; ok {
			return at
		}
		at, ok := cal.addWorking(end, lag)
		if !ok {
			at = farAvail
		}
		lagEnds[end] = at
		return at
	}

	for _, it := range items {
		a := it.a
		if !it.timeOK {
			add(a, "vreme početka ili kraja bloka nije ispravno.")
		} else {
			checkHours(cal, it, add)
		}

		var step domain.ProcessNode
		stepKnown := false
		if o, ok := orders[a.WorkOrderID]; !ok {
			add(a, "nalog nema otvoren proces u planu.")
		} else if node, ok := graphs[o.ID].nodes[a.StepNodeID]; !ok || node.Kind != domain.ProcessNodeStep {
			add(a, "korak ne postoji u procesu naloga.")
		} else {
			step, stepKnown = node, true
		}

		requiredType := ""
		if stepKnown {
			requiredType = step.MachineTypeID
		}
		switch {
		case a.MachineID == nil:
			if requiredType != "" {
				add(a, fmt.Sprintf("korak zahteva mašinu tipa „%s“.", typeName(requiredType)))
			}
		default:
			m, ok := machines[*a.MachineID]
			switch {
			case !ok:
				add(a, "mašina ne postoji.")
			default:
				if !m.InService {
					add(a, fmt.Sprintf("mašina „%s“ je van upotrebe.", m.Name))
				}
				if it.timeOK {
					if w, hit := overlapping(downtimes[m.ID], it.s, it.e); hit {
						add(a, fmt.Sprintf("mašina „%s“ je van pogona %s – %s.", m.Name, cal.formatHuman(w.s), cal.formatHuman(w.e)))
					}
				}
				if requiredType != "" && m.MachineTypeID != requiredType {
					add(a, fmt.Sprintf("mašina „%s“ nije tipa „%s“ koji korak zahteva.", m.Name, typeName(requiredType)))
				}
				requiredType = m.MachineTypeID
			}
		}

		crew := map[string]bool{}
		if a.LeadUserID != "" {
			crew[a.LeadUserID] = true
		}
		for _, id := range a.UserIDs {
			crew[id] = true
		}
		ids := make([]string, 0, len(crew))
		for id := range crew {
			ids = append(ids, id)
		}
		sort.Strings(ids)
		for _, id := range ids {
			if _, ok := workers[id]; !ok {
				add(a, fmt.Sprintf("radnik „%s“ ne postoji.", id))
			}
		}
		if stepKnown {
			if need := domain.StepCrewSize(step); len(ids) < need {
				add(a, fmt.Sprintf("potrebno je %d ljudi, a raspoređeno je %d.", need, len(ids)))
			}
		}
		if requiredType != "" {
			lead, ok := workers[a.LeadUserID]
			switch {
			case a.LeadUserID == "":
				add(a, "nije izabran vodeći radnik.")
			case !ok:
			default:
				qualified := false
				for _, id := range lead.MachineTypeIDs {
					if id == requiredType {
						qualified = true
					}
				}
				if !qualified {
					add(a, fmt.Sprintf("radnik „%s“ nije osposobljen za tip mašine „%s“.", userName(a.LeadUserID), typeName(requiredType)))
				}
			}
		}

		if stepKnown && it.timeOK {
			for _, ancestor := range graphs[a.WorkOrderID].ancestors(a.StepNodeID) {
				node := graphs[a.WorkOrderID].nodes[ancestor]
				if node.Status == domain.ProcessStepDone || node.Status == domain.ProcessStepSkipped {
					continue
				}
				end, ok := stepEnd[a.WorkOrderID+"\x00"+ancestor]
				switch {
				case !ok:
				case it.s < end:
					add(a, fmt.Sprintf("počinje pre nego što se završi prethodni korak „%s“.", node.Label))
				case it.s < afterLag(end):
					add(a, fmt.Sprintf("počinje pre isteka međuoperacijskog vremena (%d min) posle koraka „%s“.", lag, node.Label))
				}
			}
		}
	}

	// Double bookings: sweep each machine and person over its sorted blocks.
	byResource := map[string][]int{}
	for i, it := range items {
		if !it.timeOK || it.e == it.s {
			continue
		}
		if it.a.MachineID != nil {
			key := "m\x00" + *it.a.MachineID
			byResource[key] = append(byResource[key], i)
		}
		seen := map[string]bool{}
		for _, id := range append([]string{it.a.LeadUserID}, it.a.UserIDs...) {
			if id == "" || seen[id] {
				continue
			}
			seen[id] = true
			key := "u\x00" + id
			byResource[key] = append(byResource[key], i)
		}
	}
	keys := make([]string, 0, len(byResource))
	for key := range byResource {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		idx := byResource[key]
		sort.SliceStable(idx, func(x, y int) bool { return items[idx[x]].s < items[idx[y]].s })
		for x := 0; x < len(idx); x++ {
			for y := x + 1; y < len(idx) && items[idx[y]].s < items[idx[x]].e; y++ {
				a, b := items[idx[x]].a, items[idx[y]].a
				var subject string
				if key[0] == 'm' {
					subject = fmt.Sprintf("mašina „%s“ je istovremeno zauzeta", machineName(a))
				} else {
					subject = fmt.Sprintf("radnik „%s“ je istovremeno raspoređen", userName(key[2:]))
				}
				add(a, fmt.Sprintf("%s: nalog %s, korak „%s“.", subject, b.OrderNumber, b.StepLabel))
				add(b, fmt.Sprintf("%s: nalog %s, korak „%s“.", subject, a.OrderNumber, a.StepLabel))
			}
		}
	}

	sort.SliceStable(issues, func(i, j int) bool {
		a, b := issues[i], issues[j]
		switch {
		case a.OrderNumber != b.OrderNumber:
			return a.OrderNumber < b.OrderNumber
		case a.WorkOrderID != b.WorkOrderID:
			return a.WorkOrderID < b.WorkOrderID
		case a.StepNodeID != b.StepNodeID:
			return a.StepNodeID < b.StepNodeID
		}
		return a.Message < b.Message
	})
	out := issues[:0]
	for i, issue := range issues {
		if i > 0 && issue == issues[i-1] {
			continue
		}
		out = append(out, issue)
	}
	return out
}

// checkHours flags a block outside its day's shift or starting / ending in a
// break (a block that spans a break is fine).
func checkHours(cal *calendar, it draftItem, add func(domain.PlanAssignment, string)) {
	date := cal.formatDate(it.s)
	day, err := parseCivil(date)
	if err != nil {
		add(it.a, "datum bloka nije ispravan.")
		return
	}
	sh := cal.shiftOn(day)
	switch {
	case sh == nil:
		add(it.a, "blok je zakazan u neradnom danu.")
	case it.s < sh.start || it.e > sh.end:
		add(it.a, "blok je van radnog vremena.")
	default:
		for _, br := range sh.breaks {
			if (it.s > br[0] && it.s < br[1]) || (it.e > br[0] && it.e < br[1]) {
				add(it.a, "blok se preklapa sa pauzom.")
				break
			}
		}
	}
}
