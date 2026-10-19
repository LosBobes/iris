package planner

import (
	"fmt"
	"sort"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// farAvail stands in for "after the horizon" when an order has no (near) due
// date.
const farAvail = int64(1) << 40

// resource is a machine unit or a person: sorted, non-overlapping busy
// intervals in absolute minutes plus the minutes planned on it so far.
type resource struct {
	id, name string
	busy     [][2]int64
	load     int
}

// overlaps reports whether [s, e) intersects a busy interval. A zero-length
// span only collides with an interval that strictly contains it.
func (r *resource) overlaps(s, e int64) bool {
	i := sort.Search(len(r.busy), func(i int) bool { return r.busy[i][1] > s })
	return i < len(r.busy) && r.busy[i][0] < e
}

// reserve marks [s, e) busy, merging touching or overlapping intervals.
func (r *resource) reserve(s, e int64) {
	if e <= s {
		return
	}
	i := sort.Search(len(r.busy), func(i int) bool { return r.busy[i][1] >= s })
	j := i
	for j < len(r.busy) && r.busy[j][0] <= e {
		if r.busy[j][0] < s {
			s = r.busy[j][0]
		}
		if r.busy[j][1] > e {
			e = r.busy[j][1]
		}
		j++
	}
	merged := make([][2]int64, 0, len(r.busy)-(j-i)+1)
	merged = append(merged, r.busy[:i]...)
	merged = append(merged, [2]int64{s, e})
	merged = append(merged, r.busy[j:]...)
	r.busy = merged
}

func lessResource(a, b *resource) bool {
	if a.load != b.load {
		return a.load < b.load
	}
	if a.name != b.name {
		return a.name < b.name
	}
	return a.id < b.id
}

type worker struct {
	r        *resource
	types    map[string]bool
	presence map[string]bool
}

func (w *worker) present(date string) bool {
	v, ok := w.presence[date]
	return !ok || v
}

type stepState int

const (
	stOpen stepState = iota
	stFinished
	stScheduled
	stFailed
)

type stepRun struct {
	id         string
	node       domain.ProcessNode
	state      stepState
	inProgress bool
	dur        int
	durOK      bool
	crew       int
	ancestors  []*stepRun
	desc       []*stepRun
	succ       []*stepRun
	end        int64
	// lagEnd is end plus the inter-operation time in working minutes: the
	// earliest a successor may start. Equal to end when the lag is 0.
	lagEnd int64
}

type orderRun struct {
	order       Order
	steps       []*stepRun
	byID        map[string]*stepRun
	avail       int64
	rank        int
	remaining   int64
	lastEnd     int64
	hasBlock    bool
	unplannable bool
}

type planner struct {
	in         Input
	cal        *calendar
	date       time.Time
	startMin   int64
	hasStart   bool
	horizon    int
	dates      []string
	segs       []seg
	types      map[string]domain.MachineType
	machines   map[string]*resource
	byType     map[string][]*resource
	workers    []*worker
	workerByID map[string]*worker
	qualified  map[string]int
	maxPresent int
	orders     []*orderRun
	orderByID  map[string]*orderRun
	out        []domain.PlanAssignment
	issues     []domain.PlanIssue
}

func plan(in Input) (Result, error) {
	cal, err := newCalendar(in.Hours)
	if err != nil {
		return Result{}, err
	}
	date, err := time.Parse(layoutDate, in.Date)
	if err != nil {
		return Result{}, fmt.Errorf("planner: invalid plan date %q", in.Date)
	}
	p := &planner{
		in: in, cal: cal, date: date,
		horizon:    in.HorizonDays,
		types:      map[string]domain.MachineType{},
		machines:   map[string]*resource{},
		byType:     map[string][]*resource{},
		workerByID: map[string]*worker{},
		qualified:  map[string]int{},
		orderByID:  map[string]*orderRun{},
	}
	if p.horizon <= 0 {
		p.horizon = domain.PlanningForecastDays
	}
	if !in.Start.IsZero() {
		p.hasStart = true
		unix := in.Start.Unix()
		p.startMin = unix / 60
		if unix%60 != 0 {
			p.startMin++
		}
	}
	p.dates, p.segs = cal.horizon(date, p.horizon, p.startMin, p.hasStart)

	p.setupResources()
	p.setupOrders()
	if err := p.applyPinned(); err != nil {
		return Result{}, err
	}
	p.flagStatic()
	p.placeInProgress()
	p.placePending()
	return p.result(), nil
}

func (p *planner) setupResources() {
	for _, t := range p.in.MachineTypes {
		p.types[t.ID] = t
	}
	machines := append([]domain.Machine(nil), p.in.Machines...)
	sort.Slice(machines, func(i, j int) bool {
		if machines[i].Name != machines[j].Name {
			return machines[i].Name < machines[j].Name
		}
		return machines[i].ID < machines[j].ID
	})
	for _, m := range machines {
		if _, dup := p.machines[m.ID]; dup {
			continue
		}
		r := &resource{id: m.ID, name: m.Name}
		p.machines[m.ID] = r
		if _, known := p.types[m.MachineTypeID]; known && m.InService {
			p.byType[m.MachineTypeID] = append(p.byType[m.MachineTypeID], r)
		}
	}
	workers := append([]Worker(nil), p.in.Workers...)
	sort.Slice(workers, func(i, j int) bool {
		if workers[i].Username != workers[j].Username {
			return workers[i].Username < workers[j].Username
		}
		return workers[i].UserID < workers[j].UserID
	})
	for _, w := range workers {
		if _, dup := p.workerByID[w.UserID]; dup {
			continue
		}
		wk := &worker{
			r:        &resource{id: w.UserID, name: w.Username},
			types:    map[string]bool{},
			presence: w.Presence,
		}
		for _, id := range w.MachineTypeIDs {
			wk.types[id] = true
		}
		for id := range wk.types {
			p.qualified[id]++
		}
		p.workers = append(p.workers, wk)
		p.workerByID[w.UserID] = wk
	}
	for _, date := range p.dates {
		count := 0
		for _, w := range p.workers {
			if w.present(date) {
				count++
			}
		}
		if count > p.maxPresent {
			p.maxPresent = count
		}
	}
}

func (p *planner) setupOrders() {
	orders := append([]Order(nil), p.in.Orders...)
	sort.SliceStable(orders, func(i, j int) bool {
		if orders[i].Number != orders[j].Number {
			return orders[i].Number < orders[j].Number
		}
		return orders[i].ID < orders[j].ID
	})
	for _, o := range orders {
		if _, dup := p.orderByID[o.ID]; dup {
			continue
		}
		run := &orderRun{order: o, byID: map[string]*stepRun{}}
		run.avail = p.availFor(o.DueDate)
		if o.Priority == domain.WorkOrderPriorityUrgent || o.Priority == domain.WorkOrderPriorityHigh {
			run.rank = 0
		} else {
			run.rank = 1
		}
		gi := indexGraph(o.Graph)
		for _, id := range gi.stepIDs {
			node := gi.nodes[id]
			s := &stepRun{id: id, node: node, crew: domain.StepCrewSize(node)}
			s.dur, s.durOK = domain.StepDurationMinutes(node, o.Quantity)
			switch node.Status {
			case domain.ProcessStepDone, domain.ProcessStepSkipped:
				s.state = stFinished
			case domain.ProcessStepInProgress:
				s.inProgress = true
			}
			run.steps = append(run.steps, s)
			run.byID[id] = s
		}
		for _, s := range run.steps {
			for _, a := range gi.ancestors(s.id) {
				anc := run.byID[a]
				s.ancestors = append(s.ancestors, anc)
				anc.desc = append(anc.desc, s)
			}
			for _, id := range gi.successors(s.id) {
				s.succ = append(s.succ, run.byID[id])
			}
		}
		p.orders = append(p.orders, run)
		p.orderByID[o.ID] = run
	}
}

// availFor is the working time between the planning start and the end of the
// due date's shift (negative when already overdue).
func (p *planner) availFor(due *string) int64 {
	if due == nil {
		return farAvail
	}
	d, err := time.Parse(layoutDate, *due)
	if err != nil {
		return farAvail
	}
	diff := int(d.Sub(p.date).Hours() / 24)
	if diff > 400 {
		return farAvail
	}
	var total int64
	if diff >= 0 {
		for i := 0; i <= diff; i++ {
			total += p.cal.minutesOn(p.date.AddDate(0, 0, i), p.startMin, p.hasStart)
		}
		return total
	}
	if diff < -400 {
		diff = -400
	}
	for i := diff + 1; i < 0; i++ {
		total -= p.cal.minutesOn(p.date.AddDate(0, 0, i), 0, false)
	}
	return total + int64(diff)
}

func (p *planner) applyPinned() error {
	pinned := append([]domain.PlanAssignment(nil), p.in.Pinned...)
	sort.SliceStable(pinned, func(i, j int) bool {
		if pinned[i].Start != pinned[j].Start {
			return pinned[i].Start < pinned[j].Start
		}
		return pinned[i].ID < pinned[j].ID
	})
	for _, a := range pinned {
		s, ok1 := p.cal.parse(a.Start)
		e, ok2 := p.cal.parse(a.End)
		if !ok1 || !ok2 || e < s {
			return fmt.Errorf("planner: invalid time in pinned block %q", a.ID)
		}
		if a.MachineID != nil {
			m := p.machines[*a.MachineID]
			if m == nil {
				m = &resource{id: *a.MachineID, name: a.MachineName}
				p.machines[*a.MachineID] = m
			}
			m.reserve(s, e)
			m.load += a.Minutes
		}
		for _, uid := range a.UserIDs {
			w := p.workerByID[uid]
			var r *resource
			if w != nil {
				r = w.r
			} else {
				// Unknown person: keep the booking without making them assignable.
				r = &resource{id: uid, name: uid}
				p.workerByID[uid] = &worker{r: r, types: map[string]bool{}, presence: map[string]bool{}}
			}
			r.reserve(s, e)
			r.load += a.Minutes
		}
		clone := a
		clone.UserIDs = append([]string{}, a.UserIDs...)
		if a.MachineID != nil {
			id := *a.MachineID
			clone.MachineID = &id
		}
		p.out = append(p.out, clone)
		if o := p.orderByID[a.WorkOrderID]; o != nil {
			if !o.hasBlock || e > o.lastEnd {
				o.lastEnd, o.hasBlock = e, true
			}
			if st := o.byID[a.StepNodeID]; st != nil && st.state == stOpen {
				st.state = stScheduled
				if e > st.end {
					st.end, st.lagEnd = e, p.afterLag(e)
				}
			} else if st != nil && st.state == stScheduled && e > st.end {
				st.end, st.lagEnd = e, p.afterLag(e)
			}
		}
	}
	return nil
}

// afterLag is the earliest a successor may start after a step ending at end:
// end plus Hours.TransferMinutes of working time (D-028). A lag that never
// elapses within the calendar pushes the successor past the horizon.
func (p *planner) afterLag(end int64) int64 {
	lag := p.in.Hours.TransferMinutes
	if lag <= 0 {
		return end
	}
	at, ok := p.cal.addWorking(end, lag)
	if !ok {
		return farAvail
	}
	return at
}

func (p *planner) message(o *orderRun, s *stepRun, text string) string {
	return fmt.Sprintf("Nalog %s, korak „%s“: %s", o.order.Number, s.node.Label, text)
}

func (p *planner) addIssue(o *orderRun, s *stepRun, code domain.PlanIssueCode, text string) {
	if code != domain.PlanIssueMissingDuration {
		o.unplannable = true
	}
	p.issues = append(p.issues, domain.PlanIssue{
		Code: code, WorkOrderID: o.order.ID, OrderNumber: o.order.Number,
		StepNodeID: s.id, StepLabel: s.node.Label, Message: p.message(o, s, text),
	})
}

// flagStatic reports steps that can never be planned, whatever the schedule,
// and the open steps without a duration; then blocks everything downstream of
// the failed ones.
func (p *planner) flagStatic() {
	var failed []struct {
		o *orderRun
		s *stepRun
	}
	for _, o := range p.orders {
		for _, s := range o.steps {
			if s.state != stOpen {
				continue
			}
			if !s.durOK {
				p.addIssue(o, s, domain.PlanIssueMissingDuration, "nije uneto trajanje koraka, planira se sa 0 minuta.")
			}
			if code, text := p.staticProblem(s); code != "" {
				s.state = stFailed
				p.addIssue(o, s, code, text)
				failed = append(failed, struct {
					o *orderRun
					s *stepRun
				}{o, s})
			}
		}
	}
	for _, f := range failed {
		p.blockDownstream(f.o, f.s)
	}
}

func (p *planner) staticProblem(s *stepRun) (domain.PlanIssueCode, string) {
	typeID := s.node.MachineTypeID
	if typeID != "" {
		mt, known := p.types[typeID]
		if !known {
			return domain.PlanIssueUnknownMachineType, "tip mašine ne postoji."
		}
		if len(p.byType[typeID]) == 0 {
			return domain.PlanIssueNoMachine, fmt.Sprintf("nema ispravne mašine tipa „%s“.", mt.Name)
		}
		if p.qualified[typeID] == 0 {
			return domain.PlanIssueNoWorkers, fmt.Sprintf("nema radnika osposobljenog za tip mašine „%s“.", mt.Name)
		}
	}
	limit := len(p.workers)
	if len(p.dates) > 0 && p.maxPresent < limit {
		limit = p.maxPresent
	}
	if s.crew > limit {
		return domain.PlanIssueNoWorkers, fmt.Sprintf("potrebno je %d ljudi, a najviše je dostupno %d.", s.crew, limit)
	}
	return "", ""
}

// blockDownstream fails every still-open step downstream of a failed one.
func (p *planner) blockDownstream(o *orderRun, failed *stepRun) {
	for _, d := range failed.desc {
		if d.state != stOpen {
			continue
		}
		d.state = stFailed
		p.addIssue(o, d, domain.PlanIssueNoCapacity,
			fmt.Sprintf("čeka korak „%s“ koji nije moguće rasporediti.", failed.node.Label))
	}
}

func (p *planner) fail(o *orderRun, s *stepRun) {
	s.state = stFailed
	p.addIssue(o, s, domain.PlanIssueNoCapacity,
		fmt.Sprintf("ne staje u plan za narednih %d radnih dana.", p.horizon))
	p.blockDownstream(o, s)
	o.recompute()
}

// recompute sets remaining to the longest chain of still-open steps.
func (o *orderRun) recompute() {
	memo := make(map[*stepRun]int64, len(o.steps))
	visiting := map[*stepRun]bool{}
	var longest func(s *stepRun) int64
	longest = func(s *stepRun) int64 {
		if v, ok := memo[s]; ok {
			return v
		}
		if visiting[s] {
			return 0
		}
		visiting[s] = true
		var tail int64
		for _, n := range s.succ {
			if n.state != stOpen {
				continue
			}
			if v := longest(n); v > tail {
				tail = v
			}
		}
		visiting[s] = false
		memo[s] = int64(s.dur) + tail
		return memo[s]
	}
	o.remaining = 0
	for _, s := range o.steps {
		if s.state != stOpen {
			continue
		}
		if v := longest(s); v > o.remaining {
			o.remaining = v
		}
	}
}

func (p *planner) placeInProgress() {
	for _, o := range p.orders {
		o.recompute()
	}
	for _, o := range p.orders {
		for _, s := range o.steps {
			if s.state == stOpen && s.inProgress {
				if !p.place(o, s, p.startMin, true) {
					p.fail(o, s)
				}
			}
		}
	}
}

// ready is the earliest start of a pending step: the planning start, or the
// latest scheduled ancestor's end plus the inter-operation time. ok is false
// while an ancestor is still unscheduled.
func (p *planner) ready(s *stepRun) (int64, bool) {
	at := p.startMin
	for _, a := range s.ancestors {
		switch a.state {
		case stFinished:
		case stScheduled:
			if a.lagEnd > at {
				at = a.lagEnd
			}
		default:
			return 0, false
		}
	}
	return at, true
}

// moreUrgent orders candidates: smaller slack, then urgent/high before
// normal/low, older order, order number, then step id.
func moreUrgent(a, b *orderRun, aStep, bStep *stepRun) bool {
	sa, sb := a.avail-a.remaining, b.avail-b.remaining
	if sa != sb {
		return sa < sb
	}
	if a.rank != b.rank {
		return a.rank < b.rank
	}
	if a.order.CreatedAt != b.order.CreatedAt {
		return a.order.CreatedAt < b.order.CreatedAt
	}
	if a.order.Number != b.order.Number {
		return a.order.Number < b.order.Number
	}
	if a.order.ID != b.order.ID {
		return a.order.ID < b.order.ID
	}
	return aStep.id < bStep.id
}

func (p *planner) placePending() {
	for {
		var bestOrder *orderRun
		var bestStep *stepRun
		var bestReady int64
		for _, o := range p.orders {
			for _, s := range o.steps {
				if s.state != stOpen {
					continue
				}
				at, ok := p.ready(s)
				if !ok {
					continue
				}
				if bestStep == nil || moreUrgent(o, bestOrder, s, bestStep) {
					bestOrder, bestStep, bestReady = o, s, at
				}
			}
		}
		if bestStep == nil {
			break
		}
		if !p.place(bestOrder, bestStep, bestReady, false) {
			p.fail(bestOrder, bestStep)
		}
	}
	// Anything still open waits on a cycle; report it rather than drop it.
	for _, o := range p.orders {
		for _, s := range o.steps {
			if s.state == stOpen {
				p.fail(o, s)
			}
		}
	}
}

// candidates are the start times worth trying for a step, earliest first.
func (p *planner) candidates(s *stepRun, t0 int64, inclusive bool) []int64 {
	raw := []int64{t0}
	addBusy := func(r *resource) {
		i := sort.Search(len(r.busy), func(i int) bool { return r.busy[i][1] > t0 })
		for ; i < len(r.busy); i++ {
			raw = append(raw, r.busy[i][1])
		}
	}
	for _, m := range p.byType[s.node.MachineTypeID] {
		addBusy(m)
	}
	for _, w := range p.workers {
		addBusy(w.r)
	}
	for _, sg := range p.segs {
		if sg.s > t0 {
			raw = append(raw, sg.s)
		}
	}
	snapped := make([]int64, 0, len(raw))
	for _, t := range raw {
		if at, _, ok := snap(p.segs, t, inclusive); ok {
			snapped = append(snapped, at)
		}
	}
	sort.Slice(snapped, func(i, j int) bool { return snapped[i] < snapped[j] })
	out := snapped[:0]
	for _, t := range snapped {
		if len(out) == 0 || t != out[len(out)-1] {
			out = append(out, t)
		}
	}
	return out
}

func freeFor(r *resource, parts []part) bool {
	for _, pt := range parts {
		if r.overlaps(pt.start, pt.end) {
			return false
		}
	}
	return true
}

// tryChain picks the machine and crew for a block laid out as parts.
func (p *planner) tryChain(s *stepRun, parts []part) (*resource, []*worker, bool) {
	typeID := s.node.MachineTypeID
	var machine *resource
	if typeID != "" {
		for _, m := range p.byType[typeID] {
			if freeFor(m, parts) && (machine == nil || lessResource(m, machine)) {
				machine = m
			}
		}
		if machine == nil {
			return nil, nil, false
		}
	}
	var avail []*worker
	for _, w := range p.workers {
		ok := true
		for _, pt := range parts {
			if !w.present(p.dates[pt.day]) {
				ok = false
				break
			}
		}
		if ok && freeFor(w.r, parts) {
			avail = append(avail, w)
		}
	}
	if len(avail) < s.crew {
		return nil, nil, false
	}
	sort.Slice(avail, func(i, j int) bool { return lessResource(avail[i].r, avail[j].r) })
	crew := make([]*worker, 0, s.crew)
	if typeID == "" {
		crew = append(crew, avail[:s.crew]...)
		return machine, crew, true
	}
	var lead *worker
	for _, w := range avail {
		if w.types[typeID] {
			lead = w
			break
		}
	}
	if lead == nil {
		return nil, nil, false
	}
	crew = append(crew, lead)
	for _, w := range avail {
		if len(crew) == s.crew {
			break
		}
		if w != lead {
			crew = append(crew, w)
		}
	}
	return machine, crew, true
}

// place puts a step at its earliest feasible start and records the blocks.
func (p *planner) place(o *orderRun, s *stepRun, ready int64, locked bool) bool {
	inclusive := s.dur <= 0
	t0, _, ok := snap(p.segs, ready, inclusive)
	if !ok {
		return false
	}
	for _, t := range p.candidates(s, t0, inclusive) {
		at, idx, ok := snap(p.segs, t, inclusive)
		if !ok {
			break
		}
		parts, ok := chain(p.segs, idx, at, s.dur)
		if !ok {
			break
		}
		machine, crew, ok := p.tryChain(s, parts)
		if !ok {
			continue
		}
		p.commit(o, s, parts, machine, crew, locked)
		return true
	}
	return false
}

func (p *planner) commit(o *orderRun, s *stepRun, parts []part, machine *resource, crew []*worker, locked bool) {
	ids := make([]string, len(crew))
	for i, w := range crew {
		ids[i] = w.r.id
	}
	for i, pt := range parts {
		if machine != nil {
			machine.reserve(pt.start, pt.end)
		}
		for _, w := range crew {
			w.r.reserve(pt.start, pt.end)
		}
		a := domain.PlanAssignment{
			ID:          fmt.Sprintf("%s:%s:%d", o.order.ID, s.id, i+1),
			WorkOrderID: o.order.ID,
			OrderNumber: o.order.Number,
			ClientName:  o.order.ClientName,
			StepNodeID:  s.id,
			StepLabel:   s.node.Label,
			LeadUserID:  ids[0],
			UserIDs:     append([]string{}, ids...),
			Start:       p.cal.format(pt.start),
			End:         p.cal.format(pt.end),
			Minutes:     pt.minutes,
			Part:        i + 1,
			Parts:       len(parts),
			Locked:      locked,
		}
		if machine != nil {
			id := machine.id
			a.MachineID = &id
			a.MachineName = machine.name
		}
		p.out = append(p.out, a)
	}
	if machine != nil {
		machine.load += s.dur
	}
	for _, w := range crew {
		w.r.load += s.dur
	}
	s.state = stScheduled
	s.end = parts[len(parts)-1].end
	s.lagEnd = p.afterLag(s.end)
	if !o.hasBlock || s.end > o.lastEnd {
		o.lastEnd, o.hasBlock = s.end, true
	}
	o.recompute()
}

func (p *planner) result() Result {
	res := Result{
		Assignments: append([]domain.PlanAssignment{}, p.out...),
		Issues:      append([]domain.PlanIssue{}, p.issues...),
		Forecast:    make([]domain.OrderForecast, 0, len(p.orders)),
	}
	sort.SliceStable(res.Assignments, func(i, j int) bool {
		a, b := res.Assignments[i], res.Assignments[j]
		switch {
		case a.Start != b.Start:
			return a.Start < b.Start
		case a.MachineName != b.MachineName:
			return a.MachineName < b.MachineName
		case a.OrderNumber != b.OrderNumber:
			return a.OrderNumber < b.OrderNumber
		case a.WorkOrderID != b.WorkOrderID:
			return a.WorkOrderID < b.WorkOrderID
		case a.StepNodeID != b.StepNodeID:
			return a.StepNodeID < b.StepNodeID
		case a.Part != b.Part:
			return a.Part < b.Part
		}
		return a.ID < b.ID
	})
	sort.SliceStable(res.Issues, func(i, j int) bool {
		a, b := res.Issues[i], res.Issues[j]
		switch {
		case a.OrderNumber != b.OrderNumber:
			return a.OrderNumber < b.OrderNumber
		case a.WorkOrderID != b.WorkOrderID:
			return a.WorkOrderID < b.WorkOrderID
		case a.StepNodeID != b.StepNodeID:
			return a.StepNodeID < b.StepNodeID
		}
		return a.Code < b.Code
	})
	startDate := p.in.Date
	if p.hasStart {
		startDate = p.cal.formatDate(p.startMin)
	}
	for _, o := range p.orders {
		f := domain.OrderForecast{
			WorkOrderID: o.order.ID, OrderNumber: o.order.Number, ClientName: o.order.ClientName,
			DueDate: o.order.DueDate, Priority: string(o.order.Priority),
		}
		if o.unplannable {
			f.Unplannable = true
		} else {
			finish := startDate
			if o.hasBlock {
				finish = p.cal.formatDate(o.lastEnd)
			}
			f.EstimatedFinish = &finish
			f.Late = o.order.DueDate != nil && finish > *o.order.DueDate
		}
		res.Forecast = append(res.Forecast, f)
	}
	return res
}
