// Package invoice builds the sales invoice (račun) the Iris vendor issues to a
// client organization for the software, rendered as A4 HTML/PDF in the layout
// of a classic Serbian "račun": seller header, buyer box, line items, tax
// specification, amount recapitulation, payment slip data and signatures.
//
// It is a vendor tool driven by `irisctl invoice`; nothing here is part of the
// tenant-facing API or the e-invoicing (SEF) module.
package invoice

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Party is one side of the invoice. The seller additionally carries the
// contact and payment details printed in the header.
type Party struct {
	Name       string `json:"name"`
	Street     string `json:"street"`
	PostalCode string `json:"postalCode"`
	City       string `json:"city"`
	Pib        string `json:"pib"`
	Mb         string `json:"mb"`

	// Seller only.
	Phone       string `json:"phone,omitempty"`
	Email       string `json:"email,omitempty"`
	Website     string `json:"website,omitempty"`
	BankAccount string `json:"bankAccount,omitempty"`
	BankName    string `json:"bankName,omitempty"`
	// VatPayer reports whether the seller is in the VAT system. When false,
	// every line is VAT-free and the exemption note is printed.
	VatPayer bool `json:"vatPayer"`
	// AuthorizedPerson signs the invoice ("Ovlašćeno lice").
	AuthorizedPerson string `json:"authorizedPerson,omitempty"`
	// Activity is the registered activity line under the name, e.g.
	// "Računarsko programiranje (6201)".
	Activity string `json:"activity,omitempty"`
}

// Item is one invoice line. Price is the unit price without VAT.
type Item struct {
	Code     string
	Name     string
	Unit     string
	Quantity float64
	Price    float64
	// DiscountPercent is the rabat on the line.
	DiscountPercent float64
	// VatPercent is the VAT rate (20, 10 or 0). Ignored for a seller outside
	// the VAT system.
	VatPercent float64
}

// Invoice is everything printed on the document.
type Invoice struct {
	Number       string
	IssueDate    string // YYYY-MM-DD
	SupplyDate   string // YYYY-MM-DD, datum prometa
	DueDate      string // YYYY-MM-DD, valuta plaćanja
	IssuePlace   string
	SupplyPlace  string
	ContractRef  string // optional "Broj ugovora / ponude"
	PartnerCode  string // optional šifra partnera
	Seller       Party
	Buyer        Party
	Items        []Item
	Note         string
	PaymentModel string // "97" (computed control) or "00"
}

// vatExemptNote is printed when the seller is outside the VAT system.
const vatExemptNote = "PDV nije obračunat na fakturi u skladu sa članom 33. Zakona o PDV-u."

// LoadSeller reads the seller identity from a JSON file (see
// deploy/invoice/seller.example.json).
func LoadSeller(path string) (Party, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Party{}, fmt.Errorf("podaci o prodavcu: %w", err)
	}
	var seller Party
	if err := json.Unmarshal(raw, &seller); err != nil {
		return Party{}, fmt.Errorf("podaci o prodavcu (%s): %w", path, err)
	}
	return seller, nil
}

// ParseItem reads a line given on the command line as
// "naziv;jm;količina;cena[;rabat%][;pdv%][;šifra]". Numbers accept a decimal
// comma or dot. defaultVat applies when the VAT column is omitted.
func ParseItem(spec string, defaultVat float64) (Item, error) {
	parts := strings.Split(spec, ";")
	if len(parts) < 4 || len(parts) > 7 {
		return Item{}, fmt.Errorf("stavka %q: očekivano naziv;jm;količina;cena[;rabat%%][;pdv%%][;šifra]", spec)
	}
	item := Item{
		Name:       strings.TrimSpace(parts[0]),
		Unit:       strings.TrimSpace(parts[1]),
		VatPercent: defaultVat,
	}
	numbers := []*float64{&item.Quantity, &item.Price, &item.DiscountPercent, &item.VatPercent}
	labels := []string{"količina", "cena", "rabat", "PDV"}
	for i, raw := range parts[2:min(len(parts), 6)] {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		value, err := parseNumber(raw)
		if err != nil {
			return Item{}, fmt.Errorf("stavka %q: %s %q nije broj", spec, labels[i], raw)
		}
		*numbers[i] = value
	}
	if len(parts) == 7 {
		item.Code = strings.TrimSpace(parts[6])
	}
	return item, nil
}

// thousandsGrouped matches a Serbian number with dot-separated thousands,
// e.g. "24.000" or "1.234.567,89".
var thousandsGrouped = regexp.MustCompile(`^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$`)

// parseNumber reads the Serbian notation ("24.000", "1.234,56", "1234,56");
// a lone dot that is not a thousands separator is a decimal point ("5874.74",
// "0.5").
func parseNumber(raw string) (float64, error) {
	raw = strings.TrimSuffix(strings.TrimSpace(raw), "%")
	if strings.Contains(raw, ",") || thousandsGrouped.MatchString(raw) {
		raw = strings.ReplaceAll(raw, ".", "")
		raw = strings.ReplaceAll(raw, ",", ".")
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, errors.New("not a number")
	}
	return value, nil
}

// Validate reports the first problem that would make the invoice unusable.
func (inv Invoice) Validate() error {
	s := inv.Seller
	switch {
	case strings.TrimSpace(inv.Number) == "":
		return errors.New("broj računa je obavezan (-number)")
	case strings.TrimSpace(s.Name) == "":
		return errors.New("prodavac: naziv je obavezan")
	case !domain.ValidatePIB(s.Pib):
		return fmt.Errorf("prodavac: PIB %q nije ispravan (9 cifara sa kontrolnom cifrom); proverite podatke iz APR-a u fajlu prodavca", s.Pib)
	case !domain.ValidateMB(s.Mb):
		return fmt.Errorf("prodavac: matični broj %q nije ispravan (8 cifara)", s.Mb)
	case strings.TrimSpace(s.BankAccount) == "":
		return errors.New("prodavac: tekući račun je obavezan")
	case strings.TrimSpace(inv.Buyer.Name) == "":
		return errors.New("kupac: naziv je obavezan (-buyer-name ili -tenant)")
	case inv.Buyer.Pib != "" && !domain.ValidatePIB(inv.Buyer.Pib):
		return fmt.Errorf("kupac: PIB %q nije ispravan", inv.Buyer.Pib)
	case inv.Buyer.Mb != "" && !domain.ValidateMB(inv.Buyer.Mb):
		return fmt.Errorf("kupac: matični broj %q nije ispravan", inv.Buyer.Mb)
	case len(inv.Items) == 0:
		return errors.New("račun mora imati bar jednu stavku (-item)")
	}
	for i, item := range inv.Items {
		switch {
		case item.Name == "":
			return fmt.Errorf("stavka %d: naziv je obavezan", i+1)
		case item.Quantity <= 0:
			return fmt.Errorf("stavka %d: količina mora biti veća od nule", i+1)
		case item.Price < 0:
			return fmt.Errorf("stavka %d: cena ne može biti negativna", i+1)
		case item.DiscountPercent < 0 || item.DiscountPercent > 100:
			return fmt.Errorf("stavka %d: rabat mora biti između 0 i 100%%", i+1)
		case s.VatPayer && item.VatPercent != 0 && item.VatPercent != 10 && item.VatPercent != 20:
			return fmt.Errorf("stavka %d: stopa PDV-a mora biti 20, 10 ili 0", i+1)
		}
	}
	for _, date := range []string{inv.IssueDate, inv.SupplyDate, inv.DueDate} {
		if _, err := time.Parse(time.DateOnly, date); err != nil {
			return fmt.Errorf("datum %q mora biti u obliku GGGG-MM-DD", date)
		}
	}
	return nil
}

// Line is an item with its amounts computed, in para (1/100 RSD).
type Line struct {
	Item
	Base     int64 // after discount, without VAT
	Discount int64
	Vat      int64
	Total    int64
}

// Totals is the amount recapitulation and the per-rate tax specification.
type Totals struct {
	Lines    []Line
	Gross    int64 // before discount
	Discount int64
	Base     int64
	Vat      int64
	Total    int64
	// Base and VAT per rate (20, 10) and the VAT-free base.
	Base20, Vat20, Base10, Vat10, BaseFree int64
}

func toPara(value float64) int64 { return int64(math.Round(value * 100)) }

// Compute rounds every line to the para before summing, so the printed lines
// always add up to the printed totals.
func (inv Invoice) Compute() Totals {
	var t Totals
	for _, item := range inv.Items {
		if !inv.Seller.VatPayer {
			item.VatPercent = 0
		}
		gross := toPara(item.Quantity * item.Price)
		base := toPara(item.Quantity * item.Price * (1 - item.DiscountPercent/100))
		vat := int64(math.Round(float64(base) * item.VatPercent / 100))
		line := Line{Item: item, Base: base, Discount: gross - base, Vat: vat, Total: base + vat}
		t.Lines = append(t.Lines, line)
		t.Gross += gross
		t.Discount += line.Discount
		t.Base += base
		t.Vat += vat
		t.Total += line.Total
		switch item.VatPercent {
		case 20:
			t.Base20 += base
			t.Vat20 += vat
		case 10:
			t.Base10 += base
			t.Vat10 += vat
		default:
			t.BaseFree += base
		}
	}
	return t
}

// ReferenceNumber is the "poziv na broj" for the payment slip. Model 97
// prefixes the digits of the invoice number with their ISO 7064 MOD 97-10
// control pair; model 00 uses the invoice number as is.
func (inv Invoice) ReferenceNumber() (model, reference string) {
	if inv.PaymentModel != "97" {
		return "00", inv.Number
	}
	var digits strings.Builder
	for _, r := range inv.Number {
		if r >= '0' && r <= '9' {
			digits.WriteRune(r)
		}
	}
	if digits.Len() == 0 {
		return "00", inv.Number
	}
	return "97", Model97(digits.String())
}

// Model97 returns the reference with its two leading control digits:
// 98 - (number·100 mod 97).
func Model97(number string) string {
	rem := 0
	for _, r := range number + "00" {
		rem = (rem*10 + int(r-'0')) % 97
	}
	return fmt.Sprintf("%02d%s", 98-rem, number)
}
