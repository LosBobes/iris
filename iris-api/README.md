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

## Go language primer for this API

This is not a general Go tutorial. It is a short primer for understanding the code in this folder.

### 1. Packages are the unit of organization

Each folder in this API is a Go package:

- `cmd/server`: the runnable program
- `internal/api`: HTTP routing and handlers
- `internal/domain`: shared domain types
- `internal/store`: fixture-backed data access

The first line in a Go file declares the package:

```go
package api
```

That means everything in that folder belongs to the same package namespace.

### 2. Imports are explicit and unused imports are not allowed

Go requires every imported package to be used. For example:

```go
import (
	"encoding/json"
	"net/http"
)
```

If you import something and never use it, the file will not compile. This keeps files tidy, but it also means the compiler is stricter than TypeScript in this area.

### 3. Capitalization controls visibility

Go does not use `public` or `private`. Instead:

- names starting with an uppercase letter are exported
- names starting with a lowercase letter are package-private

Examples from this codebase:

- `type Server struct { ... }` is exported
- `func NewServer(...)` is exported
- `func writeJSON(...)` is not exported

That is why constructor-style functions usually start with `New...` and type names are capitalized.

### 4. Structs are the main way to model data

Go uses `struct` where you might use interfaces and object literals in TypeScript.

```go
type User struct {
	ID       string   `json:"id"`
	Username string   `json:"username"`
	Role     UserRole `json:"role"`
}
```

Important details:

- fields have explicit static types
- the backtick syntax is a struct tag, not a comment
- JSON tags control the encoded property names

### 5. Methods are just functions with a receiver

This API uses methods like:

```go
func (s *Server) Routes() http.Handler {
	...
}
```

The `(s *Server)` part is the receiver. It means `Routes` is a method on `Server`.

You can read that as: “this function belongs to `Server` and operates on a pointer to it.”

### 6. Pointers are used for mutation and nullable values

You will see pointer syntax in two main places.

Receiver pointers:

```go
func (s *Server) handleLogin(...) {
```

That lets the method operate on the same `Server` instance instead of a copied value.

Nullable fields:

```go
CompletedAt *string `json:"completedAt"`
Price       *int    `json:"price"`
```

In JSON, those fields may be `null`. In Go, a pointer can be `nil`, which is how this API represents missing values.

### 7. Slices are dynamic arrays

Go’s common list type is a slice:

```go
[]domain.WorkOrder
[]string
```

You can think of a slice as a resizable view over an array. In practice, for application code, you usually treat it like a dynamic array.

Appending works like this:

```go
operators = append(operators, workOrder.IssuedBy)
```

### 8. Maps are key-value stores

The operator collection logic uses a map as a set:

```go
seen := make(map[string]struct{}, len(workOrders))
```

Why `struct{}` as the value type?

- it takes effectively no storage for each value
- only the keys matter

This is a common Go idiom for “I only care whether this key exists.”

### 9. `if err != nil` is the standard error flow

Go does not use exceptions for ordinary application errors. Functions return an `error` value, and callers check it explicitly.

Example:

```go
users, err := s.store.Users()
if err != nil {
	writeServerError(w, err)
	return
}
```

This is one of the most important Go reading patterns. You will see it everywhere.

### 10. Short variable declarations are common

Go often uses `:=` to declare and initialize variables:

```go
addr := os.Getenv("IRIS_API_ADDR")
```

Use `:=` when introducing a new variable inside a function. Use `=` when assigning to an already declared variable.

### 11. `for` is Go’s only loop keyword

Go has one loop keyword, `for`, with several styles.

Range loop over a slice:

```go
for _, user := range users {
	...
}
```

Range loop over a collection while ignoring the index:

- `_` means “ignore this value”
- `user` is the current element

### 12. Constructors are ordinary functions

Go does not have class constructors. Instead, code often uses plain functions named `New...`:

```go
func NewFixtureStore(basePath string) *FixtureStore {
	return &FixtureStore{basePath: basePath}
}
```

This is just a convention, but it is used heavily across the Go ecosystem.

### 13. Interfaces are usually small and implicit

This API returns `http.Handler` from `Routes()`:

```go
func (s *Server) Routes() http.Handler {
```

`http.Handler` is an interface from the standard library. In Go, a type satisfies an interface implicitly if it has the required methods. There is no `implements` keyword.

That makes Go interfaces lightweight and composable.

### 14. Embedding is a lightweight composition feature

This type:

```go
type FixtureUser struct {
	User
	Password string `json:"password"`
}
```

embeds `User` inside `FixtureUser`.

That means:

- `FixtureUser` contains all `User` fields
- you can access them directly as `user.ID`, `user.Username`, and `user.Role`

This is not inheritance. It is composition with convenient field promotion.

### 15. How to read the API code in order

If you are new to Go, read the project in this order:

1. `cmd/server/main.go`
2. `internal/api/server.go`
3. `internal/domain/types.go`
4. `internal/store/fixtures.go`
5. `internal/api/doc.go`, `internal/domain/doc.go`, and `internal/store/doc.go`

That order mirrors the runtime flow:

- start program
- register routes
- understand payloads
- load data
- read package intent

### 16. The five Go habits that matter most here

If you remember only a few things while reading this API, make them these:

1. Uppercase names are exported.
2. Structs plus JSON tags define payloads.
3. `if err != nil` is normal control flow.
4. Pointers often mean either shared state or nullable data.
5. Packages and small functions matter more than class hierarchies.

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

## Go testing primer for this API

This project now includes real Go tests in two places:

- `internal/store/fixtures_test.go`
- `internal/api/server_test.go`

Shared test-only helpers live in:

- `internal/testutil/fixtures.go`

They are intentionally small and focused so you can learn the standard Go testing style from code that already matters to this project.

### 1. How Go tests are named

Go discovers tests in files ending with `_test.go`.

Each test function must:

- start with `Test`
- accept `t *testing.T`

Example:

```go
func TestLoginSuccess(t *testing.T) {
	...
}
```

### 2. How to run the tests

From `iris-api`:

```bash
go test ./...
```

To run only one package:

```bash
go test ./internal/api
go test ./internal/store
```

To run one specific test:

```bash
go test ./internal/api -run TestLoginSuccess
```

### 3. What the store tests teach

The store tests focus on plain function behavior:

- reading users from fixtures
- deriving sorted unique operators
- failing correctly when fixture files are missing

This is the simplest kind of Go testing: call a function, inspect the result, fail fast with `t.Fatalf(...)` if something is wrong.

### 4. What the handler tests teach

The API tests use standard-library HTTP testing tools:

- `httptest.NewRequest(...)`
- `httptest.NewRecorder()`

That lets you exercise the router without starting a real network server.

The pattern is:

1. build a request
2. record the response
3. call `server.Routes().ServeHTTP(...)`
4. assert on status code and JSON body

This is the core testing technique for many Go HTTP services.

The API endpoint tests are written in table-driven style, which is one of the
most common Go testing patterns. Instead of writing a separate top-level test
for every case, you define a slice of test cases and run them with `t.Run(...)`.

### 5. Why these tests matter for learning Go

These tests show several important Go habits in a compact form:

- explicit setup helpers
- table-like assertion style without heavy frameworks
- direct use of the standard library
- JSON decoding in assertions
- small focused test cases instead of large integration flows

### 6. Suggested reading order for the tests

If you are learning Go testing, read them in this order:

1. `internal/store/fixtures_test.go`
2. `internal/api/server_test.go`
3. `internal/testutil/fixtures.go`

The store tests are simpler. The API tests add HTTP request/response testing on top.

### 7. A good next testing step

Once you are comfortable with these tests, the next useful improvement is to expand the table-driven cases with more edge scenarios, such as fixture corruption, missing required fields, or additional auth behaviors.

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