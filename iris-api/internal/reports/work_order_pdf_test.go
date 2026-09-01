package reports

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func ptr[T any](v T) *T {
	return &v
}

// printSettings builds organization settings for the render tests, defaulting
// everything a given test does not care about.
func printSettings(
	sections domain.PDFSections,
	firmName string,
	billingDefaults domain.BillingDefaults,
) domain.OrganizationSettings {
	return domain.OrganizationSettings{
		FirmName:         firmName,
		PDFSections:      sections,
		BillingDefaults:  billingDefaults,
		PriorityDefaults: domain.DefaultPriorityDefaults(),
		PrintItemColumns: domain.DefaultPrintItemColumns(),
	}
}

func TestPrintHelpers(t *testing.T) {
	// 1. Delivery method check rows
	pickup := domain.DeliveryMethodPickup
	deliveryRows := getPrintDeliveryRows(domain.Shipping{DeliveryMethod: &pickup}, nil)
	if len(deliveryRows) != 10 {
		t.Fatalf("expected 10 delivery rows, got %d", len(deliveryRows))
	}
	if !deliveryRows[1].Checked || deliveryRows[1].Label != "LIČNO" {
		t.Errorf("expected row 1 (LIČNO) to be checked, got %+v", deliveryRows[1])
	}
	if deliveryRows[0].Checked || deliveryRows[0].Label != "VOZI SE" {
		t.Errorf("expected row 0 (VOZI SE) to be unchecked, got %+v", deliveryRows[0])
	}

	// 2. Billing document check rows
	invoice := domain.BillingDocumentTypeInvoice
	billingRows := getPrintBillingRows(&invoice, nil, false)
	if len(billingRows) != 4 {
		t.Fatalf("expected 3 document-type rows + PLAĆENO, got %d", len(billingRows))
	}
	if !billingRows[0].Checked || billingRows[0].Label != "FAKTURA" {
		t.Errorf("expected row 0 (FAKTURA) to be checked, got %+v", billingRows[0])
	}

	proforma := domain.BillingDocumentTypeProforma
	billingRowsProforma := getPrintBillingRows(&proforma, nil, false)
	if !billingRowsProforma[2].Checked || billingRowsProforma[2].Label != "PROFAKTURA" {
		t.Errorf("expected row 2 (PROFAKTURA) to be checked, got %+v", billingRowsProforma[2])
	}

	// 3. Price formatting
	p1450 := 1450.0
	formattedPrice := formatPrintPrice(&p1450)
	if formattedPrice != "1.450 DINARA" {
		t.Errorf("expected '1.450 DINARA', got '%s'", formattedPrice)
	}

	p1450_5 := 1450.5
	formattedPriceDec := formatPrintPrice(&p1450_5)
	if formattedPriceDec != "1.450,5 DINARA" {
		t.Errorf("expected '1.450,5 DINARA', got '%s'", formattedPriceDec)
	}

	// 4. Date formatting
	dateStr := "2026-03-19"
	formattedDate := formatOptionalDate(&dateStr)
	if formattedDate != "19.03.2026." {
		t.Errorf("expected '19.03.2026.', got '%s'", formattedDate)
	}

	formattedDateNil := formatOptionalDate(nil)
	if formattedDateNil != "/" {
		t.Errorf("expected '/', got '%s'", formattedDateNil)
	}

	// 5. Job lines builder
	baseOrder := domain.WorkOrder{
		ID:             "rn-1",
		OrderNumber:    "RN-2026-00001",
		ClientName:     "Profesionalni Upravnik",
		JobDescription: "Vizit karte",
		Price:          &p1450,
	}

	orderWithDetails := baseOrder
	orderWithDetails.JobDetails = &domain.JobDetails{
		ProductCode:    ptr("VK"),
		PaperWeightGsm: ptr(350),
		Dimensions:     ptr("9x5"),
		Quantity:       ptr(200),
		FinishingNote:  ptr("Samo se seče"),
	}

	// The grand total is no longer part of the job lines; it renders separately
	// as "UKUPNA CENA" pinned to the bottom of the job panel.
	expectedDetailsLines := []string{
		"VK",
		"350G",
		"9X5",
		"200KOM",
		"SAMO SE SEČE",
	}
	detailsLines := buildPrintDescriptionLines(orderWithDetails)
	if !reflect.DeepEqual(detailsLines, expectedDetailsLines) {
		t.Errorf("expected description lines %v, got %v", expectedDetailsLines, detailsLines)
	}

	expectedFallbackLines := []string{
		"VIZIT KARTE",
	}
	fallbackLines := buildPrintDescriptionLines(baseOrder)
	if !reflect.DeepEqual(fallbackLines, expectedFallbackLines) {
		t.Errorf("expected fallback description lines %v, got %v", expectedFallbackLines, fallbackLines)
	}

	orderWithEmptyDetails := baseOrder
	orderWithEmptyDetails.JobDetails = &domain.JobDetails{}
	emptyDetailsLines := buildPrintDescriptionLines(orderWithEmptyDetails)
	if !reflect.DeepEqual(emptyDetailsLines, expectedFallbackLines) {
		t.Errorf("expected empty job details to fall back to description, got %v", emptyDetailsLines)
	}

	// 6. Line items (stavke) render as table rows with name, unit price, quantity,
	// and line-total columns. The description is not mixed in.
	orderWithItems := baseOrder
	orderWithItems.InvoiceDraft.LineItems = []domain.InvoiceLineItem{
		{Description: "Plakati A2", Quantity: 100, Unit: "kom", UnitPrice: 150},
		// Zero unit price (e.g. a non-admin stripped printout): price/total blank.
		{Description: "Kaširanje", Quantity: 100, Unit: "kom", UnitPrice: 0},
		// Fractional quantity for an area-billed service prints with a comma and
		// multiplies cleanly into the line total (1.5 * 1400 = 2100).
		{Description: "Ceradno platno", Quantity: 1.5, Unit: "m2", UnitPrice: 1400},
	}
	expectedItemRows := []PrintItemRow{
		{Name: "PLAKATI A2", UnitPrice: "150", Quantity: "100 KOM", Total: "15.000"},
		{Name: "KAŠIRANJE", UnitPrice: "", Quantity: "100 KOM", Total: ""},
		{Name: "CERADNO PLATNO", UnitPrice: "1.400", Quantity: "1,5 M2", Total: "2.100"},
	}
	itemRows := buildPrintItemRows(orderWithItems)
	if !reflect.DeepEqual(itemRows, expectedItemRows) {
		t.Errorf("expected item rows %v, got %v", expectedItemRows, itemRows)
	}

	// With no line items, the stavke panel is empty (nil slice).
	if got := buildPrintItemRows(baseOrder); len(got) != 0 {
		t.Errorf("expected no item rows for an order without line items, got %v", got)
	}
}

func TestResolveBillingDocumentType(t *testing.T) {
	invoice := domain.BillingDocumentTypeInvoice
	orderWithInvoice := domain.WorkOrder{BillingDocumentType: &invoice}
	orderWithNoType := domain.WorkOrder{}
	defaults := domain.BillingDefaults{DocumentType: domain.BillingDocumentTypeProforma}

	// The order's own choice wins.
	if got := resolveBillingDocumentType(orderWithInvoice, defaults); got == nil || *got != invoice {
		t.Errorf("expected order's invoice type, got %v", got)
	}
	// Legacy/imported orders without a type fall back to the shop default.
	if got := resolveBillingDocumentType(orderWithNoType, defaults); got == nil || *got != domain.BillingDocumentTypeProforma {
		t.Errorf("expected shop default proforma for typeless order, got %v", got)
	}
}

func TestRenderWorkOrderHTMLBillingDefault(t *testing.T) {
	order := domain.WorkOrder{
		OrderNumber:    "RN-2026-00001",
		ClientName:     "Profesionalni Upravnik",
		JobDescription: "Vizit karte",
		// No explicit document type, as with legacy/imported orders.
	}

	// A shop whose default is FAKTURA must tick FAKTURA on the printout even
	// though the order carries no type of its own.
	defaults := domain.BillingDefaults{DocumentType: domain.BillingDocumentTypeInvoice}
	html, err := RenderWorkOrderHTML(order, PrintContext{}, printSettings(domain.DefaultPDFSections(), "", defaults))
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if !strings.Contains(html, `<span>FAKTURA</span>`) {
		t.Fatalf("expected FAKTURA billing row in rendered sheet")
	}
	// The FAKTURA row's mark cell must carry the X.
	faktura := strings.Index(html, `<span>FAKTURA</span>`)
	after := html[faktura:]
	markStart := strings.Index(after, `work-order-print-mark">`)
	if markStart < 0 {
		t.Fatalf("could not locate FAKTURA mark cell")
	}
	mark := after[markStart+len(`work-order-print-mark">`):]
	if !strings.HasPrefix(strings.TrimSpace(mark), "X") {
		t.Errorf("expected FAKTURA to be ticked (X) for the shop default, got %q", mark[:1])
	}
}

func TestRenderWorkOrderHTMLSectionToggles(t *testing.T) {
	order := domain.WorkOrder{
		ID:             "rn-1",
		OrderNumber:    "RN-2026-00001",
		ClientName:     "Profesionalni Upravnik",
		JobDescription: "Vizit karte",
	}

	allSections := domain.DefaultPDFSections()
	full, err := RenderWorkOrderHTML(order, PrintContext{LocationAddress: ptr("Kneza Milosa 22, Beograd")}, printSettings(allSections, "Grafika Čobanović", domain.DefaultBillingDefaults()))
	if err != nil {
		t.Fatalf("render full: %v", err)
	}
	for _, marker := range []string{"VOZI SE", "FAKTURA", "NAPOMENA", "ADRESA ZA DOSTAVU", "IZDAO / IZVRŠILAC"} {
		if !strings.Contains(full, marker) {
			t.Errorf("full sheet missing %q", marker)
		}
	}
	// With the address box beside it, the row keeps its two-column layout.
	// (Match the class attribute, not the always-present CSS selector.)
	if strings.Contains(full, `work-order-print-notes-row work-order-print-notes-row-solo`) {
		t.Errorf("notes-row unexpectedly collapsed to solo while the address box is shown")
	}

	// With the shipping address switched off, the napomena box still renders and
	// takes the full row width via the -solo modifier.
	notesOnly := domain.DefaultPDFSections()
	notesOnly.ShippingAddress = false
	noAddr, err := RenderWorkOrderHTML(order, PrintContext{LocationAddress: ptr("Kneza Milosa 22, Beograd")}, printSettings(notesOnly, "", domain.DefaultBillingDefaults()))
	if err != nil {
		t.Fatalf("render notes-only: %v", err)
	}
	if !strings.Contains(noAddr, "NAPOMENA") {
		t.Errorf("notes-only sheet is missing NAPOMENA")
	}
	if strings.Contains(noAddr, "ADRESA ZA DOSTAVU") {
		t.Errorf("notes-only sheet still contains the shipping address box")
	}
	if !strings.Contains(noAddr, `work-order-print-notes-row work-order-print-notes-row-solo`) {
		t.Errorf("expected notes-row-solo class when the address box is hidden")
	}
	// The order number must be printed on the sheet (previously only in <title>).
	if !strings.Contains(full, `work-order-print-number">RN-2026-00001<`) {
		t.Errorf("full sheet missing printed order number")
	}
	// The client's location address renders in subscript under the client name.
	if !strings.Contains(full, `work-order-print-client-address">KNEZA MILOSA 22, BEOGRAD<`) {
		t.Errorf("full sheet missing client address subscript")
	}

	none, err := RenderWorkOrderHTML(order, PrintContext{}, printSettings(domain.PDFSections{}, "", domain.DefaultBillingDefaults()))
	if err != nil {
		t.Fatalf("render none: %v", err)
	}
	for _, marker := range []string{"VOZI SE", "FAKTURA", "ADRESA ZA DOSTAVU", "IZDAO / IZVRŠILAC"} {
		if strings.Contains(none, marker) {
			t.Errorf("disabled sheet still contains %q", marker)
		}
	}
	// The napomena box is not one of the toggles: with every optional section
	// off it still renders, so the form's napomena field always has a
	// destination on the sheet.
	if !strings.Contains(none, "NAPOMENA") {
		t.Errorf("disabled sheet dropped the non-toggleable NAPOMENA box")
	}
	// The client name (a non-configurable core field) must always render.
	if !strings.Contains(none, "PROFESIONALNI UPRAVNIK") {
		t.Errorf("disabled sheet dropped core client field")
	}
	// Hiding delivery collapses the body to the left stack alone.
	if !strings.Contains(none, "work-order-print-body-solo") {
		t.Errorf("expected body-solo class when delivery hidden")
	}
}

// TestRenderWorkOrderHTMLItemColumnOrder proves the stavke table follows the
// shop's configured column order, and that the default puts quantity ahead of
// price.
func TestRenderWorkOrderHTMLItemColumnOrder(t *testing.T) {
	order := domain.WorkOrder{
		OrderNumber:    "RN-2026-00001",
		ClientName:     "Profesionalni Upravnik",
		JobDescription: "Vizit karte",
	}
	order.InvoiceDraft.LineItems = []domain.InvoiceLineItem{
		{Description: "Plakati A2", Quantity: 100, Unit: "kom", UnitPrice: 150},
	}

	headerOrder := func(html string) []string {
		var headers []string
		for _, candidate := range []string{"KOL.", "CENA", "UKUPNO"} {
			headers = append(headers, candidate)
		}
		slices.SortFunc(headers, func(a, b string) int {
			return strings.Index(html, `col-num">`+a+`<`) - strings.Index(html, `col-num">`+b+`<`)
		})
		return headers
	}

	defaults, err := RenderWorkOrderHTML(order, PrintContext{},
		printSettings(domain.DefaultPDFSections(), "", domain.DefaultBillingDefaults()))
	if err != nil {
		t.Fatalf("render defaults: %v", err)
	}
	if got := headerOrder(defaults); !slices.Equal(got, []string{"KOL.", "CENA", "UKUPNO"}) {
		t.Fatalf("default header order = %v, want [KOL. CENA UKUPNO]", got)
	}
	// The cells must follow their headers, not stay in struct order.
	if qty, price := strings.Index(defaults, "100 KOM"), strings.Index(defaults, `col-num">150<`); qty > price {
		t.Errorf("default row puts price before quantity")
	}

	settings := printSettings(domain.DefaultPDFSections(), "", domain.DefaultBillingDefaults())
	settings.PrintItemColumns = []domain.PrintItemColumn{
		domain.PrintItemColumnUnitPrice,
		domain.PrintItemColumnQuantity,
		domain.PrintItemColumnTotal,
	}
	reordered, err := RenderWorkOrderHTML(order, PrintContext{}, settings)
	if err != nil {
		t.Fatalf("render reordered: %v", err)
	}
	if got := headerOrder(reordered); !slices.Equal(got, []string{"CENA", "KOL.", "UKUPNO"}) {
		t.Fatalf("reordered header order = %v, want [CENA KOL. UKUPNO]", got)
	}
	if qty, price := strings.Index(reordered, "100 KOM"), strings.Index(reordered, `col-num">150<`); price > qty {
		t.Errorf("reordered row puts quantity before price")
	}

	// An unconfigured shop (nil order) still gets all three columns.
	settings.PrintItemColumns = nil
	fallback, err := RenderWorkOrderHTML(order, PrintContext{}, settings)
	if err != nil {
		t.Fatalf("render fallback: %v", err)
	}
	if got := headerOrder(fallback); !slices.Equal(got, []string{"KOL.", "CENA", "UKUPNO"}) {
		t.Fatalf("fallback header order = %v, want the default order", got)
	}
}

func TestRenderWorkOrderHTMLTotalPrice(t *testing.T) {
	price := 1450.0
	order := domain.WorkOrder{
		OrderNumber:    "RN-2026-00001",
		ClientName:     "Profesionalni Upravnik",
		JobDescription: "Vizit karte",
		Price:          &price,
	}

	html, err := RenderWorkOrderHTML(order, PrintContext{}, printSettings(domain.DefaultPDFSections(), "", domain.DefaultBillingDefaults()))
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	// The total is labelled "UKUPNA CENA" and separated from the line entries.
	if !strings.Contains(html, `work-order-print-total">UKUPNA CENA: 1.450 DINARA<`) {
		t.Errorf("expected labelled total price in rendered sheet")
	}
}

func TestRenderWorkOrderPDF(t *testing.T) {
	p1450 := 1450.0
	baseOrder := domain.WorkOrder{
		ID:             "rn-1",
		OrderNumber:    "RN-2026-00001",
		ClientName:     "Profesionalni Upravnik",
		JobDescription: "Vizit karte",
		Price:          &p1450,
	}

	ctx := context.Background()
	pdfBytes, err := RenderWorkOrderPDF(ctx, baseOrder, PrintContext{}, printSettings(domain.DefaultPDFSections(), "Grafika Čobanović", domain.DefaultBillingDefaults()))
	if err != nil {
		t.Logf("Failed to render PDF using chromedp: %v", err)
		// We log instead of erroring out to handle environments without chrome gracefully
		return
	}

	if len(pdfBytes) == 0 {
		t.Errorf("expected PDF bytes, got empty slice")
	}

	// Validate PDF header
	if len(pdfBytes) < 5 || string(pdfBytes[:5]) != "%PDF-" {
		t.Errorf("expected PDF header, got %q", string(pdfBytes[:5]))
	}
}

// TestRenderWorkOrderHTMLBillingRows proves the billing box prints exactly the
// three document types (faktura / otkup / profaktura) and ticks the one the
// order carries.
func TestRenderWorkOrderHTMLBillingRows(t *testing.T) {
	otkup := domain.BillingDocumentTypeCashCollection
	order := domain.WorkOrder{
		OrderNumber:         "RN-2026-00001",
		ClientName:          "Profesionalni Upravnik",
		JobDescription:      "Vizit karte",
		BillingDocumentType: &otkup,
	}

	html, err := RenderWorkOrderHTML(
		order, PrintContext{},
		printSettings(domain.DefaultPDFSections(), "", domain.DefaultBillingDefaults()),
	)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	for _, label := range []string{"FAKTURA", "OTKUP", "PROFAKTURA"} {
		if !strings.Contains(html, "<span>"+label+"</span>") {
			t.Errorf("expected %q billing row in rendered sheet", label)
		}
	}
	// The former način-plaćanja rows are gone: the document type is the only choice.
	for _, label := range []string{"KEŠ", "VIRMAN"} {
		if strings.Contains(html, "<span>"+label+"</span>") {
			t.Errorf("unexpected %q row in rendered sheet", label)
		}
	}
	if got := markAfter(t, html, "OTKUP"); got != "X" {
		t.Errorf("OTKUP mark = %q, want X", got)
	}
	// PROFAKTURA is the shop default, but the order's own choice wins.
	if got := markAfter(t, html, "PROFAKTURA"); got == "X" {
		t.Error("PROFAKTURA must stay unticked when the order is an otkup")
	}
}

// markAfter returns the first character of the mark cell that follows the given
// billing/payment row label.
func markAfter(t *testing.T, html, label string) string {
	t.Helper()
	rowStart := strings.Index(html, "<span>"+label+"</span>")
	if rowStart < 0 {
		t.Fatalf("row %q not found", label)
	}
	after := html[rowStart:]
	markStart := strings.Index(after, `work-order-print-mark">`)
	if markStart < 0 {
		t.Fatalf("could not locate mark cell for %q", label)
	}
	return strings.TrimSpace(after[markStart+len(`work-order-print-mark">`):])[:1]
}

// TestPrintRowsIncludeCustomEnumValues proves that a document type, delivery
// method, or postage option an administrator added in Settings prints on the
// nalog, appended after the built-in rows so the familiar sheet layout holds.
func TestPrintRowsIncludeCustomEnumValues(t *testing.T) {
	enumValues := []domain.EnumValue{
		{Field: domain.EnumFieldBillingDocumentType, Value: "invoice", Label: "Faktura", IsBuiltin: true},
		{Field: domain.EnumFieldBillingDocumentType, Value: "advance", Label: "Avansni račun"},
		{Field: domain.EnumFieldDeliveryMethod, Value: "courier", Label: "Kurirska služba"},
		{Field: domain.EnumFieldPostagePaymentType, Value: "split", Label: "Podeljena poštarina"},
	}

	advance := domain.BillingDocumentType("advance")
	billingRows := getPrintBillingRows(&advance, enumValues, false)
	if len(billingRows) != 5 {
		t.Fatalf("expected 3 built-in + 1 custom + PLAĆENO, got %d", len(billingRows))
	}
	if billingRows[3].Label != "AVANSNI RAČUN" || !billingRows[3].Checked {
		t.Errorf("expected a checked AVANSNI RAČUN row after PROFAKTURA, got %+v", billingRows[3])
	}
	for _, row := range billingRows[:3] {
		if row.Checked {
			t.Errorf("expected built-in row %q unchecked when a custom type is selected", row.Label)
		}
	}

	courier := domain.DeliveryMethod("courier")
	deliveryRows := getPrintDeliveryRows(domain.Shipping{DeliveryMethod: &courier}, enumValues)
	if len(deliveryRows) != 12 {
		t.Fatalf("expected 10 built-in + 2 custom delivery rows, got %d", len(deliveryRows))
	}
	if deliveryRows[10].Label != "KURIRSKA SLUŽBA" || !deliveryRows[10].Checked {
		t.Errorf("expected a checked KURIRSKA SLUŽBA row, got %+v", deliveryRows[10])
	}
	if deliveryRows[11].Label != "PODELJENA POŠTARINA" || deliveryRows[11].Checked {
		t.Errorf("expected an unchecked PODELJENA POŠTARINA row, got %+v", deliveryRows[11])
	}
}

// TestRenderWorkOrderHTMLClientIdentifiers proves the client's PIB and matični
// broj print in the KLIJENT box, and that a client without them (or none at
// all) renders the box unchanged.
func TestRenderWorkOrderHTMLClientIdentifiers(t *testing.T) {
	order := domain.WorkOrder{
		OrderNumber:    "RN-2026-00001",
		ClientName:     "Profesionalni Upravnik",
		JobDescription: "Vizit karte",
		CustomerID:     ptr("cust-1"),
	}
	settings := printSettings(domain.DefaultPDFSections(), "", domain.DefaultBillingDefaults())

	withIDs, err := RenderWorkOrderHTML(order, PrintContext{
		LocationAddress: ptr("Kneza Miloša 22, Beograd"),
		Customer: &domain.Customer{
			ID:   "cust-1",
			Name: "Profesionalni Upravnik",
			Pib:  ptr("100200300"),
			Mb:   ptr("12345678"),
		},
	}, settings)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if !strings.Contains(withIDs, "PIB: 100200300") {
		t.Error("expected the client's PIB in the rendered sheet")
	}
	if !strings.Contains(withIDs, "MB: 12345678") {
		t.Error("expected the client's matični broj in the rendered sheet")
	}

	withoutIDs, err := RenderWorkOrderHTML(order, PrintContext{}, settings)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	// The class always appears in the stylesheet; only the rendered div matters.
	if strings.Contains(withoutIDs, `<div class="work-order-print-client-ids">`) {
		t.Error("expected no identifier line when the client has no PIB/MB")
	}
}

// TestPrintBillingRowsPaidIsIndependent proves PLAĆENO ticks on its own row
// without disturbing the document type, so a paid proforma prints both marks.
func TestPrintBillingRowsPaidIsIndependent(t *testing.T) {
	proforma := domain.BillingDocumentTypeProforma

	paid := getPrintBillingRows(&proforma, nil, true)
	if len(paid) != 4 {
		t.Fatalf("expected 3 document-type rows + PLAĆENO, got %d", len(paid))
	}
	if paid[2].Label != "PROFAKTURA" || !paid[2].Checked {
		t.Errorf("expected PROFAKTURA to stay checked, got %+v", paid[2])
	}
	if paid[3].Label != "PLAĆENO" || !paid[3].Checked {
		t.Errorf("expected a checked PLAĆENO row, got %+v", paid[3])
	}

	unpaid := getPrintBillingRows(&proforma, nil, false)
	if unpaid[3].Label != "PLAĆENO" || unpaid[3].Checked {
		t.Errorf("expected the PLAĆENO row present but unticked, got %+v", unpaid[3])
	}
}

func TestResolveBrowserPathHonorsEnvOverride(t *testing.T) {
	// A stand-in "browser": resolveBrowserPath only checks that the configured
	// value is executable, it never launches it.
	dir := t.TempDir()
	fake := filepath.Join(dir, "fake-chrome")
	if err := os.WriteFile(fake, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write fake browser: %v", err)
	}

	t.Setenv(browserExecPathEnv, fake)

	path, err := resolveBrowserPath()
	if err != nil {
		t.Fatalf("resolveBrowserPath: %v", err)
	}
	if path != fake {
		t.Errorf("path = %q, want %q", path, fake)
	}
}

func TestResolveBrowserPathRejectsMisconfiguredOverride(t *testing.T) {
	t.Setenv(browserExecPathEnv, filepath.Join(t.TempDir(), "does-not-exist"))

	if _, err := resolveBrowserPath(); !errors.Is(err, ErrBrowserUnavailable) {
		t.Fatalf("err = %v, want ErrBrowserUnavailable", err)
	}
}

func TestRenderWorkOrderPDFReportsMissingBrowser(t *testing.T) {
	t.Setenv(browserExecPathEnv, filepath.Join(t.TempDir(), "does-not-exist"))

	_, err := RenderWorkOrderPDF(
		context.Background(),
		domain.WorkOrder{ID: "rn-1", OrderNumber: "RN-2026-00001"},
		PrintContext{},
		printSettings(domain.DefaultPDFSections(), "Grafika Čobanović", domain.DefaultBillingDefaults()),
	)
	if !errors.Is(err, ErrBrowserUnavailable) {
		t.Fatalf("err = %v, want ErrBrowserUnavailable", err)
	}
}
