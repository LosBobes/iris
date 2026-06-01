package main

import "testing"

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
