# Čobanović seeding module

Everything for seeding the real Grafika Čobanović data set (migrated from the
shop's legacy FoxPro/dBASE system) lives in this one folder:

| Path | Committed? | Role |
| --- | --- | --- |
| `cobanovic.go` | yes | Seeding connector — `Seed(ctx, store, dir)`. Carries **no data**. |
| `import.py` | yes | Offline importer: legacy `.dbf` export → `data/seed.json`. |
| `catalog-kind-review.csv` | yes | Manually reviewed `code,kind,name` article/service split; overrides the heuristic per code. |
| `README.md` | yes | This file. |
| `data/` | **no** (git-ignored) | The actual data — `data/seed.json`, large derived data. |

Only `data/` is uncommitted; a fresh clone regenerates it from the legacy export.

## data/seed.json shape

`import.py` reads the cp1250-encoded `.dbf` tables and writes a single JSON file:

| Key | Source | Notes |
| --- | --- | --- |
| `customers` | `MdDob.dbf` | ~2657 partner firms. PIB/MB carried only when they pass Serbian validation (never fabricated). |
| `locations` | `MdDob.dbf` | One "Sedište" location per firm carrying its address (`ULICA`/`ULICAPLUS` + `PTT`/`MESTO`). Customer has no address field, so the address lives here. Firms with no address in the export get no location (~2634 of 2657). |
| `catalogItems` | `MdArt.dbf` | ~3575 articles + services. `kind` comes from the reviewed `catalog-kind-review.csv` when the code is listed there (the whole current catalog is, split 528 `article` / 3047 `service`); codes not in the file fall back to the `catalog_kind()` name heuristic (work verb like *štampa/gravura/izrada* → `service`; promo-brand tokens and resale-goods nouns → `article`), since the legacy `USLUGA` flag alone mislabels bought-in goods as services. |
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
