# Vendor invoices, proformas and offers (`irisctl invoice`, `irisctl proforma`, `irisctl offer`)

`irisctl invoice` prints the sales invoice (račun) Pingwin Software issues to a
client organization for Iris, as an A4 PDF in the layout of a classic Serbian
račun: seller header, buyer box, line items, tax specification, amount
recapitulation, payment data (model 97 reference) and signatures. It renders
through the same headless Chromium as the work-order printout
(`IRIS_CHROME_PATH` pins the binary).

## Seller

Copy `seller.example.json` to `seller.json` (git-ignored) and fill it in from
the APR registry: registered name, address, PIB, MB, current account and
whether the company is in the VAT system (`vatPayer`). Outside the VAT system
every line is VAT-free and the invoice carries the article 33 exemption note.
The command refuses a seller without a valid PIB/MB or account.

## Example

```bash
cd iris-api
go run ./cmd/irisctl invoice -seller ../deploy/invoice/seller.json \
  -number 26-PW0001 -date 2026-10-22 -due-days 8 \
  -tenant cobanovic -partner-code 00001 \
  -contract "Ugovor o licenci br. 01/2026" \
  -modules pro -period "oktobar 2026" -discount 30
```

The licence goes on its own invoice, once:

```bash
go run ./cmd/irisctl invoice -seller ../deploy/invoice/seller.json \
  -number 26-PW0002 -tenant cobanovic -modules pro -bill licenca -discount 30
```

## Licences, subscription and discounts

Iris is billed as a one-time **licence per module** (it covers onboarding)
plus a **monthly subscription** that grows by a small fee per module:

| Line | Default |
| --- | --- |
| Licence per module, one-time (`IR-L…`, one line per module) | 12.500 RSD (`-licence-price`) |
| Subscription, base system (`IR-PRE`) | 3.900 RSD a month (Osnovni on the landing page) |
| Subscription, per module (`IR-PMO`, quantity = number of modules) | 300 RSD a month (`-module-fee`) |
| Extra user over 5 (`IR-KOR`) | 490 RSD a month |

- `-modules magacin,procesi,efakture,eotpremnice,prisustvo,planiranje` picks
  the client's modules; `osnovni`, `proizvodnja` and `pro` are shortcuts for
  the landing page plans' module sets.
- `-bill licenca|pretplata|oba` (default `pretplata`): the licence invoice is
  issued once, the subscription every period.
- `-billing mesecno|kvartalno|godisnje`: quarterly bills 3 months, annual 10
  months for 12.
- `-period "oktobar 2026"` is appended to the base line.
- `-extra-users N` adds users over the 5 included.
- `-discount N` is the client's rabat in percent. It applies to every line
  without its own rabat, e.g. `-discount 30` for Grafika Čobanović.
- `-item` lines can be added next to these (extra work, field days).

A test in `internal/invoice` fails when the base subscription or the
extra-user price drift from `apps/web/src/components/home/PricingPlans.tsx`.

## Proformas (`irisctl proforma`)

`irisctl proforma` prints a profaktura (advance payment request) with the same
flags as `irisctl invoice`. It keeps the payment slip (model 97 reference) but
has no supply date, shows "Rok za uplatu" and notes that it is not a tax
document and that the račun follows the payment. The output defaults to
`profaktura-<broj>.pdf`.

```bash
go run ./cmd/irisctl proforma -seller ../deploy/invoice/seller.json \
  -number 26-PF0001 -tenant cobanovic -modules osnovni -bill pretplata -discount 30
```

## Offers (`irisctl offer`)

`irisctl offer` prints a ponuda in the same layout and with the same seller,
buyer and `-item` flags. Instead of the payment slip it has "Uslovi ponude":
validity, payment terms, delivery time and the account. The acceptance
signature reads "prihvata, za kupca".

```bash
go run ./cmd/irisctl offer -seller ../deploy/invoice/seller.json \
  -number 26-PN0001 -tenant cobanovic -valid-days 15 \
  -payment "Avansno, 50% pri prihvatanju ponude" \
  -delivery "10 radnih dana od prihvatanja ponude" \
  -modules pro -bill oba -billing godisnje -discount 30 \
  -item "Dorada po satu;SAT;8;6.000"
```

- `-valid-until YYYY-MM-DD` or `-valid-days N` (default 15) sets the validity
  date.
- `-payment` defaults to "Po ispostavljenom računu, u roku od 8 dana";
  `-delivery` is printed only when it is set.
- The output defaults to `ponuda-<broj>.pdf`.
