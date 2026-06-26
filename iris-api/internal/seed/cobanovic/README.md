# Čobanović seeding module

Everything for seeding the real Grafika Čobanović data set (migrated from the
shop's legacy FoxPro/dBASE system) lives in this one folder:

| Path | Committed? | Role |
| --- | --- | --- |
| `cobanovic.go` | yes | Seeding connector — `Seed(ctx, store, dir)`. Carries **no data**. |
| `import.py` | yes | Offline importer: legacy `.dbf` export → `data/seed.json`. |
| `README.md` | yes | This file. |
| `data/` | **no** (git-ignored) | The actual data — `data/seed.json`, large derived data. |

Only `data/` is uncommitted; a fresh clone regenerates it from the legacy export.

## data/seed.json shape

`import.py` reads the cp1250-encoded `.dbf` tables and writes a single JSON file:

| Key | Source | Notes |
| --- | --- | --- |
| `customers` | `MdDob.dbf` | ~2657 partner firms. PIB/MB carried only when they pass Serbian validation (never fabricated). |
| `catalogItems` | `MdArt.dbf` | ~3575 articles + services; `kind` from the `USLUGA` flag. |
| `workOrders` | `OT*.dbf` | Small best-effort demo set (the source has no client linkage), showing catalog-linked and ad-hoc line items. |

## Regenerate + seed

```bash
# From this folder (iris-api/internal/seed/cobanovic/):
python3 -m venv .venv && .venv/bin/pip install dbfread
.venv/bin/python import.py --src /path/to/export/DBF   # writes ./data/seed.json

# From the iris-api module root:
DATABASE_PATH=./data/iris.db go run ./cmd/irisctl seed-cobanovic
```

`seed-cobanovic` reads `internal/seed/cobanovic/data` by default; override with
`-dir`.

## Validation

PIB (9 digits, ISO 7064 MOD 11,10) and MB (8 digits, format only) validation in
`import.py` mirrors `iris-api/internal/domain/validation.go`. Keep them in sync if
the rules change.
