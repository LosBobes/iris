package store

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

type FixtureStore struct {
	basePath string
}

func NewFixtureStore(basePath string) *FixtureStore {
	return &FixtureStore{basePath: basePath}
}

func (s *FixtureStore) Users() ([]domain.FixtureUser, error) {
	var users []domain.FixtureUser
	if err := s.readJSON("users.json", &users); err != nil {
		return nil, err
	}
	return users, nil
}

func (s *FixtureStore) WorkOrders() ([]domain.WorkOrder, error) {
	var workOrders []domain.WorkOrder
	if err := s.readJSON("work-orders.json", &workOrders); err != nil {
		return nil, err
	}
	return workOrders, nil
}

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