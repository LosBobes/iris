package store

import (
	"context"
	"fmt"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
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
//
// adminPassword and operatorPassword override the logins' passwords when set:
// adminPassword replaces the fixture admin's password, operatorPassword replaces
// every non-admin login's (the fixture operators and the content operater).
// Empty keeps the public demo passwords. Resolve them with DemoPasswords so a
// production server never gets the demo admin/admin123 login it refuses to start
// with.
//
// idPrefix, when set, is prepended to every fixture record id (users, customers,
// locations, work orders) and the ids they reference. The fixture ids are fixed
// values (cust-1, loc-1, work order "1", …) and record ids are globally unique,
// so without a prefix they collide when another tenant in the same database was
// seeded from the same id space (e.g. the real Grafika Čobanović data, whose
// customers are also cust-N). A prefix such as "demo-" namespaces them so the
// demo organization can coexist. The content half (seedDemoContent) already uses
// its own cust-demo-*/cat-demo-* ids and is unaffected.
func SeedDemoFromFixtures(ctx context.Context, sqliteStore *SQLiteStore, fixtureDir, adminPassword, operatorPassword, idPrefix string) (DemoSeedResult, error) {
	if err := sqliteStore.EnsureTenant(ctx, DemoTenantID, DemoTenantSlug, DemoTenantName); err != nil {
		return DemoSeedResult{}, err
	}
	ctx = ContextWithTenant(ctx, DemoTenantID)

	if err := seedDemoFixtures(ctx, sqliteStore, fixtureDir, adminPassword, operatorPassword, idPrefix); err != nil {
		return DemoSeedResult{}, err
	}
	return seedDemoContent(ctx, sqliteStore, DemoTenantSlug, operatorPassword, time.Time{})
}

// seedDemoFixtures loads the fixture users, customers, locations and work orders
// into the demo tenant (already in ctx). Work orders are written directly, so
// they carry their fixture order numbers and get no process. The password and
// id-prefix overrides follow SeedDemoFromFixtures.
func seedDemoFixtures(ctx context.Context, sqliteStore *SQLiteStore, fixtureDir, adminPassword, operatorPassword, idPrefix string) error {
	fixtures := NewFixtureStore(fixtureDir)
	pfx := func(id string) string {
		if idPrefix == "" || id == "" {
			return id
		}
		return idPrefix + id
	}

	users, err := fixtures.Users(ctx)
	if err != nil {
		return err
	}
	for _, user := range users {
		password := user.Password
		if user.Role == domain.RoleAdmin {
			if adminPassword != "" {
				password = adminPassword
			}
		} else if operatorPassword != "" {
			password = operatorPassword
		}
		if err := sqliteStore.CreateUser(ctx, pfx(user.ID), user.Username, password, user.Role, true); err != nil {
			return fmt.Errorf("seed user %s: %w", user.Username, err)
		}
	}

	customers, err := fixtures.Customers(ctx, CustomerQuery{})
	if err != nil {
		return err
	}
	for _, customer := range customers.Items {
		customer.ID = pfx(customer.ID)
		if _, err := sqliteStore.UpsertCustomer(ctx, customer); err != nil {
			return fmt.Errorf("seed customer %s: %w", customer.ID, err)
		}
	}

	locations, err := fixtures.Locations(ctx, "")
	if err != nil {
		return err
	}
	for _, location := range locations {
		location.ID = pfx(location.ID)
		location.CustomerID = pfx(location.CustomerID)
		if _, err := sqliteStore.UpsertLocation(ctx, location); err != nil {
			return fmt.Errorf("seed location %s: %w", location.ID, err)
		}
	}

	workOrders, err := fixtures.WorkOrders(ctx, WorkOrderListQuery{})
	if err != nil {
		return err
	}
	for _, workOrder := range workOrders.Items {
		workOrder.ID = pfx(workOrder.ID)
		if workOrder.CustomerID != nil {
			ref := pfx(*workOrder.CustomerID)
			workOrder.CustomerID = &ref
		}
		if workOrder.LocationID != nil {
			ref := pfx(*workOrder.LocationID)
			workOrder.LocationID = &ref
		}
		if err := sqliteStore.PutWorkOrder(ctx, workOrder); err != nil {
			return fmt.Errorf("seed work order %s: %w", workOrder.ID, err)
		}
	}
	return nil
}
