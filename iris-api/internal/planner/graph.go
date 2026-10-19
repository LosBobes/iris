package planner

import (
	"sort"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// graphIndex answers reachability questions over a process graph.
type graphIndex struct {
	nodes    map[string]domain.ProcessNode
	incoming map[string][]string
	outgoing map[string][]string
	stepIDs  []string
}

func indexGraph(g domain.ProcessGraph) *graphIndex {
	gi := &graphIndex{
		nodes:    make(map[string]domain.ProcessNode, len(g.Nodes)),
		incoming: map[string][]string{},
		outgoing: map[string][]string{},
	}
	for _, n := range g.Nodes {
		gi.nodes[n.ID] = n
	}
	for _, e := range g.Edges {
		gi.incoming[e.Target] = append(gi.incoming[e.Target], e.Source)
		gi.outgoing[e.Source] = append(gi.outgoing[e.Source], e.Target)
	}
	for id, n := range gi.nodes {
		if n.Kind == domain.ProcessNodeStep {
			gi.stepIDs = append(gi.stepIDs, id)
		}
	}
	sort.Strings(gi.stepIDs)
	return gi
}

// ancestors is every step reachable backwards from id, also through item
// nodes and other steps (the web's predecessorSteps), sorted by id.
func (gi *graphIndex) ancestors(id string) []string {
	seen := map[string]bool{id: true}
	stack := append([]string(nil), gi.incoming[id]...)
	var steps []string
	for len(stack) > 0 {
		cur := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if seen[cur] {
			continue
		}
		seen[cur] = true
		if n, ok := gi.nodes[cur]; ok && n.Kind == domain.ProcessNodeStep {
			steps = append(steps, cur)
		}
		stack = append(stack, gi.incoming[cur]...)
	}
	sort.Strings(steps)
	return steps
}

// successors are the steps directly after id, looking through item nodes.
func (gi *graphIndex) successors(id string) []string {
	seen := map[string]bool{id: true}
	stack := append([]string(nil), gi.outgoing[id]...)
	var steps []string
	for len(stack) > 0 {
		cur := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if seen[cur] {
			continue
		}
		seen[cur] = true
		n, ok := gi.nodes[cur]
		if !ok {
			continue
		}
		if n.Kind == domain.ProcessNodeStep {
			steps = append(steps, cur)
			continue
		}
		stack = append(stack, gi.outgoing[cur]...)
	}
	sort.Strings(steps)
	return steps
}
