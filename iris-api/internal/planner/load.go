package planner

import (
	"sort"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Workstation load ("Zauzetost", D-028): planned against available minutes
// per machine type, machine unit and person for each day of a range. Pure and
// deterministic like the planner: the store picks the blocks (LoadBlocks) and
// the presence, Load only counts.

// LoadInput is everything a load report needs.
type LoadInput struct {
	Hours domain.WorkingHours
	// From and To are local dates "YYYY-MM-DD", From <= To.
	From, To     string
	MachineTypes []domain.MachineType
	Machines     []domain.Machine
	Downtimes    []domain.MachineDowntime
	// Workers carry only UserID, Username and Presence here (a date missing
	// from Presence counts as present, as in the planner).
	Workers []Worker
	// Blocks are the plan blocks of the range (LoadBlocks); blocks starting
	// outside From..To are ignored.
	Blocks []domain.PlanAssignment
	Source domain.LoadSource
}

// LoadBlocks picks, for every date of from..to, the blocks of the plan that
// speaks for that date: the plan dated that day when there is one, otherwise
// the most recent earlier plan whose kept horizon (Date..HorizonEnd) covers
// it, i.e. what that plan projected onto the date. Only blocks starting on
// the date are taken from the chosen plan. plans may come in any order; at
// most one plan per date is expected (the caller passes the published plans,
// with today's draft in place of today's published plan when asked).
func LoadBlocks(plans []domain.ProductionPlan, from, to string) []domain.PlanAssignment {
	sorted := append([]domain.ProductionPlan(nil), plans...)
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].Date != sorted[j].Date {
			return sorted[i].Date < sorted[j].Date
		}
		return sorted[i].ID < sorted[j].ID
	})
	start, err := parseCivil(from)
	if err != nil {
		return []domain.PlanAssignment{}
	}
	end, err := parseCivil(to)
	if err != nil {
		return []domain.PlanAssignment{}
	}
	out := make([]domain.PlanAssignment, 0)
	for day := start; !day.After(end); day = day.AddDate(0, 0, 1) {
		date := day.Format(layoutDate)
		var source *domain.ProductionPlan
		for i := range sorted {
			plan := &sorted[i]
			if plan.Date > date {
				break
			}
			horizonEnd := plan.HorizonEnd
			if horizonEnd == "" {
				horizonEnd = plan.Date
			}
			if plan.Date == date || horizonEnd >= date {
				// Later plans win: the loop keeps the most recent one.
				source = plan
			}
		}
		if source == nil {
			continue
		}
		for _, block := range source.Assignments {
			if loadBlockDate(block) == date {
				out = append(out, block)
			}
		}
	}
	sortLoadBlocks(out)
	return out
}

func loadBlockDate(block domain.PlanAssignment) string {
	if len(block.Start) < len(layoutDate) {
		return block.Start
	}
	return block.Start[:len(layoutDate)]
}

func sortLoadBlocks(blocks []domain.PlanAssignment) {
	sort.SliceStable(blocks, func(i, j int) bool {
		if blocks[i].Start != blocks[j].Start {
			return blocks[i].Start < blocks[j].Start
		}
		return blocks[i].ID < blocks[j].ID
	})
}

// loadRow accumulates one unit's or person's days.
type loadRow struct {
	planned map[string]int
	blocks  map[string][]domain.WorkstationLoadBlock
}

func newLoadRow() *loadRow {
	return &loadRow{planned: map[string]int{}, blocks: map[string][]domain.WorkstationLoadBlock{}}
}

func (r *loadRow) add(date string, block domain.PlanAssignment) {
	r.planned[date] += block.Minutes
	r.blocks[date] = append(r.blocks[date], domain.WorkstationLoadBlock{
		WorkOrderID: block.WorkOrderID, OrderNumber: block.OrderNumber, StepNodeID: block.StepNodeID,
		StepLabel: block.StepLabel, MachineName: block.MachineName, Start: block.Start, End: block.End,
		Minutes: block.Minutes, LeadUserID: block.LeadUserID,
	})
}

func (r *loadRow) days(dates []string, available func(date string) int) []domain.WorkstationLoadDay {
	out := make([]domain.WorkstationLoadDay, 0, len(dates))
	for _, date := range dates {
		blocks := r.blocks[date]
		if blocks == nil {
			blocks = []domain.WorkstationLoadBlock{}
		}
		out = append(out, domain.WorkstationLoadDay{
			Date: date, PlannedMinutes: r.planned[date], AvailableMinutes: available(date), Blocks: blocks,
		})
	}
	return out
}

// busyMinutes is how much of [s, e) the windows (sorted by start) cover,
// overlapping windows counted once.
func busyMinutes(windows []downtimeWindow, s, e int64) int64 {
	var total int64
	cursor := s
	for _, w := range windows {
		ws, we := max(w.s, cursor), min(w.e, e)
		if ws >= e {
			break
		}
		if we > ws {
			total += we - ws
			cursor = we
		}
	}
	return total
}

func lessFold(a, b string) bool {
	la, lb := strings.ToLower(a), strings.ToLower(b)
	if la != lb {
		return la < lb
	}
	return a < b
}

// Load counts planned against available minutes for every day of the range.
// Days are the working days of From..To plus any day off that still carries a
// block; every type, unit and person lists exactly those days. Types are
// sorted by name with the pseudo type "Bez mašine" (id "") last, units and
// people by name. Machine types without units are listed too (all zero).
// It returns ErrInvalidHours for an unusable calendar.
func Load(in LoadInput) (domain.WorkstationLoad, error) {
	out := domain.WorkstationLoad{
		From: in.From, To: in.To, Source: in.Source, Days: []string{},
		MachineTypes: []domain.WorkstationLoadType{}, People: []domain.WorkstationLoadPerson{},
	}
	if out.Source == "" {
		out.Source = domain.LoadSourcePublished
	}
	cal, err := newCalendar(in.Hours)
	if err != nil {
		return out, err
	}
	start, err := parseCivil(in.From)
	if err != nil {
		return out, err
	}
	end, err := parseCivil(in.To)
	if err != nil {
		return out, err
	}

	// Blocks of the range by start date.
	byDate := map[string][]domain.PlanAssignment{}
	for _, block := range in.Blocks {
		date := loadBlockDate(block)
		if date < in.From || date > in.To {
			continue
		}
		byDate[date] = append(byDate[date], block)
	}

	// Days and each day's working segments.
	segsByDate := map[string][]seg{}
	for day := start; !day.After(end); day = day.AddDate(0, 0, 1) {
		date := day.Format(layoutDate)
		sh := cal.shiftOn(day)
		if sh == nil && len(byDate[date]) == 0 {
			continue
		}
		out.Days = append(out.Days, date)
		if sh != nil {
			segsByDate[date] = sh.segs
		}
	}
	shiftMinutes := func(date string) int {
		var total int64
		for _, sg := range segsByDate[date] {
			total += sg.e - sg.s
		}
		return int(total)
	}
	windows := cal.downtimeWindows(in.Downtimes)
	unitAvailable := func(machineID string, inService bool) func(string) int {
		return func(date string) int {
			if !inService {
				return 0
			}
			var total int64
			for _, sg := range segsByDate[date] {
				total += sg.e - sg.s - busyMinutes(windows[machineID], sg.s, sg.e)
			}
			return int(total)
		}
	}

	// Units grouped by type; blocks without a known unit go to the pseudo type.
	knownTypes := map[string]bool{}
	for _, machineType := range in.MachineTypes {
		knownTypes[machineType.ID] = true
	}
	type unitAcc struct {
		unit domain.Machine
		row  *loadRow
	}
	units := map[string]*unitAcc{}
	unitOrder := []string{}
	addUnit := func(machine domain.Machine) *unitAcc {
		acc := &unitAcc{unit: machine, row: newLoadRow()}
		units[machine.ID] = acc
		unitOrder = append(unitOrder, machine.ID)
		return acc
	}
	for _, machine := range in.Machines {
		if !knownTypes[machine.MachineTypeID] {
			machine.MachineTypeID = ""
		}
		addUnit(machine)
	}
	people := map[string]*loadRow{}
	for _, worker := range in.Workers {
		people[worker.UserID] = newLoadRow()
	}
	for _, date := range out.Days {
		blocks := byDate[date]
		sortLoadBlocks(blocks)
		for _, block := range blocks {
			machineID := ""
			if block.MachineID != nil {
				machineID = *block.MachineID
			}
			acc := units[machineID]
			if acc == nil {
				name := block.MachineName
				if machineID == "" {
					name = domain.LoadNoMachineTypeName
				}
				// A step without a machine, or a machine that no longer exists.
				acc = addUnit(domain.Machine{ID: machineID, Name: name, InService: machineID == ""})
			}
			acc.row.add(date, block)
			counted := map[string]bool{}
			for _, userID := range append([]string{block.LeadUserID}, block.UserIDs...) {
				if row := people[userID]; row != nil && !counted[userID] {
					counted[userID] = true
					row.add(date, block)
				}
			}
		}
	}

	// Types (pseudo type last), each with its units and day totals.
	types := append([]domain.MachineType(nil), in.MachineTypes...)
	sort.SliceStable(types, func(i, j int) bool {
		if types[i].Name != types[j].Name {
			return lessFold(types[i].Name, types[j].Name)
		}
		return types[i].ID < types[j].ID
	})
	pseudo := false
	for _, id := range unitOrder {
		if units[id].unit.MachineTypeID == "" {
			pseudo = true
		}
	}
	if pseudo {
		types = append(types, domain.MachineType{ID: "", Name: domain.LoadNoMachineTypeName})
	}
	for _, machineType := range types {
		entry := domain.WorkstationLoadType{
			ID: machineType.ID, Name: machineType.Name, Units: []domain.WorkstationLoadUnit{},
			Days: make([]domain.WorkstationLoadTotal, 0, len(out.Days)),
		}
		members := make([]*unitAcc, 0)
		for _, id := range unitOrder {
			if acc := units[id]; acc.unit.MachineTypeID == machineType.ID {
				members = append(members, acc)
			}
		}
		sort.SliceStable(members, func(i, j int) bool {
			a, b := members[i].unit, members[j].unit
			if a.Name != b.Name {
				return lessFold(a.Name, b.Name)
			}
			return a.ID < b.ID
		})
		totals := map[string]*domain.WorkstationLoadTotal{}
		for _, date := range out.Days {
			entry.Days = append(entry.Days, domain.WorkstationLoadTotal{Date: date})
			totals[date] = &entry.Days[len(entry.Days)-1]
		}
		for _, acc := range members {
			available := unitAvailable(acc.unit.ID, acc.unit.InService)
			if acc.unit.ID == "" {
				// The pseudo unit is no machine: its work is bounded by people.
				available = func(string) int { return 0 }
			}
			unit := domain.WorkstationLoadUnit{
				ID: acc.unit.ID, Name: acc.unit.Name, InService: acc.unit.InService,
				Days: acc.row.days(out.Days, available),
			}
			for _, day := range unit.Days {
				totals[day.Date].PlannedMinutes += day.PlannedMinutes
				totals[day.Date].AvailableMinutes += day.AvailableMinutes
			}
			entry.Units = append(entry.Units, unit)
		}
		out.MachineTypes = append(out.MachineTypes, entry)
	}

	// People.
	workers := append([]Worker(nil), in.Workers...)
	sort.SliceStable(workers, func(i, j int) bool {
		if workers[i].Username != workers[j].Username {
			return lessFold(workers[i].Username, workers[j].Username)
		}
		return workers[i].UserID < workers[j].UserID
	})
	for _, worker := range workers {
		presence := worker.Presence
		available := func(date string) int {
			if present, known := presence[date]; known && !present {
				return 0
			}
			return shiftMinutes(date)
		}
		out.People = append(out.People, domain.WorkstationLoadPerson{
			UserID: worker.UserID, Username: worker.Username, Days: people[worker.UserID].days(out.Days, available),
		})
	}
	return out, nil
}
