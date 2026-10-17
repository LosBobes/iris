package main

import (
	"context"
	"log"
	"os"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/store"
)

// seedShowcaseOnStart creates the showcase organization the first time the
// server starts with IRIS_SEED_SHOWCASE=1. Later starts find it and leave it
// alone, so leaving the flag on is safe. In production the two logins need
// their own passwords (IRIS_SHOWCASE_ADMIN_PASSWORD and
// IRIS_SHOWCASE_OPERATOR_PASSWORD); without them the seed is skipped with a
// warning rather than stopping the server.
func seedShowcaseOnStart(ctx context.Context, sqliteStore *store.SQLiteStore, env string) {
	if !envFlag("IRIS_SEED_SHOWCASE") {
		return
	}
	adminPassword, operatorPassword, err := store.ShowcasePasswords(
		env == "production",
		os.Getenv("IRIS_SHOWCASE_ADMIN_PASSWORD"),
		os.Getenv("IRIS_SHOWCASE_OPERATOR_PASSWORD"),
	)
	if err != nil {
		log.Printf("warning: showcase organization not seeded: %v", err)
		return
	}
	result, err := store.SeedShowcase(ctx, sqliteStore, store.ShowcaseOptions{
		Slug:             os.Getenv("IRIS_SHOWCASE_SLUG"),
		AdminPassword:    adminPassword,
		OperatorPassword: operatorPassword,
	})
	if err != nil {
		log.Printf("warning: showcase organization not seeded: %v", err)
		return
	}
	if result.Created {
		log.Printf("showcase organization %q seeded at /login/%s", result.Name, result.Slug)
	}
}

// envFlag reports whether an environment variable is set to a true value.
func envFlag(name string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(name))) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}
