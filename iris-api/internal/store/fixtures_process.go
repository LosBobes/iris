package store

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// In-memory process templates and work-order processes for the fixture store.
// Fixtures model a single shop, so nothing here is tenant-partitioned.

func cloneProcessTemplate(template domain.ProcessTemplate) domain.ProcessTemplate {
	template.Graph = domain.CloneProcessGraph(template.Graph)
	return template
}

func cloneWorkOrderProcess(process domain.WorkOrderProcess) *domain.WorkOrderProcess {
	process.Graph = domain.CloneProcessGraph(process.Graph)
	if process.TemplateID != nil {
		id := *process.TemplateID
		process.TemplateID = &id
	}
	return &process
}

func (s *FixtureStore) processTemplateIndexLocked(id string) int {
	for i, template := range s.processTemplates {
		if template.ID == id {
			return i
		}
	}
	return -1
}

func (s *FixtureStore) processNameTakenLocked(name, exceptID string) bool {
	for _, template := range s.processTemplates {
		if template.ID != exceptID && template.Name == name {
			return true
		}
	}
	return false
}

func (s *FixtureStore) clearOtherDefaultsLocked(keepID string) {
	for i := range s.processTemplates {
		if s.processTemplates[i].ID != keepID {
			s.processTemplates[i].IsDefault = false
		}
	}
}

func (s *FixtureStore) attachDefaultProcessLocked(workOrderID, username, now string) {
	if !s.modules.Processes {
		return
	}
	for _, template := range s.processTemplates {
		if template.IsDefault {
			s.setWorkOrderProcessLocked(workOrderID, template, username, now)
			return
		}
	}
}

func (s *FixtureStore) setWorkOrderProcessLocked(workOrderID string, template domain.ProcessTemplate, username, now string) *domain.WorkOrderProcess {
	if s.workOrderProcesses == nil {
		s.workOrderProcesses = make(map[string]domain.WorkOrderProcess)
	}
	templateID := template.ID
	process := domain.WorkOrderProcess{
		WorkOrderID:  workOrderID,
		TemplateID:   &templateID,
		TemplateName: template.Name,
		Graph:        domain.InstantiateProcessGraph(template.Graph),
		UpdatedAt:    now,
		UpdatedBy:    username,
	}
	s.workOrderProcesses[workOrderID] = process
	if s.stockTracked == nil {
		s.stockTracked = make(map[string]bool)
	}
	s.stockTracked[workOrderID] = s.modules.Stock
	return cloneWorkOrderProcess(process)
}

func (s *FixtureStore) ProcessTemplates(_ context.Context) ([]domain.ProcessTemplate, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	templates := make([]domain.ProcessTemplate, 0, len(s.processTemplates))
	for _, template := range s.processTemplates {
		templates = append(templates, cloneProcessTemplate(template))
	}
	sort.SliceStable(templates, func(i, j int) bool {
		if templates[i].IsDefault != templates[j].IsDefault {
			return templates[i].IsDefault
		}
		return strings.ToLower(templates[i].Name) < strings.ToLower(templates[j].Name)
	})
	return templates, nil
}

func (s *FixtureStore) ProcessTemplateByID(_ context.Context, id string) (*domain.ProcessTemplate, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if i := s.processTemplateIndexLocked(id); i >= 0 {
		template := cloneProcessTemplate(s.processTemplates[i])
		return &template, nil
	}
	return nil, nil
}

func (s *FixtureStore) CreateProcessTemplate(_ context.Context, input domain.ProcessTemplateInput) (*domain.ProcessTemplate, error) {
	prepared, err := prepareProcessTemplateInput(input)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if prepared.graph, err = s.resolveGraphLinksLocked(prepared.graph, nil); err != nil {
		return nil, err
	}
	if s.processNameTakenLocked(prepared.name, "") {
		return nil, newValidationError(duplicateProcessTemplateMessage)
	}
	s.nextProcessSequence++
	now := time.Now().UTC().Format(time.RFC3339)
	template := domain.ProcessTemplate{
		ID:          fmt.Sprintf("proc-%d", s.nextProcessSequence),
		Name:        prepared.name,
		Description: prepared.description,
		IsDefault:   prepared.isDefault,
		Graph:       prepared.graph,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if template.IsDefault {
		s.clearOtherDefaultsLocked(template.ID)
	}
	s.processTemplates = append(s.processTemplates, template)
	created := cloneProcessTemplate(template)
	return &created, nil
}

func (s *FixtureStore) UpdateProcessTemplate(_ context.Context, id string, input domain.ProcessTemplateInput) (*domain.ProcessTemplate, error) {
	prepared, err := prepareProcessTemplateInput(input)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	i := s.processTemplateIndexLocked(id)
	if i < 0 {
		return nil, ErrProcessTemplateNotFound
	}
	if prepared.graph, err = s.resolveGraphLinksLocked(prepared.graph, existingLinkSkip(s.processTemplates[i].Graph)); err != nil {
		return nil, err
	}
	if s.processNameTakenLocked(prepared.name, id) {
		return nil, newValidationError(duplicateProcessTemplateMessage)
	}
	if prepared.isDefault {
		s.clearOtherDefaultsLocked(id)
	}
	template := &s.processTemplates[i]
	template.Name, template.Description, template.IsDefault = prepared.name, prepared.description, prepared.isDefault
	template.Graph = prepared.graph
	template.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	updated := cloneProcessTemplate(*template)
	return &updated, nil
}

func (s *FixtureStore) DeleteProcessTemplate(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	i := s.processTemplateIndexLocked(id)
	if i < 0 {
		return ErrProcessTemplateNotFound
	}
	s.processTemplates = append(s.processTemplates[:i], s.processTemplates[i+1:]...)
	for workOrderID, process := range s.workOrderProcesses {
		if process.TemplateID != nil && *process.TemplateID == id {
			process.TemplateID = nil
			s.workOrderProcesses[workOrderID] = process
		}
	}
	return nil
}

func (s *FixtureStore) WorkOrderProcess(_ context.Context, workOrderID string) (*domain.WorkOrderProcess, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if process, ok := s.workOrderProcesses[workOrderID]; ok {
		return cloneWorkOrderProcess(process), nil
	}
	return nil, nil
}

func (s *FixtureStore) ApplyProcessTemplate(_ context.Context, workOrderID, templateID, username string) (*domain.WorkOrderProcess, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ensureWorkOrdersLoaded(); err != nil {
		return nil, err
	}
	found := false
	for _, workOrder := range s.workOrders {
		if workOrder.ID == workOrderID {
			found = true
			break
		}
	}
	if !found {
		return nil, ErrWorkOrderNotFound
	}
	i := s.processTemplateIndexLocked(templateID)
	if i < 0 {
		return nil, ErrProcessTemplateNotFound
	}
	if _, exists := s.workOrderProcesses[workOrderID]; exists {
		return nil, ErrProcessExists
	}
	now := time.Now().UTC().Format(time.RFC3339)
	process := s.setWorkOrderProcessLocked(workOrderID, s.processTemplates[i], username, now)
	if s.modules.Stock {
		s.postWorkOrderStockLocked(workOrderID, process.Graph, username, now)
	}
	return process, nil
}

func (s *FixtureStore) UpdateWorkOrderProcess(_ context.Context, workOrderID string, graph domain.ProcessGraph, username string, allowStructural bool) (*domain.WorkOrderProcess, error) {
	next, err := domain.PrepareWorkOrderGraph(graph)
	if err != nil {
		return nil, graphValidationError(err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	current, ok := s.workOrderProcesses[workOrderID]
	if !ok {
		return nil, nil
	}
	if !allowStructural && domain.ProcessStructureChanged(current.Graph, next) {
		return nil, ErrProcessStructureLocked
	}
	if next, err = s.resolveGraphLinksLocked(next, existingLinkSkip(current.Graph)); err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	current.Graph, current.UpdatedAt, current.UpdatedBy = next, now, username
	s.workOrderProcesses[workOrderID] = current
	if s.modules.Stock && s.stockTracked[workOrderID] {
		s.postWorkOrderStockLocked(workOrderID, next, username, now)
	}
	return cloneWorkOrderProcess(current), nil
}

func (s *FixtureStore) DeleteWorkOrderProcess(_ context.Context, workOrderID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.workOrderProcesses[workOrderID]; !ok {
		return ErrProcessNotFound
	}
	delete(s.workOrderProcesses, workOrderID)
	delete(s.stockTracked, workOrderID)
	return nil
}
