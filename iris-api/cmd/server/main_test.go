package main

import (
	"testing"
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

func TestSecureCookiesFromEnv(t *testing.T) {
	cases := []struct {
		env, value string
		want       bool
	}{
		{"production", "", true},
		{"development", "", false},
		{"production", "false", false},
		{"production", " OFF ", false},
		{"production", "0", false},
		{"development", "true", true},
		{"production", "garbage", true},
		{"development", "garbage", false},
	}
	for _, c := range cases {
		t.Setenv("IRIS_SECURE_COOKIES", c.value)
		if got := secureCookiesFromEnv(c.env); got != c.want {
			t.Errorf("secureCookiesFromEnv(%q) with IRIS_SECURE_COOKIES=%q = %v; want %v", c.env, c.value, got, c.want)
		}
	}
}
