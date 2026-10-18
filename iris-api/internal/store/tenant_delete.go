package store

import (
	"context"
	"fmt"
	"strings"
)

// DeleteTenant removes the organization with that slug and everything it owns.
// Every tenant-owned table references tenants(id) ON DELETE CASCADE (users and
// their sessions, customers, locations, work orders and their children,
// catalog, settings, process templates, work-order processes, stock movements,
// login/impersonation events); platform audit rows keep their history with the
// tenant reference nulled. It reports whether an organization was deleted. A
// store-level helper for operator tooling and the cascade test, not exposed over
// HTTP.
func (s *SQLiteStore) DeleteTenant(ctx context.Context, slug string) (bool, error) {
	slug = strings.ToLower(strings.TrimSpace(slug))
	if slug == "" {
		return false, newValidationError("Oznaka organizacije je obavezna.")
	}
	result, err := s.db.ExecContext(ctx, `DELETE FROM tenants WHERE slug = ?`, slug)
	if err != nil {
		return false, fmt.Errorf("delete tenant: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("delete tenant: %w", err)
	}
	return affected > 0, nil
}
