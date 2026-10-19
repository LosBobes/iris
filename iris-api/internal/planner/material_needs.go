package planner

import (
	"errors"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Material needs by week (D-028, "Potrebe materijala"): a pure aggregation
// over the published plans' kept horizon and the open orders' process graphs.
// Like the rest of the package it reads no clock and does no I/O; the store
// gathers the input.

const materialDateLayout = "2006-01-02"

// Errors of MaterialWeeks.
var (
	ErrMaterialWindowOrder = errors.New("material needs: window ends before it starts")
	ErrMaterialWindowSpan  = errors.New("material needs: window spans too many weeks")
)

// MaterialOrder is one open work order's process copy. Factor is its
// planned-quantity factor (domain.PlannedQuantityFactor): input quantities are
// per unit and scaled by it.
type MaterialOrder struct {
	WorkOrderID string
	Graph       domain.ProcessGraph
	Factor      float64
}

// MaterialNeedsInput is everything MaterialNeeds reads. Plans are published
// plans: the most recent one dated before the window plus every later one
// (any order). Stock holds the stock level of each linked article (an article
// missing from it is listed without stock figures).
type MaterialNeedsInput struct {
	Weeks  []domain.MaterialNeedsWeek
	Plans  []domain.ProductionPlan
	Orders []MaterialOrder
	Stock  map[string]domain.StockLevel
}

// MaterialWeeks splits the window from..to (inclusive) into calendar weeks
// (Monday to Sunday), the first and last clipped to the window. It fails when
// to is before from, a date is malformed, or the window touches more than
// domain.MaxMaterialNeedsWeeks weeks.
func MaterialWeeks(from, to string) ([]domain.MaterialNeedsWeek, error) {
	start, err := time.Parse(materialDateLayout, from)
	if err != nil {
		return nil, err
	}
	end, err := time.Parse(materialDateLayout, to)
	if err != nil {
		return nil, err
	}
	if end.Before(start) {
		return nil, ErrMaterialWindowOrder
	}
	weeks := make([]domain.MaterialNeedsWeek, 0, domain.MaxMaterialNeedsWeeks)
	for day := start; !day.After(end); {
		offset := (int(day.Weekday()) + 6) % 7 // days since Monday
		sunday := day.AddDate(0, 0, 6-offset)
		if sunday.After(end) {
			sunday = end
		}
		if len(weeks) == domain.MaxMaterialNeedsWeeks {
			return nil, ErrMaterialWindowSpan
		}
		weeks = append(weeks, domain.MaterialNeedsWeek{
			Start: day.Format(materialDateLayout), End: sunday.Format(materialDateLayout),
		})
		day = sunday.AddDate(0, 0, 1)
	}
	return weeks, nil
}

// EffectiveBlocks resolves which published blocks stand for each date from
// from on: a date's own published plan when one exists, else what the most
// recent earlier published plan projected onto it. A plan therefore speaks
// for the dates from its own date up to (not including) the next published
// plan's date. Blocks before from are left out; the result is sorted by
// start.
func EffectiveBlocks(plans []domain.ProductionPlan, from string) []domain.PlanAssignment {
	ordered := append([]domain.ProductionPlan(nil), plans...)
	sort.SliceStable(ordered, func(i, j int) bool { return ordered[i].Date < ordered[j].Date })
	blocks := make([]domain.PlanAssignment, 0)
	for i, plan := range ordered {
		lower := plan.Date
		if lower < from {
			lower = from
		}
		upper := ""
		if i+1 < len(ordered) {
			upper = ordered[i+1].Date
		}
		for _, block := range plan.Assignments {
			date := materialBlockDate(block)
			if date < lower || (upper != "" && date >= upper) {
				continue
			}
			blocks = append(blocks, block)
		}
	}
	sort.SliceStable(blocks, func(i, j int) bool {
		if blocks[i].Start != blocks[j].Start {
			return blocks[i].Start < blocks[j].Start
		}
		return blocks[i].ID < blocks[j].ID
	})
	return blocks
}

func materialBlockDate(block domain.PlanAssignment) string {
	if len(block.Start) < len(materialDateLayout) {
		return block.Start
	}
	return block.Start[:len(materialDateLayout)]
}

type materialStepKey struct{ order, step string }

// materialBucket accumulates one item of the report.
type materialBucket struct {
	item      domain.MaterialNeedsItem
	weeks     []float64
	unplanned float64
}

// MaterialNeeds aggregates the open orders' input material by week:
//
//   - only input nodes count, and only while none of the steps they feed is
//     done (consumption is posted when a consuming step is done, so posted
//     material is excluded) and at least one of them is open (not skipped);
//   - the quantity is the planned per-unit quantity × the order's factor
//     (inputs without a positive quantity are left out);
//   - it falls in the week of the first planned block of its open consuming
//     steps; with no block from the window's start on it is "unplanned", and
//     with a first block after the window it is out of the report;
//   - linked inputs are grouped by article and carry its stock figures;
//     unlinked ones are grouped by name and unit and carry none;
//   - ShortFromWeek is the first week whose cumulative need exceeds the stock
//     on hand (the article's reservations already include these very inputs,
//     so comparing with "available" would count them twice).
//
// Items are sorted shortages first (earliest week first), then by name.
func MaterialNeeds(in MaterialNeedsInput) domain.MaterialNeeds {
	out := domain.MaterialNeeds{
		Weeks: append([]domain.MaterialNeedsWeek{}, in.Weeks...),
		Items: []domain.MaterialNeedsItem{},
	}
	if len(in.Weeks) == 0 {
		return out
	}
	out.From, out.To = in.Weeks[0].Start, in.Weeks[len(in.Weeks)-1].End

	firstBlock := map[materialStepKey]string{}
	for _, block := range EffectiveBlocks(in.Plans, out.From) {
		key := materialStepKey{block.WorkOrderID, block.StepNodeID}
		if date, ok := firstBlock[key]; !ok || materialBlockDate(block) < date {
			firstBlock[key] = materialBlockDate(block)
		}
	}

	orders := append([]MaterialOrder(nil), in.Orders...)
	sort.SliceStable(orders, func(i, j int) bool { return orders[i].WorkOrderID < orders[j].WorkOrderID })
	buckets := map[string]*materialBucket{}
	keys := make([]string, 0)
	for _, order := range orders {
		for _, need := range orderInputNeeds(order, firstBlock) {
			week := -1 // unplanned
			if need.date != "" {
				if need.date > out.To {
					continue
				}
				week = weekIndex(in.Weeks, need.date)
			}
			key, bucket := materialBucketFor(need.node, in.Stock, buckets, len(in.Weeks))
			if _, seen := buckets[key]; !seen {
				buckets[key] = bucket
				keys = append(keys, key)
			}
			if week < 0 {
				bucket.unplanned += need.quantity
			} else {
				bucket.weeks[week] += need.quantity
			}
		}
	}

	for _, key := range keys {
		out.Items = append(out.Items, finishMaterialItem(buckets[key]))
	}
	sortMaterialItems(out.Items)
	return out
}

type inputNeed struct {
	node     domain.ProcessNode
	quantity float64
	date     string // first planned block of its open consumers; "" = none
}

// orderInputNeeds lists the order's input nodes that still need material, in
// graph order.
func orderInputNeeds(order MaterialOrder, firstBlock map[materialStepKey]string) []inputNeed {
	steps := map[string]domain.ProcessNode{}
	for _, node := range order.Graph.Nodes {
		if node.Kind == domain.ProcessNodeStep {
			steps[node.ID] = node
		}
	}
	consumers := map[string][]string{}
	for _, edge := range order.Graph.Edges {
		if _, isStep := steps[edge.Target]; isStep {
			consumers[edge.Source] = append(consumers[edge.Source], edge.Target)
		}
	}
	needs := make([]inputNeed, 0)
	for _, node := range order.Graph.Nodes {
		if node.Kind != domain.ProcessNodeInput || node.Quantity == nil || *node.Quantity <= 0 {
			continue
		}
		consumed, open, date := false, false, ""
		for _, stepID := range consumers[node.ID] {
			switch steps[stepID].Status {
			case domain.ProcessStepDone:
				consumed = true
			case domain.ProcessStepSkipped:
			default:
				open = true
				if first, ok := firstBlock[materialStepKey{order.WorkOrderID, stepID}]; ok && (date == "" || first < date) {
					date = first
				}
			}
		}
		if consumed || !open {
			continue
		}
		quantity := domain.ScalePlannedQuantity(*node.Quantity, order.Factor)
		if quantity <= 0 || math.IsNaN(quantity) || math.IsInf(quantity, 0) {
			continue
		}
		needs = append(needs, inputNeed{node: node, quantity: quantity, date: date})
	}
	return needs
}

// weekIndex is the week holding date (the window's weeks are contiguous and
// date is inside the window).
func weekIndex(weeks []domain.MaterialNeedsWeek, date string) int {
	for i, week := range weeks {
		if date <= week.End {
			return i
		}
	}
	return len(weeks) - 1
}

// materialBucketFor returns the bucket key of an input and, when the bucket is
// new, a fresh bucket (the existing one otherwise).
func materialBucketFor(
	node domain.ProcessNode, stock map[string]domain.StockLevel, buckets map[string]*materialBucket, weeks int,
) (string, *materialBucket) {
	if id := strings.TrimSpace(node.CatalogItemID); id != "" {
		key := "article\x00" + id
		if bucket, ok := buckets[key]; ok {
			return key, bucket
		}
		item := domain.MaterialNeedsItem{CatalogItemID: &id, Name: strings.TrimSpace(node.Label), Unit: strings.TrimSpace(node.Unit)}
		if level, ok := stock[id]; ok {
			item.Name, item.Unit = level.Name, level.Unit
			onHand, reserved, available := level.OnHand, level.Reserved, level.Available
			item.OnHand, item.Reserved, item.Available = &onHand, &reserved, &available
		}
		return key, &materialBucket{item: item, weeks: make([]float64, weeks)}
	}
	name, unit := strings.TrimSpace(node.Label), strings.TrimSpace(node.Unit)
	key := "input\x00" + strings.ToLower(name) + "\x00" + strings.ToLower(unit)
	if bucket, ok := buckets[key]; ok {
		return key, bucket
	}
	return key, &materialBucket{item: domain.MaterialNeedsItem{Name: name, Unit: unit}, weeks: make([]float64, weeks)}
}

func roundMaterial(value float64) float64 {
	return math.Round(value*1000) / 1000
}

func finishMaterialItem(bucket *materialBucket) domain.MaterialNeedsItem {
	item := bucket.item
	item.Weeks = make([]float64, len(bucket.weeks))
	item.Cumulative = make([]float64, len(bucket.weeks))
	total := 0.0
	for i, quantity := range bucket.weeks {
		item.Weeks[i] = roundMaterial(quantity)
		total += quantity
		item.Cumulative[i] = roundMaterial(total)
		if item.ShortFromWeek == nil && item.OnHand != nil && item.Cumulative[i] > *item.OnHand+domain.StockEpsilon {
			week := i
			item.ShortFromWeek = &week
		}
	}
	item.Unplanned = roundMaterial(bucket.unplanned)
	return item
}

// sortMaterialItems orders shortages first (earliest week first), then by
// name, then articles before unlinked inputs, then by article id and unit.
func sortMaterialItems(items []domain.MaterialNeedsItem) {
	sort.SliceStable(items, func(i, j int) bool {
		a, b := items[i], items[j]
		if (a.ShortFromWeek == nil) != (b.ShortFromWeek == nil) {
			return a.ShortFromWeek != nil
		}
		if a.ShortFromWeek != nil && *a.ShortFromWeek != *b.ShortFromWeek {
			return *a.ShortFromWeek < *b.ShortFromWeek
		}
		if an, bn := strings.ToLower(a.Name), strings.ToLower(b.Name); an != bn {
			return an < bn
		}
		if (a.CatalogItemID == nil) != (b.CatalogItemID == nil) {
			return a.CatalogItemID != nil
		}
		if a.CatalogItemID != nil && *a.CatalogItemID != *b.CatalogItemID {
			return *a.CatalogItemID < *b.CatalogItemID
		}
		return strings.ToLower(a.Unit) < strings.ToLower(b.Unit)
	})
}
