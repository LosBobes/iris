package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/api"
	"github.com/LosBobes/iris/iris-api/internal/reports"
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

	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	dbPath, explicitDBPath := databasePathFromEnv(env)
	if env == "production" && databaseURL == "" && !explicitDBPath {
		log.Fatal("DATABASE_URL (postgres) or DATABASE_PATH (sqlite) is required in production")
	}
	// IRIS_SESSION_SECRET is not used: session tokens are random and stored
	// hashed, so nothing is signed with it. Older deployments still set it,
	// which is harmless; it is accepted and ignored.

	var persistence store.Store
	dataStore, err := openStore(ctx, databaseURL, dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer dataStore.Close()
	if env == "production" {
		hasDemoAdmin, err := dataStore.HasUserPassword(ctx, "admin", "admin123")
		if err != nil {
			log.Fatal(err)
		}
		if hasDemoAdmin {
			log.Fatal("refusing production startup with demo admin credentials")
		}
	}
	persistence = dataStore

	server := api.NewServer(persistence, api.Config{
		AllowedOrigins:    splitCSV(os.Getenv("IRIS_ALLOWED_ORIGINS")),
		SessionCookieName: "iris_session",
		SecureCookies:     env == "production",
		Production:        env == "production",
		WebDir:            os.Getenv("IRIS_WEB_DIR"),
		Release:           os.Getenv("IRIS_RELEASE"),
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

	// PDF printing shells out to headless Chrome. Say so at startup: a missing
	// browser is a deployment fault (the image forgot to install one), and this
	// turns it into one line in the logs instead of a 5xx on the first print.
	if err := reports.CheckBrowserAvailable(); err != nil {
		log.Printf("warning: PDF printing is unavailable: %v", err)
	}

	log.Printf("iris-api listening on %s", addr)
	// Serve until SIGINT/SIGTERM (docker stop sends SIGTERM), then drain in-flight
	// requests and fall through to the deferred store Close so SQLite checkpoints
	// its WAL instead of being killed mid-write.
	stop, cancelSignals := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer cancelSignals()

	serveErr := make(chan error, 1)
	go func() { serveErr <- httpServer.ListenAndServe() }()

	select {
	case err := <-serveErr:
		// ListenAndServe only returns on failure here (e.g. the port is taken).
		log.Printf("server stopped: %v", err)
		dataStore.Close()
		os.Exit(1)
	case <-stop.Done():
	}

	log.Printf("shutting down")
	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelShutdown()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown: %v", err)
	}
}

// openStore picks the storage engine. DATABASE_URL selects Postgres and wins
// when both are set; otherwise the SQLite file at dbPath is used. Both return
// the same store type, so nothing downstream depends on the choice.
func openStore(ctx context.Context, databaseURL string, dbPath string) (*store.SQLStore, error) {
	if databaseURL != "" {
		log.Printf("using postgres storage")
		return store.OpenPostgres(ctx, databaseURL)
	}
	log.Printf("using sqlite storage at %s", dbPath)
	return store.OpenSQLite(ctx, dbPath)
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
