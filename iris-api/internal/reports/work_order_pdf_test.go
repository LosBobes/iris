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
	detailsLines := buildPrintJobLines(orderWithDetails)
	if !reflect.DeepEqual(detailsLines, expectedDetailsLines) {
		t.Errorf("expected job lines %v, got %v", expectedDetailsLines, detailsLines)
	}

	expectedFallbackLines := []string{
		"VIZIT KARTE",
	}
	fallbackLines := buildPrintJobLines(baseOrder)
	if !reflect.DeepEqual(fallbackLines, expectedFallbackLines) {
		t.Errorf("expected fallback job lines %v, got %v", expectedFallbackLines, fallbackLines)
	}

	orderWithEmptyDetails := baseOrder
	orderWithEmptyDetails.JobDetails = &domain.JobDetails{}
	emptyDetailsLines := buildPrintJobLines(orderWithEmptyDetails)
	if !reflect.DeepEqual(emptyDetailsLines, expectedFallbackLines) {
		t.Errorf("expected empty job details to fall back to description, got %v", emptyDetailsLines)
	}

	// 6. Line items render each position's price: "DESC — QTY UNIT × UNITPRICE = LINETOTAL".
	orderWithItems := baseOrder
	orderWithItems.InvoiceDraft.LineItems = []domain.InvoiceLineItem{
		{Description: "Plakati A2", Quantity: 100, Unit: "kom", UnitPrice: 150},
		// Zero unit price (e.g. a non-admin stripped printout) falls back to qty only.
		{Description: "Kaširanje", Quantity: 100, Unit: "kom", UnitPrice: 0},
	}
	expectedItemLines := []string{
		"VIZIT KARTE",
		"PLAKATI A2 — 100 KOM × 150 = 15.000",
		"KAŠIRANJE — 100 KOM",
	}
	itemLines := buildPrintJobLines(orderWithItems)
	if !reflect.DeepEqual(itemLines, expectedItemLines) {
		t.Errorf("expected item job lines %v, got %v", expectedItemLines, itemLines)
	}
}

func TestRenderWorkOrderHTMLSectionToggles(t *testing.T) {
	order := domain.WorkOrder{
		ID:             "rn-1",
		OrderNumber:    "RN-2026-00001",
		ClientName:     "Profesionalni Upravnik",
		JobDescription: "Vizit karte",
	}

	full, err := RenderWorkOrderHTML(order, nil, domain.DefaultPDFSections())
	if err != nil {
		t.Fatalf("render full: %v", err)
	}
	for _, marker := range []string{"VOZI SE", "FAKTURA", "NAPOMENA", "ADRESA ZA SLANJE", "RADNI NALOG ZAVRŠEN", "RN IZDAO"} {
		if !strings.Contains(full, marker) {
			t.Errorf("full sheet missing %q", marker)
		}
	}
	// The order number must be printed on the sheet (previously only in <title>).
	if !strings.Contains(full, `work-order-print-number">RN-2026-00001<`) {
		t.Errorf("full sheet missing printed order number")
	}

	none, err := RenderWorkOrderHTML(order, nil, domain.PDFSections{})
	if err != nil {
		t.Fatalf("render none: %v", err)
	}
	for _, marker := range []string{"VOZI SE", "FAKTURA", "NAPOMENA", "ADRESA ZA SLANJE", "RADNI NALOG ZAVRŠEN", "RN IZDAO"} {
		if strings.Contains(none, marker) {
			t.Errorf("disabled sheet still contains %q", marker)
		}
	}
	// The client name (a non-configurable core field) must always render.
	if !strings.Contains(none, "PROFESIONALNI UPRAVNIK") {
		t.Errorf("disabled sheet dropped core client field")
	}
	// Hiding delivery collapses the hero to a single column.
	if !strings.Contains(none, "work-order-print-hero-solo") {
		t.Errorf("expected hero-solo class when delivery hidden")
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

	html, err := RenderWorkOrderHTML(order, nil, domain.DefaultPDFSections())
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
	pdfBytes, err := RenderWorkOrderPDF(ctx, baseOrder, nil, domain.DefaultPDFSections())
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

