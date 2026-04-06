package main

import (
	"log"
	"net/http"
	"os"

	"github.com/LosBobes/iris/iris-api/internal/api"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

func main() {
	fixtureStore := store.NewFixtureStore("../apps/desktop/fixtures")
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