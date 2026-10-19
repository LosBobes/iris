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
//  1. the fixture logins and master data (users, customers, locations) loaded
//     from testdata/fixtures — the fixture work orders are test data and are
//     not loaded, so every order in the demo is dated relative to the seed run
//     and showcases a feature; and
//  2. the demo content (seedDemoContent): all optional modules turned on,
//     settings and custom picklist values, a sign-in logo, a curated catalog
//     with warehouse stock and a scheduled price change, machines and worker
//     qualifications, five process templates, a year of invoiced history,
//     live process-driven work orders in every status, attendance and sign-in
//     history, published and draft day plans, and a welcome announcement.
//
// Everything lives in its own tenant so it never mixes with real organizations.
// The result describes the content half for the CLI summary.
//
// adminPassword and operatorPassword override the logins' passwords when set:
// adminPassword replaces the fixture admin's password, operatorPassword replaces
// every non-admin login's (the fixture operators and the content operater).
// Empty keeps the public demo passwords. Resolve them with DemoPasswords so a
// production server never gets the demo admin/admin123 login it refuses to start
// with.
//
// idPrefix, when set, is prepended to every fixture record id (users, customers,
// locations) and the ids they reference. The fixture ids are fixed values
// (cust-1, loc-1, …) and record ids are globally unique, so without a prefix
// they collide when another tenant in the same database was seeded from the
// same id space (e.g. the real Grafika Čobanović data, whose customers are also
// cust-N). A prefix such as "demo-" namespaces them so the demo organization can
// coexist. The content half (seedDemoContent) already uses its own
// cust-demo-*/cat-demo-*/demo-h-* ids and is unaffected.
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

// seedDemoFixtures loads the fixture users, customers and locations into the
// demo tenant (already in ctx). It is upsert-based and safe to re-run. The
// password and id-prefix overrides follow SeedDemoFromFixtures.
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
	return nil
}
