package store

import (
	"context"
	"errors"
)

// Production tenant identity. The tenant isolation migration seeds this row and
// attributes every pre-existing record to it, so live production data keeps
// working after the single-tenant -> multi-tenant switch.
const (
	ProductionTenantID   = "tenant-cobanovic"
	ProductionTenantSlug = "grafika-cobanovic"
	ProductionTenantName = "Grafika Čobanović"
)

// Demo tenant identity. Non-production demo data (seed-demo) is attributed to
// this tenant so it stays isolated from any real organization.
const (
	DemoTenantID   = "tenant-demo"
	DemoTenantSlug = "demo"
	DemoTenantName = "Demo Štamparija"
)

// ErrNoTenant is returned when a tenant-scoped store method is called without a
// tenant in the context. It signals a wiring bug (a protected route that failed
// to attach the tenant) rather than a client error, and is deliberately loud so
// a missing scope never silently reads or writes across tenants.
var ErrNoTenant = errors.New("no tenant in context")

type tenantContextKey struct{}

// ContextWithTenant returns a child context carrying the tenant id that scopes
// every data query. The API layer sets this from the authenticated session.
func ContextWithTenant(ctx context.Context, tenantID string) context.Context {
	return context.WithValue(ctx, tenantContextKey{}, tenantID)
}

// tenantFromContext extracts the scoping tenant id, erroring if absent so a
// forgotten scope fails loudly instead of leaking data across tenants.
func tenantFromContext(ctx context.Context) (string, error) {
	tenantID, ok := ctx.Value(tenantContextKey{}).(string)
	if !ok || tenantID == "" {
		return "", ErrNoTenant
	}
	return tenantID, nil
}
