package main

import (
	"log"
	"net/http"
	"os"

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
	// The fixture store reads JSON files shared with the desktop app.
	fixtureStore := store.NewFixtureStore("../apps/desktop/fixtures")
	// The API server depends on that store for all request data.
	server := api.NewServer(fixtureStore)

	addr := os.Getenv("IRIS_API_ADDR")
	if addr == "" {
		addr = ":8080"
	}

	log.Printf("iris-api listening on %s", addr)
	if err := http.ListenAndServe(addr, server.Routes()); err != nil {
		log.Fatal(err)
	}
}
