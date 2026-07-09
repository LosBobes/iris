#!/usr/bin/env python3
"""Convert the legacy Grafika Čobanović FoxPro/dBASE export into a single Iris
JSON seed file.

The shop migrated off a DOS-era accounting program ("Račun 3.47"). Its export is
a folder of cp1250-encoded .dbf tables, collapsed here into one seed file with
`customers`, `catalogItems`, and `workOrders` keys:

  MdDob.dbf   partner/client firms        -> customers
  MdArt.dbf   articles + services catalog -> catalogItems
  OT*.dbf     work-order line items       -> workOrders (best-effort demo)
  Firme.dbf   the shop itself (issuer)    -> not imported as a client

This script is a one-time, offline import tool that lives alongside the seeding
module. The generated data (./data/seed.json) is **not** committed (it is large,
derived data); regenerate it from the export and load it with
`irisctl seed-cobanovic`.

Usage (run from this folder, iris-api/internal/seed/cobanovic/):
  python3 import.py --src /path/to/DBF        # writes ./data/seed.json

Requires `dbfread` (pip install dbfread).
"""
from __future__ import annotations

import argparse
import csv
import json
import os
from dbfread import DBF

ENCODING = "cp1250"

# A manually reviewed catalog article/service split lives beside this script as a
# committed CSV (code,kind,name). The legacy USLUGA flag and the name heuristic
# below both misclassify a large share of the ~3.5k-row catalog, so every code in
# this file overrides the heuristic with the human-reviewed kind. The heuristic
# only decides codes not yet in the review file (e.g. rows added by a later
# export). Regenerate/extend it with tools in this folder when the catalog grows.
KIND_REVIEW_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "catalog-kind-review.csv")


def load_kind_review() -> dict[str, str]:
    """Load the reviewed code -> kind overrides. Missing file -> no overrides."""
    if not os.path.exists(KIND_REVIEW_FILE):
        return {}
    review: dict[str, str] = {}
    with open(KIND_REVIEW_FILE, encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            code = (row.get("code") or "").strip()
            kind = (row.get("kind") or "").strip()
            if code and kind in ("article", "service"):
                review[code] = kind
    return review


# --- Serbian identifier validation (mirrors iris-api/internal/domain/validation.go) ---


def _all_digits(value: str) -> bool:
    return len(value) > 0 and all("0" <= c <= "9" for c in value)


def _mod11_10_ok(value: str) -> bool:
    p = 10
    for ch in value[:-1]:
        s = (int(ch) + p) % 10
        if s == 0:
            s = 10
        p = (s * 2) % 11
    control = (11 - p) % 10
    return control == int(value[-1])


def valid_pib(pib: str) -> bool:
    pib = (pib or "").strip()
    return len(pib) == 9 and _all_digits(pib) and _mod11_10_ok(pib)


def valid_mb(mb: str) -> bool:
    mb = (mb or "").strip()
    return len(mb) == 8 and _all_digits(mb)


# --- helpers ---


def table(src: str, name: str) -> DBF:
    return DBF(
        os.path.join(src, f"{name}.dbf"),
        encoding=ENCODING,
        char_decode_errors="replace",
    )


def clean(value) -> str:
    if value is None:
        return ""
    # Legacy rows occasionally carry stray C0 control bytes (e.g. STX 0x02) from
    # the DOS export; strip them before collapsing whitespace.
    text = "".join(c for c in str(value) if c >= " " and c != "\x7f")
    return " ".join(text.split()).strip()


def clean_name(value) -> str:
    """clean() plus targeted fixes for mangled names in the legacy export.

    The DOS export rendered German low-9 opening quotes as a double comma, so
    names like `,,Electronic design medical"` arrive with junk wrapping. We turn
    `,,` back into a quote, strip leading quote/comma junk, and drop an
    unbalanced trailing quote — while leaving legitimately quoted names such as
    `Agencija "2M2"` untouched.
    """
    text = clean(value)
    text = text.replace(",,", '"')
    text = text.lstrip(" ,\"'")
    if text.count('"') % 2 == 1 and text.endswith('"'):
        text = text[:-1]
    return text.strip()


def opt(value):
    text = clean(value)
    return text if text else None


def parse_price(value) -> float:
    """Parse a legacy numeric price column; return 0.0 when blank/invalid."""
    try:
        return float(value) if value else 0.0
    except (TypeError, ValueError):
        return 0.0


def compose_address(r) -> str | None:
    """Build a single-line address from the MdDob address columns.

    Legacy layout: ULICA is the street + number, ULICAPLUS an occasional overflow
    line (the DOS field is width-limited, so a long street spills into it), PTT
    the postal code, and MESTO the town. When PTT is set MESTO is the bare town
    ("Novi Beograd"); when PTT is blank the postal code is folded into MESTO
    ("11080 Zemun"). We join them as "<street>, <postal> <town>", dropping any
    part the record leaves blank, and return None when there is nothing at all.
    """
    street = clean(r.get("ULICA"))
    plus = clean(r.get("ULICAPLUS"))
    if plus:
        # ULICAPLUS continues a truncated ULICA, so join with a space.
        street = (street + " " + plus).strip()
    ptt = clean(r.get("PTT"))
    mesto = clean(r.get("MESTO"))
    city = (ptt + " " + mesto).strip() if ptt else mesto
    parts = [p for p in (street, city) if p]
    return ", ".join(parts) or None


def write_seed_file(path: str, seed: dict) -> None:
    out_dir = os.path.dirname(path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(seed, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


# --- converters ---


def convert_customers(src: str):
    """MdDob -> (customers, locations). Keep every named firm; carry PIB/MB only
    when they pass Serbian validation so the seed never trips the API validators.

    Customer has no address field of its own, so the firm's registered address
    becomes a single "Sediste" location per customer (Location.address is where
    the work-order registry panel reads it from). Firms whose legacy record has
    no address at all get no location rather than an empty one.
    """
    customers = []
    locations = []
    seen = set()
    for r in table(src, "MdDob"):
        name = clean_name(r.get("NAZIV"))
        sifra = clean(r.get("SIFRA"))
        if not name or not sifra or sifra in seen:
            continue
        seen.add(sifra)

        pib = clean(r.get("PIB"))
        mb = clean(r.get("MATBR"))
        # Phone/contact: legacy KONTAKT + TEL are inconsistent; prefer KONTAKT.
        contact = opt(r.get("KONTAKT"))
        phone = opt(r.get("TEL"))
        customers.append(
            {
                "id": f"cust-{sifra}",
                "name": name,
                "contactName": contact,
                "email": None,
                "phone": phone,
                "pib": pib if valid_pib(pib) else None,
                "mb": mb if valid_mb(mb) else None,
            }
        )

        address = compose_address(r)
        if address:
            locations.append(
                {
                    "id": f"loc-{sifra}",
                    "customerId": f"cust-{sifra}",
                    "name": "Sedište",
                    "address": address,
                }
            )
    customers.sort(key=lambda c: c["name"].lower())
    locations.sort(key=lambda location: location["id"])
    return customers, locations


UNIT_MAP = {
    "kom": "kom",
    "set": "set",
    "m2": "m2",
    "tab": "tab",
    "ris": "ris",
    "čas": "cas",
    "cas": "cas",
    "sat": "sat",
    "str": "str",
    "kg": "kg",
    "mix": "mix",
}


def normalize_unit(raw: str) -> str:
    unit = clean(raw).lower()
    return UNIT_MAP.get(unit, unit or "kom")


# --- Catalog kind classifier -----------------------------------------------
# The legacy USLUGA flag is unreliable: it marks almost the whole catalog as a
# service, including bought-in promo goods. We refine the split by name. A work
# verb ("štampa", "gravura", "izrada"...) always wins -> service, even when a
# product noun is present ("Majice sa štampom" is the printing service, not the
# shirt). Otherwise a promo-brand token, a resale-goods noun, or the legacy
# USLUGA=article flag marks the row an article (bought-in / stocked merchandise).
_SERVICE_MARKERS = (
    "štamp", "uslug", "izrad", "gravur", "gravir", "urezivan", "brendir",
    "rebrendir", "priprem", "dizajn", "koričen", "ukoričen", "plastifik",
    "laminac", "laminir", "sečenj", "kaširan", "montaž", "reparac", "servis",
    "presvlačen", "numerac", "numeric", "obrad", "kater", "perforac", "biforma",
    "savijan", "heftan", "spiral", "tampon", "sito",
)
_GOODS_NOUNS = (
    "upaljač", "olovk", "privez", "rokovnik", "notes", "torb", "kesa", "ranac",
    "tašn", "novčanik", "futrola", "šolj", "krigla", "čaša", "usb", "power bank",
    "powerbank", "kišobran", "kačket", "kapa", "majic", "magnet", "bedž",
    "značk", "narukvic", "eva pena", "flomaster", "bojic", "sveska", "termos",
    "ceger", "vrećic", "kaiš", "ogledalc", "pločic", "čokolad", "bombon",
    "otvarač", "skalpel", "name tag",
)


def _is_brand_token(name: str) -> bool:
    """ALLCAPS first token (>=3 letters) — the promo-supplier brand pattern
    ('ASTANA upaljač', 'FLORIDA torba')."""
    tokens = name.split()
    return bool(tokens) and tokens[0].isalpha() and tokens[0].isupper() and len(tokens[0]) >= 3


def catalog_kind(name: str, usluga_flag) -> str:
    lowered = name.lower()
    if any(marker in lowered for marker in _SERVICE_MARKERS):
        return "service"
    legacy_article = not usluga_flag  # USLUGA truthy == legacy service
    if _is_brand_token(name) or any(noun in lowered for noun in _GOODS_NOUNS) or legacy_article:
        return "article"
    return "service"


def convert_catalog(src: str):
    """MdArt -> catalog items. `kind` comes from the reviewed override file when
    the code is present there, else it is refined by name via catalog_kind()
    rather than trusting the unreliable legacy USLUGA flag alone."""
    kind_review = load_kind_review()
    items = []
    seen = set()
    for r in table(src, "MdArt"):
        name = clean_name(r.get("NAZIV"))
        sifra = clean(r.get("SIFRA"))
        if not name or not sifra or sifra in seen:
            continue
        seen.add(sifra)

        kind = kind_review.get(sifra) or catalog_kind(name, r.get("USLUGA"))

        sale = parse_price(r.get("PRODCEN"))
        # Cost/purchase price: nabavna cena for articles, cena rada for services.
        # The legacy MdArt column name varies across exports, so try a few.
        purchase = 0.0
        for col in ("NABCEN", "NABCENA", "NABAVNA", "NABCENE"):
            purchase = parse_price(r.get(col))
            if purchase > 0:
                break

        items.append(
            {
                "id": f"cat-{sifra}",
                "code": sifra,
                "name": name,
                "kind": kind,
                "unit": normalize_unit(r.get("JMERE")),
                "purchasePrice": purchase if purchase > 0 else None,
                "salePrice": sale if sale > 0 else None,
                "barcode": opt(r.get("BARCODE")),
                "taxGroup": opt(r.get("TARGR")),
                "description": opt(r.get("OPIS")),
                "isActive": True,
            }
        )
    items.sort(key=lambda i: i["name"].lower())
    return items


def convert_work_orders(src: str, customers, catalog):
    """OT*.dbf hold line items but no client linkage, so we build a small set of
    demo work orders: attach each to a sample client, map line items onto catalog
    items by exact name when possible (else leave catalogItemId null, i.e. an
    ad-hoc/"special" service), and append one explicit ad-hoc line."""
    if not customers or not catalog:
        return []

    by_name = {i["name"].lower(): i for i in catalog}
    ot_files = sorted(
        f[:-4]
        for f in os.listdir(src)
        if f.upper().startswith("OT") and f.lower().endswith(".dbf")
    )

    statuses = ["completed", "inProgress", "new", "assigned", "invoiced"]
    orders = []
    for index, ot in enumerate(ot_files[:8]):
        rows = list(table(src, ot))
        if not rows:
            continue
        customer = customers[(index * 37) % len(customers)]
        status = statuses[index % len(statuses)]
        issue_date = f"2026-0{(index % 6) + 1}-1{index % 9}"

        line_items = []
        total = 0.0
        for li, row in enumerate(rows[:6]):
            desc = clean(row.get("NAZART"))
            if not desc:
                continue
            qty = row.get("KOLICINA") or 1
            price = row.get("PRODCEN") or 0
            try:
                qty = max(1, int(float(qty)))
            except (TypeError, ValueError):
                qty = 1
            try:
                price = float(price)
            except (TypeError, ValueError):
                price = 0.0
            match = by_name.get(desc.lower())
            line_items.append(
                {
                    "id": f"li-{ot}-{li}",
                    "kind": "service",
                    "description": desc,
                    "quantity": qty,
                    "unit": normalize_unit(row.get("JMERE")),
                    "unitPrice": price,
                    "catalogItemId": match["id"] if match else None,
                }
            )
            total += qty * price

        # One explicit ad-hoc ("special") service not present in the catalog.
        line_items.append(
            {
                "id": f"li-{ot}-special",
                "kind": "service",
                "description": "Posebna usluga (hitna dorada po dogovoru)",
                "quantity": 1,
                "unit": "kom",
                "unitPrice": 1500.0,
                "catalogItemId": None,
            }
        )
        total += 1500.0

        order_number = f"RN-2026-{index + 1:04d}"
        orders.append(
            {
                "id": str(index + 1),
                "orderNumber": order_number,
                "customerId": customer["id"],
                "locationId": None,
                "clientName": customer["name"],
                "contactPerson": customer.get("contactName"),
                "jobDescription": line_items[0]["description"] if line_items else "Štamparske usluge",
                "issuedBy": "admin",
                "issueDate": issue_date,
                "dueDate": None,
                "status": status,
                "price": round(total, 2),
                "note": None,
                "invoiceDraft": {
                    "status": "draft",
                    "invoiceNumber": None,
                    "lineItems": line_items,
                    "paidAt": None,
                },
            }
        )
    return orders


def main() -> None:
    # Default output is the git-ignored ./data/seed.json next to this script.
    default_out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "seed.json")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", required=True, help="folder containing the .dbf export")
    parser.add_argument(
        "--out",
        default=default_out,
        help="output seed file path (default: ./data/seed.json)",
    )
    args = parser.parse_args()

    print("Converting Čobanović export:")
    customers, locations = convert_customers(args.src)
    catalog = convert_catalog(args.src)
    work_orders = convert_work_orders(args.src, customers, catalog)

    seed = {
        "customers": customers,
        "locations": locations,
        "catalogItems": catalog,
        "workOrders": work_orders,
    }
    write_seed_file(args.out, seed)

    services = sum(1 for i in catalog if i["kind"] == "service")
    with_pib = sum(1 for c in customers if c["pib"])
    print(
        f"Done -> {args.out}\n"
        f"  {len(customers)} customers ({with_pib} with valid PIB), "
        f"{len(locations)} locations with address, "
        f"{len(catalog)} catalog items ({services} services), "
        f"{len(work_orders)} demo work orders."
    )


if __name__ == "__main__":
    main()
