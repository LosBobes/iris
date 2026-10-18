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

Written for the shared Hetzner box, where Iris runs from `docker-compose.prod.yml`
behind the host Caddy. Run everything from `DEPLOY_PATH`, the directory holding
that file and its `.env`.

**Nothing here happens by itself.** `deploy.yml` runs a plain
`docker compose up -d` on every merge to `main`, and the PostgreSQL service sits
behind a compose profile, so the API keeps using SQLite until `DATABASE_URL` is
set. Merging the migration changes nothing on the box; the steps below do.

### Preconditions

- **This is a full outage, not a read-only window.** The backend and frontend are
  stopped for the copy, so users get Caddy 502s. Plan on about 15 s plus
  `rows / 2000` s (measured: 13.6 s for 3.9k rows). Announce it.
- **Freeze merges and disable the "Deploy to Hetzner" workflow** for the whole
  window. A deploy that lands mid-cutover recreates containers with whatever
  `.env` says at that moment.
- Keep the rollback section open in a second terminal.
- Have somewhere off the box to put the backup (laptop, another host).

### 0. Session setup (every new shell, before anything else)

Manual `docker compose` commands interpolate `${IRIS_IMAGE_TAG:-latest}`. The
box's local `:latest` is stale: `deploy.yml` exports the real tag only inside its
own ssh session and then prunes old images. Without the next lines a plain
`docker compose up -d` can recreate the stack on an old or missing image.

```bash
cd <DEPLOY_PATH>
C="docker compose -f docker-compose.prod.yml"
export IRIS_IMAGE_TAG="$(docker inspect --format '{{.Config.Image}}' "$($C ps -q backend)" | sed 's/.*://')"; echo "$IRIS_IMAGE_TAG"   # must be git-<sha7>
```

Expected: a line like `git-1a2b3c4`. If it prints `latest`, nothing, or an
error, stop: the backend is not running the image you think it is.

Never `source .env`: it overwrites `IRIS_IMAGE_TAG` and breaks on special
characters in other values. Read single values with
`grep '^NAME=' .env | cut -d= -f2-`.

Check the volume that will be your rollback, and leave it alone:

```bash
docker volume ls | grep iris_sqlite_data
```

It is named `<project>_iris_sqlite_data`, where the project is the basename of
`DEPLOY_PATH`.

### 1. Pre-flight (the site stays up)

Take a throwaway consistent copy and inspect it. `irisctl backup` is a
`VACUUM INTO` and is safe while the API runs. **Never copy a raw `iris.db` by
itself**: in WAL mode the newest writes live in `iris.db-wal`, and a lone file
silently loses them.

```bash
$C run --rm --entrypoint irisctl backend backup -out /data/preflight.db
$C cp backend:/data/preflight.db ./preflight.db
```

Copy `deploy/postgres-preflight.sql` from the repo to the box as `preflight.sql`
(`scp`), then:

```bash
docker run --rm -v "$PWD:/w" -w /w alpine:3.21 sh -c "apk add -q sqlite && sqlite3 -readonly preflight.db < preflight.sql"
```

Each section prints its own "expect" line. In short:

- schema version is the newest migration (25 at time of writing);
- no order numbers with a non-digit suffix (such as `RN-2026-12/A`);
- every money/quantity `bad` is 0 (more than 4 decimals or >= 1e10 would be
  rounded or rejected by `NUMERIC(14,4)`);
- no tables outside the migration (empty list);
- row counts: write them down for step 7.

`irisctl` runs the same checks from the code, and also lists tables the migration
does not know about. It needs no PostgreSQL:

```bash
$C run --rm --entrypoint irisctl backend migrate-to-postgres -check -from /data/iris.db
```

Expected tail:

```
Izvor: /data/iris.db (verzija šeme 25)
  tenants                               2
  ...
Provera izvora je prošla: 3912 redova, nema upozorenja.
```

Every `UPOZORENJE:` line, and the closing `provera izvora je pronašla probleme`,
must be understood and fixed (or consciously accepted) before going on.
Clean up with `rm preflight.db preflight.sql`; the copy inside the data volume
(`/data/preflight.db`) is small and harmless.

A `-from` that points nowhere is refused before anything is opened
(`izvorna SQLite baza ne postoji: ... (proverite -from)`). Older builds silently
created an empty database and "succeeded" with only seed rows.

### 2. Prepare PostgreSQL (still no `DATABASE_URL`)

Pre-pull so the window does not pay for the download, then add the profile and a
password. The edits are idempotent and newline-safe, so repeating them is
harmless:

```bash
$C pull db
sed -i -e '$a\' .env
grep -q '^COMPOSE_PROFILES=' .env || echo 'COMPOSE_PROFILES=postgres' >> .env
grep -q '^POSTGRES_PASSWORD=' .env || echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" >> .env
chmod 600 .env
```

Hex is URL-safe, so the password goes into the connection string unescaped.
PostgreSQL keeps the **first** password its data volume was initialised with:
editing `POSTGRES_PASSWORD` in `.env` later does not change the database's.

`COMPOSE_PROFILES` is read by compose itself, so from now on every
`docker compose up -d`, including the one `deploy.yml` runs, manages the database
too. Define the connection string (re-run this line in any new shell) and start
only the database:

```bash
DSN="postgres://iris:$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)@db:5432/iris?sslmode=disable"
$C up -d db
$C ps db          # wait until STATUS says (healthy)
```

**Do not set `DATABASE_URL` yet.** That is step 6; setting it now would point the
API at an empty database.

### 3. Stop the backend and frontend (the outage starts here)

```bash
$C stop frontend backend
$C ps             # only db should be running
```

### 4. Back up SQLite, now that nothing can write

Taken after the stop, so it is the final state. It is written inside the
container, because the container user (uid 65532) cannot write to a host bind
directory:

```bash
TS=$(date -u +%Y%m%d-%H%M%S)
$C run --rm --entrypoint irisctl backend backup -out /data/pre-postgres-$TS.db
$C cp backend:/data/pre-postgres-$TS.db ./
sha256sum pre-postgres-$TS.db
```

Expected: `Backup je sačuvan: /data/pre-postgres-<TS>.db`. Copy
`pre-postgres-<TS>.db` **off the box** and compare the checksum there. Do not go
on without it.

### 5. Copy the data

```bash
$C run --rm --entrypoint irisctl backend migrate-to-postgres -from /data/iris.db -to "$DSN"
```

`-to` is passed explicitly because the API's own `DATABASE_URL` is still empty.

Expected output (counts differ; the schema version matches step 1):

```
Izvor: /data/iris.db (verzija šeme 25)
  tenants                               2
  platform_admins                       1
  ...
  stock_movements                      28
Migracija je završena: 3912 redova, sve tabele se poklapaju.
```

What the command guarantees:

- all source tables are read in one read-only snapshot, and the whole copy is a
  single PostgreSQL transaction;
- the row count of every table is compared **inside** that transaction, before
  commit. A mismatch rolls everything back (`provera nije uspela, migracija je
  poništena: <tabela>: ...`) and leaves PostgreSQL empty;
- it refuses a target that already holds data
  (`target table users already holds 6 rows: ...`).

**If it fails**, a clean failure leaves PostgreSQL empty: fix the cause and
re-run. If you are unsure what state the target is in (the shell died halfway,
the copy ran twice), reset it before retrying:

```bash
$C exec -T db psql -U iris -d iris -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE;' -c 'CREATE SCHEMA public;'
```

The next `irisctl` or backend start recreates the schema. If you cannot fix it
quickly, bring the site back on SQLite: `$C up -d` (with `DATABASE_URL` still
unset) and end the window.

### 6. Point the API at PostgreSQL

```bash
sed -i '/^DATABASE_URL=/d' .env; echo "DATABASE_URL=$DSN" >> .env
$C up -d
$C ps                                  # backend (healthy), frontend Up
$C logs backend | grep storage         # expect: using postgres storage
```

`$C up -d` recreates the backend (its environment changed) and starts the
frontend. The outage ends when the frontend is back.

### 7. Verify

Counts should equal the step 1 and step 5 numbers:

```bash
$C exec -T db psql -U iris -d iris -c "select (select count(*) from tenants) tenants, (select count(*) from users) users, (select count(*) from customers) customers, (select count(*) from work_orders) work_orders, (select count(*) from catalog_items) catalog_items"
```

The case-insensitive collation exists (one row):

```bash
$C exec -T db psql -U iris -d iris -c "select collname from pg_collation where collname = 'nocase'"
```

Identity sequences were advanced past the copied ids (`ok` is `t` on every row;
an empty table shows a NULL `last_value` and still `t`):

```bash
$C exec -T db psql -U iris -d iris -c "SELECT t, max_id, last_value, (max_id IS NULL OR last_value >= max_id) AS ok FROM (
 SELECT 'work_order_status_history' t, (SELECT max(id) FROM work_order_status_history) max_id, (SELECT last_value FROM pg_sequences WHERE sequencename = 'work_order_status_history_id_seq') last_value
 UNION ALL SELECT 'login_events', (SELECT max(id) FROM login_events), (SELECT last_value FROM pg_sequences WHERE sequencename = 'login_events_id_seq')
 UNION ALL SELECT 'impersonation_events', (SELECT max(id) FROM impersonation_events), (SELECT last_value FROM pg_sequences WHERE sequencename = 'impersonation_events_id_seq')
 UNION ALL SELECT 'impersonation_actions', (SELECT max(id) FROM impersonation_actions), (SELECT last_value FROM pg_sequences WHERE sequencename = 'impersonation_actions_id_seq')
 UNION ALL SELECT 'platform_audit_events', (SELECT max(id) FROM platform_audit_events), (SELECT last_value FROM pg_sequences WHERE sequencename = 'platform_audit_events_id_seq')) s"
```

Browser checklist, on the real URL:

- sign in to the production organization; the work-order list loads with the
  same total as before;
- open an existing order (materials, notes, attachments);
- search a customer with the name typed in the wrong case and without
  diacritics;
- create a new order: it gets the next order number, not a duplicate;
- print a PDF; check a catalog price with decimals;
- sign in to `/backoffice`; the dashboard counts load.

Only now re-enable the "Deploy to Hetzner" workflow and unfreeze merges.

## Rolling back

Start with step 0 (export the running tag). Then:

```bash
sed -i '/^DATABASE_URL=/d' .env
$C up -d --force-recreate backend
$C logs backend | grep storage         # expect: using sqlite storage at /data/iris.db
```

The SQLite volume was only ever read by the migration, so this restores the
state at the moment of the stop in step 3.

- **Writes made on PostgreSQL are lost, and their ids and order numbers will be
  issued again on SQLite.** If users worked on PostgreSQL, export what they
  created first and re-enter it afterwards:

  ```bash
  $C exec -T db psql -U iris -d iris -c "\copy (select id, tenant_id, order_number, client_name, created_at from work_orders where created_at >= '<cutover>') to stdout csv header" > created-on-postgres.csv
  ```

  `<cutover>` is the step 6 time, UTC, as `YYYY-MM-DD HH:MM:SS`. Roll back
  promptly or not at all.
- **Never deploy a pre-#46 image while `DATABASE_URL` is set.** It does not know
  the variable, ignores it, and serves SQLite silently while PostgreSQL goes
  stale. Remove `DATABASE_URL` first.
- A second attempt needs PostgreSQL reset (the `DROP SCHEMA` recipe in step 5),
  because it now holds data and the copy refuses a non-empty target. Start again
  from step 1: SQLite has changed since.

## Backups

`irisctl backup` is SQLite-only (`VACUUM INTO`) and does not work with
`DATABASE_URL` set. After the cutover, dump with `pg_dump`.

Nightly cron on the box (`crontab -e`), plus an off-box sync of `backups/`
(rsync/rclone to another host; a backup on the database's own disk is not a
backup):

```cron
15 2 * * * cd <DEPLOY_PATH> && mkdir -p backups && docker compose -f docker-compose.prod.yml exec -T db pg_dump -U iris -d iris --format=custom > backups/iris-$(date -u +\%Y\%m\%d).dump && find backups -name 'iris-*.dump' -mtime +14 -delete
```

`exec` into the running `db` does not interpolate `IRIS_IMAGE_TAG`, so cron does
not need it.

Restore: stop the backend first, then restore **into the existing `iris`
database**. `--clean --if-exists` drops and recreates the objects in it; the
database is not empty and does not need to be:

```bash
$C stop backend
$C exec -T db pg_restore -U iris -d iris --clean --if-exists < backups/iris-<date>.dump
$C up -d backend
```

Point-in-time recovery (WAL archiving) is worth setting up separately; it is the
main operational reason to be on PostgreSQL at all.

## After the cutover

- Install the cron job above, and confirm the first dump is non-empty and
  restores into a scratch database.
- Keep the `<project>_iris_sqlite_data` volume for 2 to 4 weeks as the rollback,
  then remove it deliberately (`docker volume rm`).
- The compose file pins `postgres:16.N`, so routine deploys do not recreate the
  database container on a new minor. Upgrade deliberately: bump the tag, take a
  `pg_dump`, then `$C up -d db`. **Do not move to PostgreSQL 18**: its image
  keeps data under a different path (`/var/lib/postgresql`), so the existing
  volume mount would start an empty cluster. A major upgrade is a dump and
  restore, planned separately.

## Merging more changes later

A later PR that adds tables must add them to `migrationTables` in
`iris-api/internal/store/migrate_postgres.go` (parents before children), or to
`migrationExcludedTables` with a reason; `TestMigrationTablesCoverEverySQLiteTable`
enforces this. It must also be tested with `IRIS_TEST_POSTGRES_DSN` (below).
Migrations that `CAST` text to numbers must filter to digit-only values first:
SQLite casts `12/A` to 12, PostgreSQL raises an error (this was the order-number
query).

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
