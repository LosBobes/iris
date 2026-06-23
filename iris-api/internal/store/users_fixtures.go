package store

import (
	"context"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// ListUsers returns all in-memory accounts (id, username, role).
func (s *FixtureStore) ListUsers(_ context.Context) ([]domain.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ensureUsersLoadedLocked(); err != nil {
		return nil, err
	}
	users := make([]domain.User, 0, len(s.fixtureUsers))
	for _, user := range s.fixtureUsers {
		users = append(users, domain.User{ID: user.ID, Username: user.Username, Role: user.Role})
	}
	return users, nil
}

// UserByID returns a single account or nil when missing.
func (s *FixtureStore) UserByID(_ context.Context, id string) (*domain.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ensureUsersLoadedLocked(); err != nil {
		return nil, err
	}
	for _, user := range s.fixtureUsers {
		if user.ID == id {
			return &domain.User{ID: user.ID, Username: user.Username, Role: user.Role}, nil
		}
	}
	return nil, nil
}

// CreateUserAccount adds an account to the in-memory store (plaintext password,
// as the fixture store authenticates by direct comparison).
func (s *FixtureStore) CreateUserAccount(
	_ context.Context,
	input domain.CreateUserInput,
) (*domain.User, error) {
	username := strings.TrimSpace(input.Username)
	if username == "" {
		return nil, newValidationError("Korisničko ime je obavezno.")
	}
	if err := validateUserRole(input.Role); err != nil {
		return nil, err
	}
	if err := validateUserPassword(input.Password); err != nil {
		return nil, err
	}
	id, err := newUserID()
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ensureUsersLoadedLocked(); err != nil {
		return nil, err
	}
	for _, user := range s.fixtureUsers {
		if strings.EqualFold(user.Username, username) {
			return nil, newValidationError("Korisničko ime već postoji.")
		}
	}
	created := domain.FixtureUser{
		User:     domain.User{ID: id, Username: username, Role: input.Role},
		Password: input.Password,
	}
	s.fixtureUsers = append(s.fixtureUsers, created)
	return &created.User, nil
}

// UpdateUserAccount changes a user's role and optionally resets the password.
func (s *FixtureStore) UpdateUserAccount(
	_ context.Context,
	id string,
	input domain.UpdateUserInput,
) (*domain.User, error) {
	if err := validateUserRole(input.Role); err != nil {
		return nil, err
	}
	if strings.TrimSpace(input.Password) != "" {
		if err := validateUserPassword(input.Password); err != nil {
			return nil, err
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ensureUsersLoadedLocked(); err != nil {
		return nil, err
	}
	for index, user := range s.fixtureUsers {
		if user.ID != id {
			continue
		}
		user.Role = input.Role
		if strings.TrimSpace(input.Password) != "" {
			user.Password = input.Password
		}
		s.fixtureUsers[index] = user
		return &domain.User{ID: user.ID, Username: user.Username, Role: user.Role}, nil
	}
	return nil, nil
}

// DeleteUser removes an account by id from the in-memory store.
func (s *FixtureStore) DeleteUser(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ensureUsersLoadedLocked(); err != nil {
		return err
	}
	remaining := make([]domain.FixtureUser, 0, len(s.fixtureUsers))
	for _, user := range s.fixtureUsers {
		if user.ID != id {
			remaining = append(remaining, user)
		}
	}
	s.fixtureUsers = remaining
	return nil
}
