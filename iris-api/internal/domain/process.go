package domain

import (
	"math"
	"strings"
	"unicode/utf8"
)

// Process graph limits.
const (
	MaxProcessNodes      = 200
	MaxProcessEdges      = 400
	MaxProcessIDLength   = 64
	MaxProcessLabel      = 120
	MaxProcessUnit       = 20
	MaxProcessNote       = 500
	MaxProcessEdgeLabel  = 60
	MaxProcessNameLength = 120
)

// ProcessGraphError is a graph validation failure. Message is user-facing
// (Serbian); the store surfaces it as a 422.
type ProcessGraphError struct {
	Message string
}

func (e *ProcessGraphError) Error() string { return e.Message }

func graphError(message string) error { return &ProcessGraphError{Message: message} }

func (kind ProcessNodeKind) valid() bool {
	switch kind {
	case ProcessNodeStep, ProcessNodeInput, ProcessNodeProduct, ProcessNodeByproduct:
		return true
	}
	return false
}

func (kind ProcessNodeKind) isItem() bool {
	return kind == ProcessNodeInput || kind == ProcessNodeProduct || kind == ProcessNodeByproduct
}

func (status ProcessStepStatus) valid() bool {
	switch status {
	case ProcessStepPending, ProcessStepInProgress, ProcessStepDone, ProcessStepSkipped:
		return true
	}
	return false
}

// processConnectionAllowed reports whether an edge may run from a node of
// kind source to one of kind target: input→step, step→step, step→product,
// step→byproduct, product→step and byproduct→step. Nothing points into an
// input and items never connect to items.
func processConnectionAllowed(source, target ProcessNodeKind) bool {
	switch source {
	case ProcessNodeInput, ProcessNodeProduct, ProcessNodeByproduct:
		return target == ProcessNodeStep
	case ProcessNodeStep:
		return target == ProcessNodeStep || target == ProcessNodeProduct || target == ProcessNodeByproduct
	}
	return false
}

// NormalizeProcessGraph validates a graph and returns a cleaned copy: labels
// are trimmed, state and quantity fields that do not belong to a node's kind
// are dropped, and nil slices become empty ones. The input is not modified.
// Per-order state (status, actualQuantity) is kept as sent; step statuses that
// are set must be valid.
func NormalizeProcessGraph(graph ProcessGraph) (ProcessGraph, error) {
	if len(graph.Nodes) < 1 || len(graph.Nodes) > MaxProcessNodes {
		return ProcessGraph{}, graphError("Proces mora imati između 1 i 200 čvorova.")
	}
	if len(graph.Edges) > MaxProcessEdges {
		return ProcessGraph{}, graphError("Proces može imati najviše 400 veza.")
	}

	out := ProcessGraph{
		Nodes: make([]ProcessNode, 0, len(graph.Nodes)),
		Edges: make([]ProcessEdge, 0, len(graph.Edges)),
	}
	kinds := make(map[string]ProcessNodeKind, len(graph.Nodes))
	steps := 0
	for _, node := range graph.Nodes {
		node.ID = strings.TrimSpace(node.ID)
		if node.ID == "" || utf8.RuneCountInString(node.ID) > MaxProcessIDLength {
			return ProcessGraph{}, graphError("Svaki čvor mora imati oznaku (najviše 64 znaka).")
		}
		if _, dup := kinds[node.ID]; dup {
			return ProcessGraph{}, graphError("Oznake čvorova moraju biti jedinstvene.")
		}
		if !node.Kind.valid() {
			return ProcessGraph{}, graphError("Nepoznata vrsta čvora.")
		}
		node.Label = strings.TrimSpace(node.Label)
		if node.Label == "" || utf8.RuneCountInString(node.Label) > MaxProcessLabel {
			return ProcessGraph{}, graphError("Naziv čvora je obavezan (najviše 120 znakova).")
		}
		node.Note = strings.TrimSpace(node.Note)
		if utf8.RuneCountInString(node.Note) > MaxProcessNote {
			return ProcessGraph{}, graphError("Napomena čvora je predugačka (najviše 500 znakova).")
		}
		if math.IsNaN(node.X) || math.IsInf(node.X, 0) || math.IsNaN(node.Y) || math.IsInf(node.Y, 0) {
			return ProcessGraph{}, graphError("Položaj čvora nije ispravan.")
		}

		if node.Kind == ProcessNodeStep {
			steps++
			node.Quantity, node.ActualQuantity = nil, nil
			node.Unit, node.CatalogItemID = "", ""
			if node.Status != "" && !node.Status.valid() {
				return ProcessGraph{}, graphError("Nepoznat status koraka.")
			}
		} else {
			node.Status = ""
			node.Unit = strings.TrimSpace(node.Unit)
			node.CatalogItemID = strings.TrimSpace(node.CatalogItemID)
			if utf8.RuneCountInString(node.Unit) > MaxProcessUnit {
				return ProcessGraph{}, graphError("Jedinica mere je predugačka (najviše 20 znakova).")
			}
			for _, quantity := range []*float64{node.Quantity, node.ActualQuantity} {
				if quantity != nil && (*quantity < 0 || math.IsNaN(*quantity) || math.IsInf(*quantity, 0)) {
					return ProcessGraph{}, graphError("Količina ne može biti negativna.")
				}
			}
			node.Quantity = copyFloat(node.Quantity)
			node.ActualQuantity = copyFloat(node.ActualQuantity)
		}
		kinds[node.ID] = node.Kind
		out.Nodes = append(out.Nodes, node)
	}
	if steps == 0 {
		return ProcessGraph{}, graphError("Proces mora sadržati bar jedan korak.")
	}

	edgeIDs := make(map[string]bool, len(graph.Edges))
	pairs := make(map[[2]string]bool, len(graph.Edges))
	for _, edge := range graph.Edges {
		edge.ID = strings.TrimSpace(edge.ID)
		if edge.ID == "" || utf8.RuneCountInString(edge.ID) > MaxProcessIDLength {
			return ProcessGraph{}, graphError("Svaka veza mora imati oznaku (najviše 64 znaka).")
		}
		if edgeIDs[edge.ID] {
			return ProcessGraph{}, graphError("Oznake veza moraju biti jedinstvene.")
		}
		edgeIDs[edge.ID] = true
		sourceKind, sourceOK := kinds[edge.Source]
		targetKind, targetOK := kinds[edge.Target]
		if !sourceOK || !targetOK {
			return ProcessGraph{}, graphError("Veza upućuje na čvor koji ne postoji.")
		}
		if edge.Source == edge.Target {
			return ProcessGraph{}, graphError("Čvor ne može biti povezan sam sa sobom.")
		}
		pair := [2]string{edge.Source, edge.Target}
		if pairs[pair] {
			return ProcessGraph{}, graphError("Isti čvorovi ne mogu biti povezani više puta.")
		}
		pairs[pair] = true
		if !processConnectionAllowed(sourceKind, targetKind) {
			return ProcessGraph{}, graphError("Ova veza između čvorova nije dozvoljena.")
		}
		edge.Label = strings.TrimSpace(edge.Label)
		if utf8.RuneCountInString(edge.Label) > MaxProcessEdgeLabel {
			return ProcessGraph{}, graphError("Naziv veze je predugačak (najviše 60 znakova).")
		}
		out.Edges = append(out.Edges, edge)
	}
	if processGraphHasCycle(out) {
		return ProcessGraph{}, graphError("Proces ne sme sadržati cikluse.")
	}
	return out, nil
}

func copyFloat(value *float64) *float64 {
	if value == nil {
		return nil
	}
	copied := *value
	return &copied
}

// processGraphHasCycle runs Kahn's algorithm over a graph whose edges are
// already known to reference existing nodes.
func processGraphHasCycle(graph ProcessGraph) bool {
	indegree := make(map[string]int, len(graph.Nodes))
	next := make(map[string][]string, len(graph.Nodes))
	for _, node := range graph.Nodes {
		indegree[node.ID] = 0
	}
	for _, edge := range graph.Edges {
		indegree[edge.Target]++
		next[edge.Source] = append(next[edge.Source], edge.Target)
	}
	queue := make([]string, 0, len(graph.Nodes))
	for _, node := range graph.Nodes {
		if indegree[node.ID] == 0 {
			queue = append(queue, node.ID)
		}
	}
	visited := 0
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		visited++
		for _, target := range next[id] {
			indegree[target]--
			if indegree[target] == 0 {
				queue = append(queue, target)
			}
		}
	}
	return visited != len(graph.Nodes)
}

// PrepareTemplateGraph validates a graph for storage as a template: per-order
// state (status, actualQuantity) is stripped before validation, so a template
// never carries it.
func PrepareTemplateGraph(graph ProcessGraph) (ProcessGraph, error) {
	return NormalizeProcessGraph(StripProcessState(graph))
}

// PrepareWorkOrderGraph validates a graph for storage on a work order: step
// nodes without a status become "pending".
func PrepareWorkOrderGraph(graph ProcessGraph) (ProcessGraph, error) {
	normalized, err := NormalizeProcessGraph(graph)
	if err != nil {
		return ProcessGraph{}, err
	}
	for i := range normalized.Nodes {
		if normalized.Nodes[i].Kind == ProcessNodeStep && normalized.Nodes[i].Status == "" {
			normalized.Nodes[i].Status = ProcessStepPending
		}
	}
	return normalized, nil
}

// StripProcessState returns a deep copy of the graph without per-order state.
func StripProcessState(graph ProcessGraph) ProcessGraph {
	out := CloneProcessGraph(graph)
	for i := range out.Nodes {
		out.Nodes[i].Status = ""
		out.Nodes[i].ActualQuantity = nil
	}
	return out
}

// InstantiateProcessGraph copies a template graph for a work order: state is
// cleared and every step starts "pending".
func InstantiateProcessGraph(graph ProcessGraph) ProcessGraph {
	out := StripProcessState(graph)
	for i := range out.Nodes {
		if out.Nodes[i].Kind == ProcessNodeStep {
			out.Nodes[i].Status = ProcessStepPending
		}
	}
	return out
}

// CloneProcessGraph deep-copies a graph; nil slices become empty ones.
func CloneProcessGraph(graph ProcessGraph) ProcessGraph {
	out := ProcessGraph{
		Nodes: make([]ProcessNode, len(graph.Nodes)),
		Edges: make([]ProcessEdge, len(graph.Edges)),
	}
	for i, node := range graph.Nodes {
		node.Quantity = copyFloat(node.Quantity)
		node.ActualQuantity = copyFloat(node.ActualQuantity)
		out.Nodes[i] = node
	}
	copy(out.Edges, graph.Edges)
	return out
}

// ProcessStructureChanged reports whether next differs from current in more
// than per-order state and layout. Status, actualQuantity, note and the x/y
// position may change freely; the node set, kind, label, quantity, unit,
// catalogItemId and the edge set (including labels) may not. Both graphs
// should already be normalized.
func ProcessStructureChanged(current, next ProcessGraph) bool {
	if len(current.Nodes) != len(next.Nodes) || len(current.Edges) != len(next.Edges) {
		return true
	}
	nodes := make(map[string]ProcessNode, len(current.Nodes))
	for _, node := range current.Nodes {
		nodes[node.ID] = node
	}
	for _, node := range next.Nodes {
		old, ok := nodes[node.ID]
		if !ok || old.Kind != node.Kind || old.Label != node.Label || old.Unit != node.Unit ||
			old.CatalogItemID != node.CatalogItemID || !sameFloat(old.Quantity, node.Quantity) {
			return true
		}
	}
	edges := make(map[string]ProcessEdge, len(current.Edges))
	for _, edge := range current.Edges {
		edges[edge.ID] = edge
	}
	for _, edge := range next.Edges {
		if old, ok := edges[edge.ID]; !ok || old != edge {
			return true
		}
	}
	return false
}

func sameFloat(a, b *float64) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}
