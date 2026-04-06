package store

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// FixtureStore is the persistence layer for this starter API.
//
// Right now it reads JSON fixtures from disk. Later, the same public methods
// could be backed by a real database without changing the HTTP handlers.
type FixtureStore struct {
	basePath string
}

func NewFixtureStore(basePath string) *FixtureStore {
	return &FixtureStore{basePath: basePath}
}

// Users reads login fixture data.
func (s *FixtureStore) Users() ([]domain.FixtureUser, error) {
	var users []domain.FixtureUser
	if err := s.readJSON("users.json", &users); err != nil {
		return nil, err
	}
	return users, nil
}

// WorkOrders reads the full work-order fixture set.
func (s *FixtureStore) WorkOrders() ([]domain.WorkOrder, error) {
	var workOrders []domain.WorkOrder
	if err := s.readJSON("work-orders.json", &workOrders); err != nil {
		return nil, err
	}
	return workOrders, nil
}

// Operators derives a sorted, unique operator list from the work-order data.
func (s *FixtureStore) Operators() ([]string, error) {
	workOrders, err := s.WorkOrders()
	if err != nil {
		return nil, err
	}

	seen := make(map[string]struct{}, len(workOrders))
	operators := make([]string, 0, len(workOrders))
	for _, workOrder := range workOrders {
		if _, exists := seen[workOrder.IssuedBy]; exists {
			continue
		}
		seen[workOrder.IssuedBy] = struct{}{}
		operators = append(operators, workOrder.IssuedBy)
	}

	sort.Strings(operators)
	return operators, nil
}

// readJSON is the low-level helper that turns one fixture file into one Go
// value. The public methods above decide which concrete type is expected.
func (s *FixtureStore) readJSON(fileName string, target any) error {
	path := filepath.Join(s.basePath, fileName)
	contents, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read fixture %s: %w", fileName, err)
	}

	if err := json.Unmarshal(contents, target); err != nil {
		return fmt.Errorf("decode fixture %s: %w", fileName, err)
	}

	return nil
}
