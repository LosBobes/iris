package store

import (
	"context"
	"fmt"
	"time"
)

// SeedDemoFromFixtures populates the single demo organization. It runs in two
// halves against one tenant:
//
//  1. the fixture data set (users, customers, locations, work orders) loaded
//     from testdata/fixtures — plain work orders with no process, as the modules
//     are still off at this point; and
//  2. the process- and stock-driven content (seedDemoContent): both optional
//     modules turned on, a curated catalog with warehouse stock, four process
//     templates and eight process-driven work orders.
//
// Everything lives in its own tenant so it never mixes with real organizations.
// Article codes and order numbers are unique per tenant, so the fixtures are
// seeded first and the content orders take the next free RN-<year>-<seq>
// numbers after them. The result describes the content half for the CLI summary.
func SeedDemoFromFixtures(ctx context.Context, sqliteStore *SQLiteStore, fixtureDir string) (DemoSeedResult, error) {
	if err := sqliteStore.EnsureTenant(ctx, DemoTenantID, DemoTenantSlug, DemoTenantName); err != nil {
		return DemoSeedResult{}, err
	}
	ctx = ContextWithTenant(ctx, DemoTenantID)

	if err := seedDemoFixtures(ctx, sqliteStore, fixtureDir); err != nil {
		return DemoSeedResult{}, err
	}
	return seedDemoContent(ctx, sqliteStore, DemoTenantSlug, time.Time{})
}

// seedDemoFixtures loads the fixture users, customers, locations and work orders
// into the demo tenant (already in ctx). Work orders are written directly, so
// they carry their fixture order numbers and get no process.
func seedDemoFixtures(ctx context.Context, sqliteStore *SQLiteStore, fixtureDir string) error {
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
