# PostgreSQL: migration and operations

Iris runs on either SQLite or PostgreSQL. The engine is chosen at startup by a
single environment variable:

| Variable | Effect |
| --- | --- |
| `DATABASE_URL` | Set → PostgreSQL. Takes precedence over `DATABASE_PATH`. |
| `DATABASE_PATH` | Used when `DATABASE_URL` is empty. The SQLite file. |

Both engines are served by the same store code. Statements are written once in
the SQLite dialect and rewritten for PostgreSQL inside the driver
(`iris-api/internal/store/postgres_sql.go`); `postgres_sql_test.go` pins each
rewrite rule and `postgres_store_test.go` runs the same behavioural scenarios
against both engines.

## What differs on PostgreSQL

- **Money columns are `NUMERIC(14,4)`, not `REAL`.** Prices were stored in binary
  floating point, which cannot represent ordinary decimal amounts exactly. This
  is the one deliberate type change in the port; it scans into the same Go
  `float64`, so no calling code changed.
- **Timestamps are still `TEXT`.** The store compares them as lexicographically
  ordered `RFC3339` / `YYYY-MM-DD HH:MM:SS` strings. Converting them to
  `timestamptz` is a worthwhile follow-up, but it is a behavioural change and
  does not belong in a storage-engine swap.
- **Boolean-ish flags are still `0/1` smallints** (with a `CHECK`), because the
  store compares and scans them as integers.
- **A `nocase` ICU collation** backs the case-insensitive ordering and lookups
  that SQLite spelled `COLLATE NOCASE`. This is why the compose file pins the
  Debian-based `postgres:16` image rather than `-alpine`.
- **`irisctl backup` does not work against PostgreSQL.** It is a SQLite
  `VACUUM INTO`. Use `pg_dump` — see [Backups](#backups) below.

A fresh PostgreSQL database is created directly at the consolidated v12 schema
and stamped as such, rather than replaying the twelve SQLite migrations (several
of which are SQLite table rebuilds). **Migration 13 and later are shared**: add
them to `sqliteMigrations` only, never to `postgresSchema`, or existing
PostgreSQL databases will skip them.

## Migrating the production database

This is written for the shared Hetzner box, where Iris runs from
`docker-compose.prod.yml` behind the host Caddy. It assumes you are in the
directory holding that file and its `.env`.

Expect a short read-only window: the API is stopped for the copy so nothing can
write to SQLite behind the migration's back. The copy itself is fast — the
dataset is small — so the window is dominated by pulling the image.

### 1. Add the database password

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" >> .env
```

`POSTGRES_DB` and `POSTGRES_USER` default to `iris`; set them in `.env` only if
you want different values.

### 2. Take a SQLite backup you can actually roll back to

```bash
docker compose -f docker-compose.prod.yml run --rm \
  backend irisctl backup -out /data/backups/pre-postgres.db
docker compose -f docker-compose.prod.yml run --rm \
  -v "$PWD:/out" backend cp /data/backups/pre-postgres.db /out/
```

Copy that file off the box before continuing.

### 3. Start PostgreSQL only

```bash
docker compose -f docker-compose.prod.yml up -d db
docker compose -f docker-compose.prod.yml ps db     # wait for healthy
```

### 4. Stop the API so SQLite stops changing

```bash
docker compose -f docker-compose.prod.yml stop backend frontend
```

### 5. Copy the data

```bash
docker compose -f docker-compose.prod.yml run --rm backend \
  irisctl migrate-to-postgres -from /data/iris.db
```

`DATABASE_URL` comes from the compose environment, so `-to` is not needed. The
command prints a row count per table and then re-counts both databases
independently; it exits non-zero if any table disagrees. It refuses to run
against a database that already holds data, so a re-run cannot double the rows.

The whole copy is one transaction: if it fails, PostgreSQL is left untouched and
you can simply restart the backend on SQLite.

### 6. Start the API on PostgreSQL

```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs backend | head
```

The log line `using postgres storage` confirms the engine. Then check the site:
log in, open the work-order list, open one order, and create a draft.

### 7. Afterwards

Keep the `iris_sqlite_data` volume until you are confident. It is the rollback.

## Rolling back

Remove (or comment out) `DATABASE_URL` in the backend service and recreate it:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate backend
```

The API is back on the SQLite file, which the migration only ever read. Anything
written while PostgreSQL was live stays in PostgreSQL and is not carried back —
so roll back promptly or not at all.

## Backups

`irisctl backup` is SQLite-only. On PostgreSQL, dump instead:

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U iris -d iris --format=custom > "iris-$(date -u +%Y%m%d-%H%M%S).dump"
```

Restore into an empty database with:

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_restore -U iris -d iris --clean --if-exists < iris-<timestamp>.dump
```

Copy dumps off the box — a backup on the same disk as the database is not a
backup. Point-in-time recovery (WAL archiving) is worth setting up separately;
it is the main operational reason to be on PostgreSQL at all.

## Running the tests against PostgreSQL

The PostgreSQL tests are skipped unless a DSN is provided. They **drop the
`public` schema**, so point them at a throwaway database only:

```bash
createdb iris_test
cd iris-api
IRIS_TEST_POSTGRES_DSN="postgres://iris@127.0.0.1:5432/iris_test?sslmode=disable" \
  go test ./internal/store
```

Without `IRIS_TEST_POSTGRES_DSN`, `go test ./...` runs exactly as before and the
PostgreSQL cases report as skipped.
