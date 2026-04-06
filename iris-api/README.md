# Iris API

This folder contains a minimal HTTP API for the Iris desktop application. The goal is not to build a production backend yet, but to show:

- how to derive an HTTP contract from an Electron IPC contract
- how to organize a small Go service so it stays readable
- how to let the desktop app and API share the same fixture data before a real database exists

## What the server does

The desktop application currently needs three capabilities:

- `POST /auth/login`
- `GET /work-orders`
- `GET /work-orders/operators`

That contract is documented in [openapi.yaml](openapi.yaml).

The server is intentionally small, but it is not collapsed into a single file. The structure is:

- `cmd/server/main.go`: application entry point
- `internal/api/server.go`: HTTP routing and handlers
- `internal/domain/types.go`: domain types and request/response models
- `internal/store/fixtures.go`: fixture JSON loading

## Why `chi`

This project uses `chi` because it is lightweight, idiomatic, and stays very close to the standard `net/http` model. That makes it a good choice for learning because you can see the core Go HTTP flow without much framework magic.

`chi` gives you:

- explicit routes
- a clean middleware chain
- full compatibility with the standard library
- an easy path to a larger project later

If you learn this style first, it becomes easier to understand other Go web frameworks later, because `chi` is a thin layer on top of the standard HTTP interfaces.

## How a request flows through the server

Example for `GET /work-orders`:

1. `main.go` creates a `FixtureStore` and a `Server`.
2. `main.go` calls `http.ListenAndServe` with `server.Routes()`.
3. `Routes()` registers the `chi` routes and middleware.
4. When a request arrives at `/work-orders`, `chi` calls `handleWorkOrders`.
5. The handler asks the store layer for data.
6. `FixtureStore` reads `../apps/desktop/fixtures/work-orders.json`.
7. The JSON is decoded into Go struct values.
8. The handler returns the same shape that the desktop app already expects.

That is the standard Go flow: `router -> handler -> service/store -> response`.

## How the data is modeled in Go

In `internal/domain/types.go` you will see struct types like this:

```go
type WorkOrder struct {
	ID             string  `json:"id"`
	ClientName     string  `json:"clientName"`
	DocumentType   string  `json:"documentType"`
	DeliveryMethod string  `json:"deliveryMethod"`
	IssuedBy       string  `json:"issuedBy"`
	CreatedAt      string  `json:"createdAt"`
	CompletedAt    *string `json:"completedAt"`
	Price          *int    `json:"price"`
}
```

Important details:

- JSON tags tell Go how a field should appear on the wire.
- `*string` and `*int` are used for nullable JSON values.
- exported fields in Go start with an uppercase letter.

That is one of the first major differences compared with TypeScript: field visibility is part of the identifier itself, not a separate keyword.

## How the handlers work

A Go handler is a function that receives:

- `http.ResponseWriter`
- `*http.Request`

For example, the login handler does the following:

1. decodes the JSON body into `domain.LoginRequest`
2. loads users from the fixture store
3. checks `username` and `password`
4. returns `domain.LoginResponse`

There is no ORM, no dependency injection framework, and no generated controller code here. Everything is explicit. That is useful for learning because you can see exactly where each piece of behavior comes from.

## How the fixture store works

`internal/store/fixtures.go` is intentionally separated from the HTTP layer.

That gives two immediate benefits:

- handlers do not need to know anything about file paths
- later you can replace the fixture store with a real database without changing the HTTP contract

In other words, the store layer is the first small step toward a layered architecture.

## How to run the server

From the `iris-api` folder:

```bash
go mod tidy
go run ./cmd/server
```

The default address is `:8080`.

To use a different address:

```bash
IRIS_API_ADDR=:9090 go run ./cmd/server
```

## How to test it manually

Login:

```bash
curl -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
```

Work orders:

```bash
curl http://localhost:8080/work-orders
```

Operators:

```bash
curl http://localhost:8080/work-orders/operators
```

## How this maps back to Electron

The renderer currently calls the preload API:

- `window.api.login(...)`
- `window.api.getWorkOrders()`
- `window.api.getWorkOrderOperators()`

The main process still uses IPC for now, but it no longer stores static data directly in code. Instead, it reads JSON fixture files from `apps/desktop/fixtures`.

That gives you a natural next step:

1. keep the renderer as it is
2. replace the Electron main-process mock handlers so they call the HTTP API instead of reading fixtures directly
3. once that works, fully separate the backend from the desktop app

## What I would do next

If you want to grow this into a more serious Go backend, these are the natural next steps:

1. Add an `internal/service` layer between handlers and the store.
2. Add request payload validation.
3. Add `context.Context` timeouts for I/O operations.
4. Write table-driven Go tests for the store and handlers.
5. Replace the fixture store with a real database while keeping the same OpenAPI contract.

## What to learn from this example

If your goal is to learn Go through this project, focus on these topics in order:

1. The difference between package-level structure and folder organization.
2. How `struct` types and JSON tags model HTTP payloads.
3. Why pointer fields are useful for nullable JSON values.
4. How `http.Handler` and `chi` work together.
5. Why separating `api`, `domain`, and `store` is useful even in a small project.

That is a strong minimum foundation for larger Go services later.