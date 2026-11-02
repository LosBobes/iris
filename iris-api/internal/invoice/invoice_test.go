package invoice

import (
	"strings"
	"testing"
)

func testSeller(vatPayer bool) Party {
	return Party{
		Name: "PINGWIN SOFTWARE DOO BEOGRAD", Street: "Test 1", PostalCode: "11000", City: "Beograd",
		Pib: "100267987", Mb: "07364652", BankAccount: "265-1680310005126-07", VatPayer: vatPayer,
	}
}

func testInvoice(vatPayer bool, items ...Item) Invoice {
	return Invoice{
		Number: "26-PW0001", IssueDate: "2026-10-05", SupplyDate: "2026-10-05", DueDate: "2026-10-13",
		Seller: testSeller(vatPayer), Buyer: Party{Name: "GRAFIKA DOO"}, Items: items, PaymentModel: "97",
	}
}

func TestParseItem(t *testing.T) {
	item, err := ParseItem("Iris pretplata;MES;1;12.500,50;10;;IR-01", 20)
	if err != nil {
		t.Fatal(err)
	}
	if item.Name != "Iris pretplata" || item.Unit != "MES" || item.Quantity != 1 || item.Price != 12500.5 ||
		item.DiscountPercent != 10 || item.VatPercent != 20 || item.Code != "IR-01" {
		t.Fatalf("unexpected item %+v", item)
	}
	if _, err := ParseItem("bez cene;SAT;2", 20); err == nil {
		t.Fatal("expected an error for a missing price")
	}
	if _, err := ParseItem("x;SAT;dva;100", 20); err == nil {
		t.Fatal("expected an error for a non-numeric quantity")
	}
}

func TestParseNumber(t *testing.T) {
	cases := map[string]float64{
		"24.000": 24000, "1.234.567,89": 1234567.89, "1234,5": 1234.5, "5874.74": 5874.74,
		"0.500": 0.5, "12": 12, "10%": 10,
	}
	for raw, want := range cases {
		got, err := parseNumber(raw)
		if err != nil || got != want {
			t.Errorf("parseNumber(%q) = %v, %v; want %v", raw, got, err, want)
		}
	}
	for _, raw := range []string{"", "abc", "1,2,3", "NaN"} {
		if _, err := parseNumber(raw); err == nil {
			t.Errorf("parseNumber(%q) should fail", raw)
		}
	}
}

func TestComputeMatchesSampleWithoutVat(t *testing.T) {
	inv := testInvoice(false,
		Item{Name: "a", Unit: "SAT", Quantity: 2, Price: 5874.74, VatPercent: 20},
		Item{Name: "b", Unit: "SAT", Quantity: 24, Price: 5874.74, VatPercent: 20},
	)
	totals := inv.Compute()
	if got := FormatMoney(totals.Total); got != "152.743,24" {
		t.Fatalf("total = %s", got)
	}
	if totals.Vat != 0 || totals.BaseFree != totals.Total {
		t.Fatalf("a seller outside the VAT system must not charge VAT: %+v", totals)
	}
}

func TestComputeVatAndDiscount(t *testing.T) {
	inv := testInvoice(true,
		Item{Name: "a", Unit: "MES", Quantity: 1, Price: 10000, DiscountPercent: 10, VatPercent: 20},
		Item{Name: "b", Unit: "KOM", Quantity: 3, Price: 100, VatPercent: 10},
	)
	totals := inv.Compute()
	if totals.Gross != 1030000 || totals.Discount != 100000 || totals.Base != 930000 {
		t.Fatalf("bases: %+v", totals)
	}
	if totals.Vat20 != 180000 || totals.Vat10 != 3000 || totals.Total != 1113000 {
		t.Fatalf("vat: %+v", totals)
	}
}

func TestModel97(t *testing.T) {
	// 98 - (2600001·100 mod 97) = 98 - 39 = 59; 260000159 mod 97 = 1 checks it.
	if got := Model97("2600001"); got != "592600001" {
		t.Fatalf("Model97 = %s", got)
	}
	model, ref := testInvoice(false).ReferenceNumber()
	if model != "97" || ref != "72260001" {
		t.Fatalf("reference = %s %s", model, ref)
	}
}

func TestValidate(t *testing.T) {
	valid := testInvoice(false, Item{Name: "a", Unit: "MES", Quantity: 1, Price: 1})
	if err := valid.Validate(); err != nil {
		t.Fatalf("valid invoice rejected: %v", err)
	}
	placeholder := valid
	placeholder.Seller.Pib = "PIB IZ APR-a"
	if err := placeholder.Validate(); err == nil || !strings.Contains(err.Error(), "PIB") {
		t.Fatalf("expected a seller PIB error, got %v", err)
	}
	noItems := valid
	noItems.Items = nil
	if err := noItems.Validate(); err == nil {
		t.Fatal("expected an error without items")
	}
}

func TestFormatting(t *testing.T) {
	cases := map[string]string{
		FormatMoney(38773284):    "387.732,84",
		FormatMoney(5):           "0,05",
		formatQuantity(2):        "2,000",
		formatQuantity(1234.5):   "1.234,500",
		formatPercent(20):        "20",
		formatPercent(2.5):       "2,5",
		formatDate("2026-10-05"): "05.10.2026",
	}
	for got, want := range cases {
		if got != want {
			t.Errorf("got %q, want %q", got, want)
		}
	}
}

func TestRenderHTML(t *testing.T) {
	html, err := RenderHTML(testInvoice(false, Item{Name: "Iris pretplata", Unit: "MES", Quantity: 1, Price: 12000}))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"Račun br. 26-PW0001", "GRAFIKA DOO", "12.000,00", "72260001", "članom 33"} {
		if !strings.Contains(html, want) {
			t.Errorf("HTML is missing %q", want)
		}
	}
}

func TestRenderOfferHTML(t *testing.T) {
	offer := testInvoice(false, Item{Name: "Iris pretplata", Unit: "MES", Quantity: 12, Price: 24000})
	offer.Kind = KindOffer
	offer.PaymentTerms = "Avansno"
	offer.DeliveryTerms = "10 radnih dana"
	html, err := RenderHTML(offer)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"Ponuda br. 26-PW0001", "Ponuda važi do:", "13.10.2026", "Avansno", "10 radnih dana", "UKUPNA VREDNOST PONUDE", "288.000,00", "(prihvata, za kupca)"} {
		if !strings.Contains(html, want) {
			t.Errorf("offer HTML is missing %q", want)
		}
	}
	for _, unwanted := range []string{"Račun br.", "Poziv na broj", "Faktura je važeća", "na fakturi"} {
		if strings.Contains(html, unwanted) {
			t.Errorf("offer HTML must not contain %q", unwanted)
		}
	}
}

func TestRenderProformaHTML(t *testing.T) {
	proforma := testInvoice(false, Item{Name: "Iris licenca", Unit: "KOM", Quantity: 1, Price: 50000})
	proforma.Kind = KindProforma
	html, err := RenderHTML(proforma)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"Profaktura br. 26-PW0001", "Rok za uplatu:", "Broj profakture", "Poziv na broj", "nije poreski dokument", "50.000,00"} {
		if !strings.Contains(html, want) {
			t.Errorf("proforma HTML is missing %q", want)
		}
	}
	for _, unwanted := range []string{"Račun br.", "Datum prometa", "Faktura je važeća"} {
		if strings.Contains(html, unwanted) {
			t.Errorf("proforma HTML must not contain %q", unwanted)
		}
	}
}
