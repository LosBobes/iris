package reports

import (
	"context"
	"reflect"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func ptr[T any](v T) *T {
	return &v
}

func TestPrintHelpers(t *testing.T) {
	// 1. Delivery method check rows
	pickup := domain.DeliveryMethodPickup
	deliveryRows := getPrintDeliveryRows(domain.Shipping{DeliveryMethod: &pickup})
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
	billingRows := getPrintBillingRows(&invoice)
	if len(billingRows) != 3 {
		t.Fatalf("expected 3 billing rows, got %d", len(billingRows))
	}
	if !billingRows[0].Checked || billingRows[0].Label != "FAKTURA" {
		t.Errorf("expected row 0 (FAKTURA) to be checked, got %+v", billingRows[0])
	}

	proforma := domain.BillingDocumentTypeProforma
	billingRowsProforma := getPrintBillingRows(&proforma)
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
	}
	expectedItemRows := []PrintItemRow{
		{Name: "PLAKATI A2", UnitPrice: "150", Quantity: "100 KOM", Total: "15.000"},
		{Name: "KAŠIRANJE", UnitPrice: "", Quantity: "100 KOM", Total: ""},
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

	// Override allowed: the order's own choice wins, including "no type" (nil).
	overridable := domain.BillingDefaults{DocumentType: domain.BillingDocumentTypeProforma, AllowOverride: true}
	if got := resolveBillingDocumentType(orderWithInvoice, overridable); got == nil || *got != invoice {
		t.Errorf("override allowed: expected order's invoice type, got %v", got)
	}
	if got := resolveBillingDocumentType(orderWithNoType, overridable); got != nil {
		t.Errorf("override allowed: expected nil for order without a type, got %v", got)
	}

	// Override disabled: the shop default is authoritative, even when the order
	// stored a different type or none at all (e.g. legacy/imported orders).
	locked := domain.BillingDefaults{DocumentType: domain.BillingDocumentTypeProforma, AllowOverride: false}
	if got := resolveBillingDocumentType(orderWithInvoice, locked); got == nil || *got != domain.BillingDocumentTypeProforma {
		t.Errorf("override disabled: expected shop default proforma, got %v", got)
	}
	if got := resolveBillingDocumentType(orderWithNoType, locked); got == nil || *got != domain.BillingDocumentTypeProforma {
		t.Errorf("override disabled: expected shop default proforma for typeless order, got %v", got)
	}
}

func TestRenderWorkOrderHTMLBillingDefault(t *testing.T) {
	order := domain.WorkOrder{
		OrderNumber:    "RN-2026-00001",
		ClientName:     "Profesionalni Upravnik",
		JobDescription: "Vizit karte",
		// No explicit document type, as with legacy/imported orders.
	}

	// A shop whose default is FAKTURA and which does not allow overrides must
	// tick FAKTURA on the printout even though the order carries no type.
	defaults := domain.BillingDefaults{DocumentType: domain.BillingDocumentTypeInvoice, AllowOverride: false}
	html, err := RenderWorkOrderHTML(order, nil, domain.DefaultPDFSections(), "", defaults)
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

	// The notes (napomena) box is off by default, so enable it explicitly to
	// exercise the fully-populated sheet.
	allSections := domain.DefaultPDFSections()
	allSections.Notes = true
	full, err := RenderWorkOrderHTML(order, ptr("Kneza Milosa 22, Beograd"), allSections, "Grafika Čobanović", domain.DefaultBillingDefaults())
	if err != nil {
		t.Fatalf("render full: %v", err)
	}
	for _, marker := range []string{"VOZI SE", "FAKTURA", "NAPOMENA", "ADRESA ZA DOSTAVU", "IZDAO / IZVRŠILAC"} {
		if !strings.Contains(full, marker) {
			t.Errorf("full sheet missing %q", marker)
		}
	}
	// With both notes and address on, the row keeps its two-column layout.
	// (Match the class attribute, not the always-present CSS selector.)
	if strings.Contains(full, `work-order-print-notes-row work-order-print-notes-row-solo`) {
		t.Errorf("notes-row unexpectedly collapsed to solo while notes shown")
	}

	// When notes are hidden but the shipping address stays, the address box
	// takes the full row width via the -solo modifier.
	addressOnly := domain.DefaultPDFSections()
	addressOnly.Notes = false
	addressOnly.ShippingAddress = true
	addr, err := RenderWorkOrderHTML(order, ptr("Kneza Milosa 22, Beograd"), addressOnly, "", domain.DefaultBillingDefaults())
	if err != nil {
		t.Fatalf("render address-only: %v", err)
	}
	if strings.Contains(addr, "NAPOMENA") {
		t.Errorf("address-only sheet still contains NAPOMENA")
	}
	if !strings.Contains(addr, `work-order-print-notes-row work-order-print-notes-row-solo`) {
		t.Errorf("expected notes-row-solo class when notes hidden and address shown")
	}
	// The order number must be printed on the sheet (previously only in <title>).
	if !strings.Contains(full, `work-order-print-number">RN-2026-00001<`) {
		t.Errorf("full sheet missing printed order number")
	}
	// The client's location address renders in subscript under the client name.
	if !strings.Contains(full, `work-order-print-client-address">KNEZA MILOSA 22, BEOGRAD<`) {
		t.Errorf("full sheet missing client address subscript")
	}

	none, err := RenderWorkOrderHTML(order, nil, domain.PDFSections{}, "", domain.DefaultBillingDefaults())
	if err != nil {
		t.Fatalf("render none: %v", err)
	}
	for _, marker := range []string{"VOZI SE", "FAKTURA", "NAPOMENA", "ADRESA ZA DOSTAVU", "IZDAO / IZVRŠILAC"} {
		if strings.Contains(none, marker) {
			t.Errorf("disabled sheet still contains %q", marker)
		}
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

func TestRenderWorkOrderHTMLTotalPrice(t *testing.T) {
	price := 1450.0
	order := domain.WorkOrder{
		OrderNumber:    "RN-2026-00001",
		ClientName:     "Profesionalni Upravnik",
		JobDescription: "Vizit karte",
		Price:          &price,
	}

	html, err := RenderWorkOrderHTML(order, nil, domain.DefaultPDFSections(), "", domain.DefaultBillingDefaults())
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
	pdfBytes, err := RenderWorkOrderPDF(ctx, baseOrder, nil, domain.DefaultPDFSections(), "Grafika Čobanović", domain.DefaultBillingDefaults())
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
