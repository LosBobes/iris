# Vendor invoices (`irisctl invoice`)

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
