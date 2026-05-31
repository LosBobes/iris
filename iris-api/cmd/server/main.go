package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/api"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

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
	dbPath := os.Getenv("IRIS_DB_PATH")
	sessionSecret := os.Getenv("IRIS_SESSION_SECRET")
	if env == "production" {
		if dbPath == "" {
			log.Fatal("IRIS_DB_PATH is required in production")
		}
		if sessionSecret == "" {
			log.Fatal("IRIS_SESSION_SECRET is required in production")
		}
	}

	var persistence store.Store
	if dbPath != "" {
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
	} else {
		if env == "production" {
			log.Fatal("production cannot run against fixture data")
		}
		persistence = store.NewFixtureStore("testdata/fixtures")
	}

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

	log.Printf("iris-api listening on %s", addr)
	if err := http.ListenAndServe(addr, server.Routes()); err != nil {
		log.Fatal(err)
	}
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
