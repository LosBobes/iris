# Vendor invoices and offers (`irisctl invoice`, `irisctl offer`)

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
  -item "Iris - mesečna pretplata (oktobar 2026);MES;1;24.000" \
  -item "Iris - obuka zaposlenih;SAT;6;4.500;10" \
  -out racun-26-PW0001.pdf
```

- `-tenant <slug>` fills the buyer from that organization's e-invoicing
  identity (Settings, `sellerIdentity`) in the database (`DATABASE_PATH` /
  `DATABASE_URL`); without it, or to override a field, use `-buyer-name`,
  `-buyer-street`, `-buyer-postal`, `-buyer-city`, `-buyer-pib`, `-buyer-mb`.
- `-item "naziv;jm;količina;cena[;rabat%][;pdv%][;šifra]"`, repeatable. Numbers
  use the Serbian notation (`24.000`, `5.874,74`); a lone decimal dot also works.
  The VAT column defaults to `-vat` (20).
- `-due YYYY-MM-DD` or `-due-days N` (default 8) sets the payment date,
  `-supply-date` the date of supply, `-place` the place of issue (default: the
  seller's city), `-note` an extra note, `-model 00` a plain reference, `-html`
  writes the HTML instead of the PDF.

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
  -item "Iris - godišnja pretplata;MES;12;24.000;10" \
  -item "Iris - obuka zaposlenih;SAT;8;4.500"
```

- `-valid-until YYYY-MM-DD` or `-valid-days N` (default 15) sets the validity
  date.
- `-payment` defaults to "Po ispostavljenom računu, u roku od 8 dana";
  `-delivery` is printed only when it is set.
- The output defaults to `ponuda-<broj>.pdf`.
