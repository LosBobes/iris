package api

import (
	"context"
	"net/http"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

func stepNode(graph domain.ProcessGraph, id string) domain.ProcessNode {
	for _, node := range graph.Nodes {
		if node.ID == id {
			return node
		}
	}
	return domain.ProcessNode{}
}

// Step status transitions record startedAt / finishedAt (D-028). The times are
// per-order state: an operator may send them with a status change, while a
// structural change in the same request is still rejected.
func TestProcessStepTimesRecordedAndOperatorMayWriteThem(t *testing.T) {
	f := newProcessFixture(t)
	template := f.createTemplate(t, "Offset", false)
	path := "/work-orders/" + f.orderID + "/process"
	code, body := f.do(t, f.operator, http.MethodPost, path, `{"templateId":"`+template.ID+`"}`)
	process := decodeProcess(t, code, http.StatusCreated, body)
	for _, node := range process.Graph.Nodes {
		if node.Kind == domain.ProcessNodeStep && (node.StartedAt != "" || node.FinishedAt != "") {
			t.Fatalf("fresh copy carries step times: %+v", node)
		}
	}
	if process.QuantitiesPerOrder {
		t.Fatalf("fresh copy flagged quantitiesPerOrder: %+v", process)
	}

	setStatus := func(graph domain.ProcessGraph, id string, status domain.ProcessStepStatus) domain.ProcessGraph {
		graph = domain.CloneProcessGraph(graph)
		for i := range graph.Nodes {
			if graph.Nodes[i].ID == id {
				graph.Nodes[i].Status = status
			}
		}
		return graph
	}

	// "Moj red" start: the server fills startedAt.
	code, body = f.do(t, f.operator, http.MethodPut, path, mustJSON(t, domain.WorkOrderProcessInput{Graph: setStatus(process.Graph, "cut", domain.ProcessStepInProgress)}))
	started := decodeProcess(t, code, http.StatusOK, body)
	if cut := stepNode(started.Graph, "cut"); cut.StartedAt == "" || cut.FinishedAt != "" {
		t.Fatalf("after start = %+v", cut)
	}
	// "Moj red" done: finishedAt follows, startedAt is kept.
	code, body = f.do(t, f.operator, http.MethodPut, path, mustJSON(t, domain.WorkOrderProcessInput{Graph: setStatus(started.Graph, "cut", domain.ProcessStepDone)}))
	done := decodeProcess(t, code, http.StatusOK, body)
	if cut := stepNode(done.Graph, "cut"); cut.StartedAt != stepNode(started.Graph, "cut").StartedAt || cut.FinishedAt < cut.StartedAt || cut.FinishedAt == "" {
		t.Fatalf("after done = %+v", cut)
	}

	// Operator sends an explicit startedAt with a status change: allowed, kept, normalized to UTC.
	explicit := setStatus(done.Graph, "print", domain.ProcessStepDone)
	for i := range explicit.Nodes {
		if explicit.Nodes[i].ID == "print" {
			explicit.Nodes[i].StartedAt = "2026-10-19T08:00:00+02:00"
		}
	}
	code, body = f.do(t, f.operator, http.MethodPut, path, mustJSON(t, domain.WorkOrderProcessInput{Graph: explicit}))
	withExplicit := decodeProcess(t, code, http.StatusOK, body)
	if print := stepNode(withExplicit.Graph, "print"); print.StartedAt != "2026-10-19T06:00:00Z" || print.FinishedAt == "" {
		t.Fatalf("explicit start = %+v", print)
	}

	// The same request plus a structural change is still 403 and persists nothing.
	structural := domain.CloneProcessGraph(explicit)
	structural.Nodes[1].Label = "Drugačiji naziv"
	code, body = f.do(t, f.operator, http.MethodPut, path, mustJSON(t, domain.WorkOrderProcessInput{Graph: structural}))
	if code != http.StatusForbidden {
		t.Fatalf("operator structural with times = %d %s, want 403", code, body)
	}

	// Validation: a bad timestamp and a finish before the start are 422.
	bad := domain.CloneProcessGraph(withExplicit.Graph)
	bad.Nodes[1].StartedAt = "danas"
	code, body = f.do(t, f.operator, http.MethodPut, path, mustJSON(t, domain.WorkOrderProcessInput{Graph: bad}))
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("bad time = %d %s", code, body)
	}
	assertErrorResponse(t, body, domain.StepTimeInvalidMessage)
	bad = domain.CloneProcessGraph(withExplicit.Graph)
	bad.Nodes[1].FinishedAt = "2026-10-19T05:00:00Z"
	code, body = f.do(t, f.operator, http.MethodPut, path, mustJSON(t, domain.WorkOrderProcessInput{Graph: bad}))
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("finish before start = %d %s", code, body)
	}
	assertErrorResponse(t, body, domain.StepTimeOrderMessage)

	// Back to pending clears both; an admin correction without a status change sticks.
	code, body = f.do(t, f.operator, http.MethodPut, path, mustJSON(t, domain.WorkOrderProcessInput{Graph: setStatus(withExplicit.Graph, "cut", domain.ProcessStepPending)}))
	reset := decodeProcess(t, code, http.StatusOK, body)
	if cut := stepNode(reset.Graph, "cut"); cut.StartedAt != "" || cut.FinishedAt != "" {
		t.Fatalf("after reset = %+v", cut)
	}
	corrected := domain.CloneProcessGraph(reset.Graph)
	for i := range corrected.Nodes {
		if corrected.Nodes[i].ID == "print" {
			corrected.Nodes[i].StartedAt, corrected.Nodes[i].FinishedAt = "2026-10-19T06:00:00Z", "2026-10-19T06:30:00Z"
		}
	}
	code, body = f.do(t, f.admin, http.MethodPut, path, mustJSON(t, domain.WorkOrderProcessInput{Graph: corrected}))
	if got := decodeProcess(t, code, http.StatusOK, body); stepNode(got.Graph, "print").FinishedAt != "2026-10-19T06:30:00Z" {
		t.Fatalf("admin correction = %+v", stepNode(got.Graph, "print"))
	}
}

// Item-node quantities are per unit: reservations and postings read through
// the API are multiplied by the order's jobDetails.quantity (D-028).
func TestProcessQuantitiesScaleByOrderQuantity(t *testing.T) {
	f := newProcessFixture(t)
	f.addArticle(t, "paper", "Papir", "tabak", nil)
	f.addArticle(t, "waste", "Makulatura", "tabak", nil)
	if code, body := f.do(t, f.admin, http.MethodPost, "/stock/counts", `{"lines":[`+countLine("paper", 100)+`]}`); code != http.StatusCreated {
		t.Fatalf("count = %d %s", code, body)
	}
	code, body := f.do(t, f.admin, http.MethodPost, "/process-templates", templateBody("Stok", false, stockTemplateGraph))
	template := decodeInto[domain.ProcessTemplate](t, code, http.StatusCreated, body)

	three := 3
	order, err := f.sqlite.CreateWorkOrder(store.ContextWithTenant(context.Background(), store.DemoTenantID), domain.CreateWorkOrderInput{
		ClientName: "Alfa", JobDescription: "Tri komada", IssuedBy: "admin", IssueDate: "2026-06-02",
		Assignment: domain.Assignment{Priority: "normal"}, JobDetails: &domain.JobDetails{Quantity: &three},
	})
	if err != nil {
		t.Fatal(err)
	}
	path := "/work-orders/" + order.ID + "/process"
	code, body = f.do(t, f.operator, http.MethodPost, path, `{"templateId":"`+template.ID+`"}`)
	process := decodeProcess(t, code, http.StatusCreated, body)
	if process.QuantitiesPerOrder {
		t.Fatalf("new copy flagged per order: %+v", process)
	}
	// The stored graph keeps the per-unit 10; the warehouse reserves 10 × 3.
	if paper := stepNode(process.Graph, "paper"); paper.Quantity == nil || *paper.Quantity != 10 {
		t.Fatalf("stored planned quantity = %+v", paper.Quantity)
	}
	levelFor := func(id string) domain.StockLevel {
		t.Helper()
		code, body := f.do(t, f.operator, http.MethodGet, "/stock", "")
		for _, level := range decodeInto[domain.StockLevelList](t, code, http.StatusOK, body).Items {
			if level.CatalogItemID == id {
				return level
			}
		}
		t.Fatalf("no level for %s", id)
		return domain.StockLevel{}
	}
	if paper := levelFor("paper"); paper.Reserved != 30 || paper.Available != 70 {
		t.Fatalf("paper reserved = %+v, want 30 / 70", paper)
	}

	for i := range process.Graph.Nodes {
		if process.Graph.Nodes[i].ID == "print" {
			process.Graph.Nodes[i].Status = domain.ProcessStepDone
		}
	}
	if code, body := f.do(t, f.operator, http.MethodPut, path, mustJSON(t, domain.WorkOrderProcessInput{Graph: process.Graph})); code != http.StatusOK {
		t.Fatalf("put = %d %s", code, body)
	}
	if paper := levelFor("paper"); paper.OnHand != 70 || paper.Reserved != 0 {
		t.Fatalf("paper after done = %+v, want 70 on hand", paper)
	}
	if waste := levelFor("waste"); waste.OnHand != 6 {
		t.Fatalf("waste after done = %+v, want 6 produced", waste)
	}
}
