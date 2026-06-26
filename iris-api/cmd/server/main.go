package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/api"
	"github.com/LosBobes/iris/iris-api/internal/store"
	"github.com/getsentry/sentry-go"
)

const defaultDatabasePath = "./data/iris.db"

// Start here if you are new to this API.
//
// This file is intentionally small because its only job is application wiring:
// 1. create the data store
// 2. create the HTTP server
// 3. choose the listen address
// 4. start listening
//
// The request logic itself lives in internal/api/server.go.
func main() {
	ctx := context.Background()
	env := getenv("IRIS_ENV", "development")

	// Error reporting is optional: Sentry is only initialized when SENTRY_DSN
	// is set, so local/dev runs without it stay silent. Flushing happens in
	// the HTTP middleware per request; the deferred Flush here covers any
	// events captured outside a request before the process exits.
	if dsn := strings.TrimSpace(os.Getenv("SENTRY_DSN")); dsn != "" {
		if err := sentry.Init(sentry.ClientOptions{
			Dsn:         dsn,
			Environment: env,
			Release:     os.Getenv("IRIS_RELEASE"),
		}); err != nil {
			log.Printf("sentry.Init: %s", err)
		} else {
			defer sentry.Flush(2 * time.Second)
			log.Printf("sentry error reporting enabled (environment=%s)", env)
		}
	}

	dbPath, explicitDBPath := databasePathFromEnv(env)
	sessionSecret := os.Getenv("IRIS_SESSION_SECRET")
	if env == "production" {
		if !explicitDBPath {
			log.Fatal("DATABASE_PATH is required in production")
		}
		if sessionSecret == "" {
			log.Fatal("IRIS_SESSION_SECRET is required in production")
		}
	}

	var persistence store.Store
	sqliteStore, err := store.OpenSQLite(ctx, dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer sqliteStore.Close()
	if env == "production" {
		hasDemoAdmin, err := sqliteStore.HasUserPassword(ctx, "admin", "admin123")
		if err != nil {
			log.Fatal(err)
		}
		if hasDemoAdmin {
			log.Fatal("refusing production startup with demo admin credentials")
		}
	}
	persistence = sqliteStore

	server := api.NewServer(persistence, api.Config{
		AllowedOrigins:    splitCSV(os.Getenv("IRIS_ALLOWED_ORIGINS")),
		SessionCookieName: "iris_session",
		SecureCookies:     env == "production",
		WebDir:            os.Getenv("IRIS_WEB_DIR"),
	})

	addr := os.Getenv("IRIS_API_ADDR")
	if addr == "" {
		addr = ":8080"
	}

	// Explicit timeouts so slow or stalled clients cannot hold connections
	// (and the single SQLite connection behind them) open indefinitely.
	httpServer := &http.Server{
		Addr:              addr,
		Handler:           server.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("iris-api listening on %s", addr)
	if err := httpServer.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func databasePathFromEnv(env string) (string, bool) {
	if value := strings.TrimSpace(os.Getenv("DATABASE_PATH")); value != "" {
		return value, true
	}
	if value := strings.TrimSpace(os.Getenv("IRIS_DB_PATH")); value != "" {
		return value, true
	}
	if env == "production" {
		return "", false
	}
	return defaultDatabasePath, false
}

func getenv(name string, fallback string) string {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}
	return value
}

func splitCSV(value string) []string {
	if value == "" {
		return nil
	}
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}
