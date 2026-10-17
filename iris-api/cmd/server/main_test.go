package main

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/store"
)

func TestDatabasePathFromEnvPrefersDatabasePath(t *testing.T) {
	t.Setenv("DATABASE_PATH", "/data/iris.db")
	t.Setenv("IRIS_DB_PATH", "/legacy/iris.db")

	path, explicit := databasePathFromEnv("development")

	if path != "/data/iris.db" || !explicit {
		t.Fatalf("databasePathFromEnv() = %q, %v; want /data/iris.db, true", path, explicit)
	}
}

func TestDatabasePathFromEnvFallsBackToLegacyIrisDBPath(t *testing.T) {
	t.Setenv("DATABASE_PATH", "")
	t.Setenv("IRIS_DB_PATH", "/legacy/iris.db")

	path, explicit := databasePathFromEnv("development")

	if path != "/legacy/iris.db" || !explicit {
		t.Fatalf("databasePathFromEnv() = %q, %v; want /legacy/iris.db, true", path, explicit)
	}
}

func TestDatabasePathFromEnvUsesLocalDefaultOutsideProduction(t *testing.T) {
	t.Setenv("DATABASE_PATH", "")
	t.Setenv("IRIS_DB_PATH", "")

	path, explicit := databasePathFromEnv("development")

	if path != "./data/iris.db" || explicit {
		t.Fatalf("databasePathFromEnv() = %q, %v; want ./data/iris.db, false", path, explicit)
	}
}

func TestDatabasePathFromEnvRequiresExplicitProductionPath(t *testing.T) {
	t.Setenv("DATABASE_PATH", "")
	t.Setenv("IRIS_DB_PATH", "")

	path, explicit := databasePathFromEnv("production")

	if path != "" || explicit {
		t.Fatalf("databasePathFromEnv() = %q, %v; want empty path, false", path, explicit)
	}
}

func TestSeedShowcaseOnStart(t *testing.T) {
	ctx := context.Background()
	s, err := store.OpenSQLite(ctx, filepath.Join(t.TempDir(), "iris.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	exists := func() bool {
		tenant, err := s.TenantBySlug(ctx, store.ShowcaseDefaultSlug)
		if err != nil {
			t.Fatal(err)
		}
		return tenant != nil
	}

	t.Setenv("IRIS_SEED_SHOWCASE", "")
	seedShowcaseOnStart(ctx, s, "production")
	if exists() {
		t.Fatal("seeded without IRIS_SEED_SHOWCASE")
	}

	t.Setenv("IRIS_SEED_SHOWCASE", "1")
	t.Setenv("IRIS_SHOWCASE_ADMIN_PASSWORD", "")
	t.Setenv("IRIS_SHOWCASE_OPERATOR_PASSWORD", "")
	seedShowcaseOnStart(ctx, s, "production")
	if exists() {
		t.Fatal("seeded in production without passwords")
	}

	t.Setenv("IRIS_SHOWCASE_ADMIN_PASSWORD", "admin-strong-pass")
	t.Setenv("IRIS_SHOWCASE_OPERATOR_PASSWORD", "operater-strong-pass")
	seedShowcaseOnStart(ctx, s, "production")
	if !exists() {
		t.Fatal("not seeded with passwords")
	}
	// A restart with the flag still on leaves the organization alone.
	seedShowcaseOnStart(ctx, s, "production")
	if !exists() {
		t.Fatal("organization lost on second start")
	}
}
