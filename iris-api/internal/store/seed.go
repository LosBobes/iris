package store

import (
	"context"
	"fmt"
)

func SeedDemoFromFixtures(ctx context.Context, sqliteStore *SQLiteStore, fixtureDir string) error {
	// Demo data lives in its own tenant so it never mixes with real orgs. Ensure
	// the tenant exists and scope every write below to it.
	if err := sqliteStore.EnsureTenant(ctx, DemoTenantID, DemoTenantSlug, DemoTenantName); err != nil {
		return err
	}
	ctx = ContextWithTenant(ctx, DemoTenantID)

	fixtures := NewFixtureStore(fixtureDir)

	users, err := fixtures.Users(ctx)
	if err != nil {
		return err
	}
	for _, user := range users {
		if err := sqliteStore.CreateUser(ctx, user.ID, user.Username, user.Password, user.Role, true); err != nil {
			return fmt.Errorf("seed user %s: %w", user.Username, err)
		}
	}

	customers, err := fixtures.Customers(ctx, CustomerQuery{})
	if err != nil {
		return err
	}
	for _, customer := range customers.Items {
		if _, err := sqliteStore.UpsertCustomer(ctx, customer); err != nil {
			return fmt.Errorf("seed customer %s: %w", customer.ID, err)
		}
	}

	locations, err := fixtures.Locations(ctx, "")
	if err != nil {
		return err
	}
	for _, location := range locations {
		if _, err := sqliteStore.UpsertLocation(ctx, location); err != nil {
			return fmt.Errorf("seed location %s: %w", location.ID, err)
		}
	}

	workOrders, err := fixtures.WorkOrders(ctx, WorkOrderListQuery{})
	if err != nil {
		return err
	}
	for _, workOrder := range workOrders.Items {
		if err := sqliteStore.PutWorkOrder(ctx, workOrder); err != nil {
			return fmt.Errorf("seed work order %s: %w", workOrder.ID, err)
		}
	}
	return nil
}
