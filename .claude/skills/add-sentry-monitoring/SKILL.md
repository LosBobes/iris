---
name: add-sentry-monitoring
description: Wire Sentry error reporting into an Iris surface (Go backend or React frontend) using the repo's build-time-DSN-from-GitHub-secret pattern. Use when adding Sentry to a new surface, rotating/replacing a DSN, or onboarding a new deployable that should report errors.
---

# Add Sentry monitoring to an Iris surface

Iris reports errors to Sentry with **one project per surface** (backend and
frontend are separate Sentry projects with separate DSNs). The shared pattern:

- The SDK initializes **only when a DSN is present**, so dev/source builds stay
  silent.
- The DSN is **baked into the published image at build time** from a GitHub
  Actions secret, never committed to source. A Sentry DSN is a client-side
  ingestion key, not a true secret, so embedding it in an image/bundle is fine.
- Each `Dockerfile` declares only the build `ARG` it needs;
  `.github/workflows/build.yml` passes every DSN build-arg to every matrix
  entry and the unused ones are ignored.

## Secrets and CI wiring (do this for any surface)

1. Create the Sentry project in the Sentry UI and copy its DSN.
2. Store the DSN as a repo secret (the literal DSN must not land in git):
   ```bash
   printf '%s' "<dsn>" | gh secret set <SECRET_NAME>
   ```
   Convention: `SENTRY_DSN` (backend), `SENTRY_DSN_FRONTEND` (web).
3. Add a `build-args` line in the single build step of
   `.github/workflows/build.yml` mapping the secret to the build arg the
   surface's Dockerfile reads.
4. Confirm no DSN literal is tracked before committing:
   ```bash
   grep -rn "ingest\.\(de\.\)\?sentry\.io" .github backend frontend iris-api apps
   ```

## Backend (Go API, `iris-api/`)

Dependency: `github.com/getsentry/sentry-go` (+ `/http` middleware). Run
`go get` then `go mod tidy` from `iris-api/`.

- **`iris-api/cmd/server/main.go`**: init early in `main`, gated on env, with a
  deferred flush. Keep it as wiring only (per `iris-api/CLAUDE.md`):
  ```go
  if dsn := strings.TrimSpace(os.Getenv("SENTRY_DSN")); dsn != "" {
      if err := sentry.Init(sentry.ClientOptions{
          Dsn: dsn, Environment: env, Release: os.Getenv("IRIS_RELEASE"),
      }); err == nil {
          defer sentry.Flush(2 * time.Second)
      }
  }
  ```
- **`iris-api/internal/api/server.go`**: register the HTTP middleware **inside**
  chi's `Recoverer` so it sees panics before they are swallowed, then re-panics:
  ```go
  r.Use(middleware.Recoverer)
  r.Use(sentryhttp.New(sentryhttp.Options{Repanic: true}).Handle)
  ```
  It is a no-op when Sentry was not initialized, so it is always safe to add.
- **`backend/Dockerfile`**: `ARG SENTRY_DSN=""` then add `SENTRY_DSN` to the
  runtime `ENV` block. Runtime env can still override the baked value.
- **`deploy/docker-compose.yml`**: do **not** set `SENTRY_DSN` in the backend
  `environment:` map; an explicit value (even empty) overrides the baked-in one.
  Leave it commented with a note, as the override hook.

## Frontend (web, `apps/web/`)

Dependency: `@sentry/react`. Install it so the **linux** lockfile stays correct
(the web image builds on linux/amd64; a plain macOS install drops the linux
optional deps and breaks `npm ci` in CI):
```bash
cd apps/web && docker run --rm --platform linux/amd64 -v "$PWD":/app -w /app \
  node:24-alpine sh -c "npm install --save @sentry/react && npm ci"
# then reinstall locally for your machine's binaries:
npm ci
```

- **`apps/web/src/lib/sentry.ts`**: init gated on `import.meta.env.VITE_SENTRY_DSN`,
  using `import.meta.env.MODE` as the environment. Imported for its side effect.
- **`apps/web/src/main.tsx`**: `import './lib/sentry'` as the **first** import,
  before the app renders.
- **`apps/web/.env.example`**: document `VITE_SENTRY_DSN=` (empty = disabled).
- **`frontend/Dockerfile`**: `ARG VITE_SENTRY_DSN=""` + `ENV` **before** the
  `npm run build` step (Vite reads `VITE_*` only at build time). The DSN is
  compiled into the static bundle, so it cannot be changed by server env vars;
  changing it requires a frontend image rebuild.

## Verify

Per-surface checks (see root `CLAUDE.md` "Commands"):
```bash
# backend
cd iris-api && go build ./... && go test ./internal/api ./cmd/server
# frontend
cd apps/web && npm run lint && npm test && npm run build
# confirm the DSN bakes in only when the env var is set
VITE_SENTRY_DSN="<dsn>" npm run build && grep -rl "<public-key>" dist
```

Send a test event to confirm ingest (returns HTTP 200 / an event id):
```bash
# backend: a tiny Go program calling sentry.CaptureException then sentry.Flush
# frontend: POST to the store API
HOST=<o…>.ingest.de.sentry.io; PROJ=<project-id>; KEY=<public-key>
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://${HOST}/api/${PROJ}/store/?sentry_key=${KEY}&sentry_version=7" \
  -H 'Content-Type: application/json' \
  --data '{"message":"smoke test","level":"error","platform":"javascript"}'
```
If events reach ingest but are not visible in the UI, it is a UI filter
(environment, time range) or wrong project, not the code.

## Docs

Update the Sentry note in `deploy/README.md`. Iris docs use **no em dashes**.
