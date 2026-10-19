package domain

import (
	"math"
	"sort"
	"strings"
)

// Warehouse stock ("magacin"). Stock is an append-only movement ledger per
// catalog article: on-hand is the sum of the article's movements. Work-order
// process graphs post movements automatically (see PlanStockPostings).

// StockMovementKind classifies a ledger row.
type StockMovementKind string

const (
	StockMovementOpening     StockMovementKind = "opening"
	StockMovementReceipt     StockMovementKind = "receipt"
	StockMovementConsumption StockMovementKind = "consumption"
	StockMovementProduction  StockMovementKind = "production"
	StockMovementAdjustment  StockMovementKind = "adjustment"
)

// Posting limits.
const (
	MaxStockReceiptLines = 200
	MaxStockCountLines   = 1000
	MaxStockText         = 500
)

// StockEpsilon is the tolerance under which a quantity difference is ignored.
const StockEpsilon = 1e-9

// StockLevel is one article's stock position.
type StockLevel struct {
	CatalogItemID  string   `json:"catalogItemId"`
	Code           string   `json:"code"`
	Name           string   `json:"name"`
	Unit           string   `json:"unit"`
	IsActive       bool     `json:"isActive"`
	OnHand         float64  `json:"onHand"`
	Reserved       float64  `json:"reserved"`
	Available      float64  `json:"available"`
	MinStock       *float64 `json:"minStock"`
	Low            bool     `json:"low"`
	LastMovementAt *string  `json:"lastMovementAt"`
}

// StockLevelList is a page of stock levels plus the total match count.
type StockLevelList struct {
	Items []StockLevel `json:"items"`
	Total int          `json:"total"`
}

// StockMovement is one signed ledger row.
type StockMovement struct {
	ID              string            `json:"id"`
	CatalogItemID   string            `json:"catalogItemId"`
	ItemCode        string            `json:"itemCode"`
	ItemName        string            `json:"itemName"`
	Unit            string            `json:"unit"`
	Kind            StockMovementKind `json:"kind"`
	Quantity        float64           `json:"quantity"`
	WorkOrderID     *string           `json:"workOrderId"`
	WorkOrderNumber *string           `json:"workOrderNumber"`
	ProcessNodeID   *string           `json:"processNodeId"`
	DocumentRef     *string           `json:"documentRef"`
	Note            *string           `json:"note"`
	CreatedAt       string            `json:"createdAt"`
	CreatedBy       string            `json:"createdBy"`
}

// StockMovementList is a page of movements plus the total match count.
type StockMovementList struct {
	Items []StockMovement `json:"items"`
	Total int             `json:"total"`
}

// StockReceiptLine is one received article.
type StockReceiptLine struct {
	CatalogItemID string  `json:"catalogItemId"`
	Quantity      float64 `json:"quantity"`
}

// StockReceiptInput is a goods receipt (prijem robe).
type StockReceiptInput struct {
	DocumentRef string             `json:"documentRef,omitempty"`
	Note        string             `json:"note,omitempty"`
	Lines       []StockReceiptLine `json:"lines"`
}

// StockCountLine is one counted article.
type StockCountLine struct {
	CatalogItemID   string  `json:"catalogItemId"`
	CountedQuantity float64 `json:"countedQuantity"`
}

// StockCountInput is a stock count (popis / opening balance).
type StockCountInput struct {
	Note  string           `json:"note,omitempty"`
	Lines []StockCountLine `json:"lines"`
}

// StockPostingResult lists the movements a posting created.
type StockPostingResult struct {
	Movements []StockMovement `json:"movements"`
}

// StockLow reports whether a level should be flagged: available stock under the
// minimum, or negative on-hand stock.
func StockLow(onHand, available float64, minStock *float64) bool {
	if onHand < -StockEpsilon {
		return true
	}
	return minStock != nil && available < *minStock-StockEpsilon
}

// StockArticle is what link validation needs to know about a catalog article.
type StockArticle struct {
	ID   string
	Name string
	Unit string
}

const (
	// StockArticleNotFoundMessage is the 422 for a link to a missing/service item.
	StockArticleNotFoundMessage = "Artikal nije pronađen u katalogu."
	// StockQuantityPositiveMessage is the 422 for a receipt quantity <= 0.
	StockQuantityPositiveMessage = "Količina mora biti veća od nule."
	// StockCountNegativeMessage is the 422 for a negative counted quantity.
	StockCountNegativeMessage = "Prebrojana količina ne može biti negativna."
	// StockDuplicateArticleMessage is the 422 for an article repeated in one request.
	StockDuplicateArticleMessage = "Artikal se ponavlja."
)

// StockUnitMismatchMessage is the 422 for a node unit that differs from the
// linked article's unit.
func StockUnitMismatchMessage(articleName string) string {
	return "Jedinica mora odgovarati jedinici artikla „" + articleName + "“."
}

// ResolveGraphArticleLinks validates the catalog links of a graph's item nodes
// and returns a copy where an empty node unit is filled from the article.
// lookup reports the tenant's article for an id (false when missing or not an
// article). Nodes for which skip returns true are left untouched, so a link
// that was already stored never blocks unrelated edits. The input is not
// modified. Failures are *ProcessGraphError (a 422 in the store).
func ResolveGraphArticleLinks(
	graph ProcessGraph,
	lookup func(id string) (StockArticle, bool),
	skip func(ProcessNode) bool,
) (ProcessGraph, error) {
	out := CloneProcessGraph(graph)
	for i := range out.Nodes {
		node := &out.Nodes[i]
		if !node.Kind.isItem() || node.CatalogItemID == "" {
			continue
		}
		if skip != nil && skip(*node) {
			continue
		}
		article, ok := lookup(node.CatalogItemID)
		if !ok {
			return ProcessGraph{}, graphError(StockArticleNotFoundMessage)
		}
		unit := strings.TrimSpace(node.Unit)
		switch {
		case unit == "":
			node.Unit = article.Unit
		case !strings.EqualFold(unit, strings.TrimSpace(article.Unit)):
			return ProcessGraph{}, graphError(StockUnitMismatchMessage(article.Name))
		}
	}
	return out, nil
}

// GraphArticleIDs returns the distinct catalog ids linked from item nodes.
func GraphArticleIDs(graph ProcessGraph) []string {
	seen := map[string]bool{}
	ids := []string{}
	for _, node := range graph.Nodes {
		if node.Kind.isItem() && node.CatalogItemID != "" && !seen[node.CatalogItemID] {
			seen[node.CatalogItemID] = true
			ids = append(ids, node.CatalogItemID)
		}
	}
	return ids
}

// StockNet is the net quantity a linked node should have posted: positive adds
// stock, negative removes it.
type StockNet struct {
	CatalogItemID string
	Net           float64
}

// nodeStockQuantity is the actual quantity when recorded (an absolute
// per-order figure the operator entered), else the planned per-unit quantity
// scaled by factor (see PlannedQuantityFactor).
func nodeStockQuantity(node ProcessNode, factor float64) float64 {
	quantity := 0.0
	switch {
	case node.ActualQuantity != nil:
		quantity = *node.ActualQuantity
	case node.Quantity != nil:
		quantity = ScalePlannedQuantity(*node.Quantity, factor)
	}
	if quantity < 0 || math.IsNaN(quantity) || math.IsInf(quantity, 0) {
		return 0
	}
	return quantity
}

// graphStepLinks maps item node ids to the step nodes they feed (consumers)
// and the step nodes that produce them (producers).
func graphStepLinks(graph ProcessGraph) (steps map[string]ProcessNode, consumers, producers map[string][]string) {
	steps = map[string]ProcessNode{}
	kinds := map[string]ProcessNodeKind{}
	for _, node := range graph.Nodes {
		kinds[node.ID] = node.Kind
		if node.Kind == ProcessNodeStep {
			steps[node.ID] = node
		}
	}
	consumers = map[string][]string{}
	producers = map[string][]string{}
	for _, edge := range graph.Edges {
		if kinds[edge.Source].isItem() && kinds[edge.Target] == ProcessNodeStep {
			consumers[edge.Source] = append(consumers[edge.Source], edge.Target)
		}
		if kinds[edge.Source] == ProcessNodeStep && kinds[edge.Target].isItem() {
			producers[edge.Target] = append(producers[edge.Target], edge.Source)
		}
	}
	return steps, consumers, producers
}

func anyStepDone(steps map[string]ProcessNode, ids []string) bool {
	for _, id := range ids {
		if steps[id].Status == ProcessStepDone {
			return true
		}
	}
	return false
}

// DesiredStockNet returns, for every item node linked to a catalog article, the
// net stock movement the graph's current state implies:
//
//   - consumed (any step the node feeds is done): -qty, once per node;
//   - produced (a step that outputs the node is done): +qty;
//   - an intermediate product that is both produced and consumed nets out.
//
// qty is actualQuantity, else quantity × factor (the order's planned-quantity
// factor, see PlannedQuantityFactor), else 0. "skipped" and "in_progress"
// count as not done. The map is keyed by node id.
func DesiredStockNet(graph ProcessGraph, factor float64) map[string]StockNet {
	steps, consumers, producers := graphStepLinks(graph)
	desired := map[string]StockNet{}
	for _, node := range graph.Nodes {
		if !node.Kind.isItem() || node.CatalogItemID == "" {
			continue
		}
		quantity := nodeStockQuantity(node, factor)
		net := 0.0
		if node.Kind != ProcessNodeInput && anyStepDone(steps, producers[node.ID]) {
			net += quantity
		}
		if anyStepDone(steps, consumers[node.ID]) {
			net -= quantity
		}
		desired[node.ID] = StockNet{CatalogItemID: node.CatalogItemID, Net: net}
	}
	return desired
}

// ReservedInputs returns the planned quantity still to be consumed per article
// by the graph's linked input nodes (kind "input" only) whose consuming steps
// are not yet done, scaled by the order's planned-quantity factor (see
// PlannedQuantityFactor). Intended to be summed over open work orders.
func ReservedInputs(graph ProcessGraph, factor float64) map[string]float64 {
	steps, consumers, _ := graphStepLinks(graph)
	reserved := map[string]float64{}
	for _, node := range graph.Nodes {
		if node.Kind != ProcessNodeInput || node.CatalogItemID == "" {
			continue
		}
		if anyStepDone(steps, consumers[node.ID]) {
			continue
		}
		planned := 0.0
		if node.Quantity != nil && *node.Quantity > 0 {
			planned = ScalePlannedQuantity(*node.Quantity, factor)
		}
		if planned > 0 {
			reserved[node.CatalogItemID] += planned
		}
	}
	return reserved
}

// StockNodeKey identifies the ledger bucket of one process node and article.
type StockNodeKey struct {
	NodeID        string
	CatalogItemID string
}

// PlannedStockMovement is a movement the diff algorithm wants inserted.
type PlannedStockMovement struct {
	CatalogItemID string
	NodeID        string
	Quantity      float64
	Kind          StockMovementKind
}

// PlanStockPostings compares the graph's desired net per node (planned
// quantities scaled by factor, see DesiredStockNet) with the net already posted
// for the order (existing, keyed by node and article) and returns one movement
// per difference. Nodes whose article changed get the old article reversed and
// the new one posted; nodes that left the graph are reversed. The result is
// ordered deterministically.
func PlanStockPostings(graph ProcessGraph, factor float64, existing map[StockNodeKey]float64) []PlannedStockMovement {
	desired := DesiredStockNet(graph, factor)
	steps, consumers, producers := graphStepLinks(graph)
	nodes := map[string]ProcessNode{}
	for _, node := range graph.Nodes {
		nodes[node.ID] = node
	}
	keys := map[StockNodeKey]bool{}
	for key := range existing {
		keys[key] = true
	}
	for nodeID, want := range desired {
		keys[StockNodeKey{NodeID: nodeID, CatalogItemID: want.CatalogItemID}] = true
	}
	ordered := make([]StockNodeKey, 0, len(keys))
	for key := range keys {
		ordered = append(ordered, key)
	}
	sort.Slice(ordered, func(i, j int) bool {
		if ordered[i].NodeID != ordered[j].NodeID {
			return ordered[i].NodeID < ordered[j].NodeID
		}
		return ordered[i].CatalogItemID < ordered[j].CatalogItemID
	})

	planned := []PlannedStockMovement{}
	for _, key := range ordered {
		want := 0.0
		if d, ok := desired[key.NodeID]; ok && d.CatalogItemID == key.CatalogItemID {
			want = d.Net
		}
		diff := want - existing[key]
		if math.Abs(diff) <= StockEpsilon {
			continue
		}
		planned = append(planned, PlannedStockMovement{
			CatalogItemID: key.CatalogItemID, NodeID: key.NodeID, Quantity: diff,
			Kind: postingKind(key, diff, nodes, steps, consumers, producers),
		})
	}
	return planned
}

// postingKind labels a planned movement. Material taken by a done consuming
// step is consumption and output of a done producing step is production;
// anything else — a step undone, a lower actual quantity, a relinked or
// removed node — is a correction (adjustment), so the history never shows
// paper "produced" just because a printing step was reopened.
func postingKind(
	key StockNodeKey,
	diff float64,
	nodes map[string]ProcessNode,
	steps map[string]ProcessNode,
	consumers, producers map[string][]string,
) StockMovementKind {
	node, ok := nodes[key.NodeID]
	if !ok || node.CatalogItemID != key.CatalogItemID {
		return StockMovementAdjustment
	}
	if diff < 0 && anyStepDone(steps, consumers[node.ID]) {
		return StockMovementConsumption
	}
	if diff > 0 && node.Kind != ProcessNodeInput && anyStepDone(steps, producers[node.ID]) {
		return StockMovementProduction
	}
	return StockMovementAdjustment
}

// ValidateStockReceipt checks a receipt payload shape (not article existence).
// Failures are user-facing Serbian messages.
func ValidateStockReceipt(input StockReceiptInput) string {
	if len(input.Lines) < 1 || len(input.Lines) > MaxStockReceiptLines {
		return "Prijem mora imati između 1 i 200 stavki."
	}
	seen := map[string]bool{}
	for _, line := range input.Lines {
		id := strings.TrimSpace(line.CatalogItemID)
		if id == "" {
			return StockArticleNotFoundMessage
		}
		if math.IsNaN(line.Quantity) || math.IsInf(line.Quantity, 0) || line.Quantity <= 0 {
			return StockQuantityPositiveMessage
		}
		if seen[id] {
			return StockDuplicateArticleMessage
		}
		seen[id] = true
	}
	return stockTextMessage(input.DocumentRef, input.Note)
}

// ValidateStockCount checks a count payload shape (not article existence).
func ValidateStockCount(input StockCountInput) string {
	if len(input.Lines) < 1 || len(input.Lines) > MaxStockCountLines {
		return "Popis mora imati između 1 i 1000 stavki."
	}
	seen := map[string]bool{}
	for _, line := range input.Lines {
		id := strings.TrimSpace(line.CatalogItemID)
		if id == "" {
			return StockArticleNotFoundMessage
		}
		if math.IsNaN(line.CountedQuantity) || math.IsInf(line.CountedQuantity, 0) || line.CountedQuantity < 0 {
			return StockCountNegativeMessage
		}
		if seen[id] {
			return StockDuplicateArticleMessage
		}
		seen[id] = true
	}
	return stockTextMessage(input.Note)
}

func stockTextMessage(values ...string) string {
	for _, value := range values {
		if len([]rune(strings.TrimSpace(value))) > MaxStockText {
			return "Tekst je predugačak (najviše 500 znakova)."
		}
	}
	return ""
}
