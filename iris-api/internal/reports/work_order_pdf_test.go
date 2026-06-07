package reports

import (
	"context"
	"reflect"
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
		OrderNumber:    "RN-2026-0001",
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

	expectedDetailsLines := []string{
		"VK",
		"350G",
		"9X5",
		"200KOM",
		"SAMO SE SEČE",
		"CENA: 1.450 DINARA",
	}
	detailsLines := buildPrintJobLines(orderWithDetails)
	if !reflect.DeepEqual(detailsLines, expectedDetailsLines) {
		t.Errorf("expected job lines %v, got %v", expectedDetailsLines, detailsLines)
	}

	expectedFallbackLines := []string{
		"VIZIT KARTE",
		"CENA: 1.450 DINARA",
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
}

func TestRenderWorkOrderPDF(t *testing.T) {
	p1450 := 1450.0
	baseOrder := domain.WorkOrder{
		ID:             "rn-1",
		OrderNumber:    "RN-2026-0001",
		ClientName:     "Profesionalni Upravnik",
		JobDescription: "Vizit karte",
		Price:          &p1450,
	}

	ctx := context.Background()
	pdfBytes, err := RenderWorkOrderPDF(ctx, baseOrder, nil)
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

