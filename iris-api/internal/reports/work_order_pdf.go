package reports

import (
	"context"
	"encoding/base64"
	"fmt"
	"html/template"
	"strings"
	"strconv"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
)

type PrintCheckRow struct {
	Label   string
	Checked bool
}

type WorkOrderPrintData struct {
	OrderNumber     string
	ClientName      string
	IssueDate       string
	JobLines        []string
	ContactPerson   string
	DeliveryRows    []PrintCheckRow
	PlannedDate     string
	BillingRows     []PrintCheckRow
	NoteLines       []string
	ShippingAddress string
	Completed       bool
	CompletionDate  string
	IssuedBy        string
	ExecutedBy      string
}

func uppercaseLine(value *string) string {
	if value == nil {
		return ""
	}
	trimmed := strings.TrimSpace(*value)
	return strings.ToUpper(trimmed)
}

func uppercaseString(value string) string {
	trimmed := strings.TrimSpace(value)
	return strings.ToUpper(trimmed)
}

func formatPrintPrice(price *float64) string {
	if price == nil {
		return ""
	}
	p := *price
	intPart := int64(p)
	fracPart := p - float64(intPart)
	intStr := formatIntegerWithDots(intPart)

	if fracPart < 0.01 {
		return intStr + " DINARA"
	}

	fracStr := fmt.Sprintf("%.2f", fracPart)
	fracStr = strings.TrimPrefix(fracStr, "0.")
	fracStr = strings.TrimSuffix(fracStr, "0")

	return intStr + "," + fracStr + " DINARA"
}

func formatIntegerWithDots(n int64) string {
	sign := ""
	if n < 0 {
		sign = "-"
		n = -n
	}

	str := strconv.FormatInt(n, 10)
	out := make([]byte, len(str)+(len(str)-1)/3)

	for i, j := len(str)-1, len(out)-1; i >= 0; i, j = i-1, j-1 {
		out[j] = str[i]
		if (len(str)-1-i)%3 == 2 && i > 0 {
			j--
			out[j] = '.'
		}
	}
	return sign + string(out)
}

func formatWorkOrderDate(dateStr string) string {
	parts := strings.Split(dateStr, "-")
	if len(parts) != 3 {
		return dateStr
	}
	return fmt.Sprintf("%s.%s.%s", parts[2], parts[1], parts[0])
}

func formatOptionalDate(value *string) string {
	if value == nil || *value == "" {
		return "/"
	}
	return formatWorkOrderDate(*value) + "."
}

func getPrintDeliveryRows(shipping domain.Shipping) []PrintCheckRow {
	method := shipping.DeliveryMethod
	postage := shipping.PostagePaymentType

	rows := []struct {
		label   string
		checked bool
	}{
		{label: "VOZI SE", checked: shipping.DrivesOut},
		{label: "LIČNO", checked: method != nil && *method == domain.DeliveryMethodPickup},
		{label: "POST EXPRES", checked: method != nil && *method == domain.DeliveryMethodPostExpress},
		{label: "CITY EXPRES", checked: method != nil && *method == domain.DeliveryMethodCityExpress},
		{label: "POŠTARINA POUZEĆEM", checked: postage != nil && *postage == domain.PostagePaymentTypeCOD},
		{label: "POŠTARINA NA NAŠ RAČUN", checked: postage != nil && *postage == domain.PostagePaymentTypeOurAccount},
		{label: "AVANS POŠTARINA", checked: postage != nil && *postage == domain.PostagePaymentTypeAdvance},
		{label: "POŠTARINA SE NAPLAĆUJE PREKO FAKTURE", checked: postage != nil && *postage == domain.PostagePaymentTypeViaInvoice},
		{label: "ČEKA SE UPLATA", checked: shipping.WaitForPayment},
		{label: "IZLAZAK NA TEREN", checked: method != nil && *method == domain.DeliveryMethodFieldVisit},
	}

	res := make([]PrintCheckRow, len(rows))
	for i, r := range rows {
		res[i] = PrintCheckRow{
			Label:   r.label,
			Checked: r.checked,
		}
	}
	return res
}

func getPrintBillingRows(billingDocType *domain.BillingDocumentType) []PrintCheckRow {
	rows := []struct {
		label  string
		method domain.BillingDocumentType
	}{
		{label: "FAKTURA", method: domain.BillingDocumentTypeInvoice},
		{label: "OTKUP", method: domain.BillingDocumentTypeCashCollection},
		{label: "PROFAKTURA", method: domain.BillingDocumentTypeProforma},
	}

	res := make([]PrintCheckRow, len(rows))
	for i, r := range rows {
		checked := false
		if billingDocType != nil && *billingDocType == r.method {
			checked = true
		}
		res[i] = PrintCheckRow{
			Label:   r.label,
			Checked: checked,
		}
	}
	return res
}

func jobDetailsHasContent(details *domain.JobDetails) bool {
	if details == nil {
		return false
	}
	if details.ProductCode != nil && strings.TrimSpace(*details.ProductCode) != "" {
		return true
	}
	if details.PaperWeightGsm != nil {
		return true
	}
	if details.Dimensions != nil && strings.TrimSpace(*details.Dimensions) != "" {
		return true
	}
	if details.Quantity != nil {
		return true
	}
	if details.FinishingNote != nil && strings.TrimSpace(*details.FinishingNote) != "" {
		return true
	}
	return false
}

func buildPrintJobLines(order domain.WorkOrder) []string {
	var detailLines []string

	if jobDetailsHasContent(order.JobDetails) {
		pCode := uppercaseLine(order.JobDetails.ProductCode)
		pWeight := ""
		if order.JobDetails.PaperWeightGsm != nil {
			pWeight = fmt.Sprintf("%dG", *order.JobDetails.PaperWeightGsm)
		}
		dims := uppercaseLine(order.JobDetails.Dimensions)
		qty := ""
		if order.JobDetails.Quantity != nil {
			qty = fmt.Sprintf("%dKOM", *order.JobDetails.Quantity)
		}
		fNote := uppercaseLine(order.JobDetails.FinishingNote)

		raw := []string{pCode, pWeight, dims, qty, fNote}
		for _, l := range raw {
			if l != "" {
				detailLines = append(detailLines, l)
			}
		}
	}

	var lines []string
	if len(detailLines) > 0 {
		lines = detailLines
	} else {
		desc := uppercaseString(order.JobDescription)
		if desc != "" {
			lines = []string{desc}
		}
	}

	price := formatPrintPrice(order.Price)
	if price != "" {
		lines = append(lines, "CENA: "+price)
	}

	if len(lines) == 0 {
		return []string{"OPIS POSLA NIJE UNET"}
	}
	return lines
}

func buildPrintNoteLines(order domain.WorkOrder) []string {
	var lines []string
	noteVal := uppercaseLine(order.Note)
	if noteVal != "" {
		lines = append(lines, noteVal)
	}

	for _, note := range order.CustomerNotes {
		bodyVal := uppercaseString(note.Body)
		if bodyVal != "" {
			lines = append(lines, bodyVal)
		}
	}

	if order.BillingDocumentNumber != nil && *order.BillingDocumentNumber != "" {
		lines = append(lines, "BROJ DOKUMENTA: "+*order.BillingDocumentNumber)
	}

	return lines
}

const htmlTemplateStr = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Radni nalog {{.OrderNumber}}</title>
  <style>
    @page {
      size: A4;
      margin: 8mm;
    }

    html,
    body {
      min-height: 0 !important;
      background: #fff !important;
      color: #000 !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box;
      -webkit-print-color-adjust: economy;
      print-color-adjust: economy;
    }

    .work-order-print-sheet {
      display: flex !important;
      flex-direction: column;
      box-sizing: border-box;
      width: 194mm;
      height: 281mm;
      max-height: 281mm;
      margin: 0 auto;
      overflow: hidden;
      page-break-after: avoid;
      page-break-inside: avoid;
      break-inside: avoid;
      background: #fff !important;
      color: #000 !important;
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.12;
    }

    .work-order-print-sheet *,
    .work-order-print-sheet *::before,
    .work-order-print-sheet *::after {
      box-sizing: border-box;
      background-color: #fff !important;
      color: #000 !important;
      border-color: #000 !important;
    }

    .work-order-print-title {
      margin: 0;
      flex: 0 0 auto;
      border-bottom: 2px solid #000;
      padding: 0 0 2mm;
      text-align: center;
      font-size: 32px;
      font-weight: 800;
      letter-spacing: 0;
    }

    .work-order-print-hero {
      display: grid;
      grid-template-columns: 1fr 55mm;
      flex: 1 1 auto;
      min-height: 0;
      border-bottom: 2px solid #000;
    }

    .work-order-print-main-panel {
      display: grid;
      grid-template-rows: auto 1fr;
      border-right: 1px solid #000;
    }

    .work-order-print-top-grid {
      display: grid;
      grid-template-columns: 1fr 45mm;
      border-bottom: 1px solid #000;
    }

    .work-order-print-client-box,
    .work-order-print-issue-box {
      min-height: 20mm;
    }

    .work-order-print-client-box {
      border-right: 1px solid #000;
    }

    .work-order-print-label {
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0;
    }

    .work-order-print-client-box .work-order-print-label {
      padding: 2mm 3mm 0;
    }

    .work-order-print-client-name {
      padding: 2mm 3mm 3mm;
      font-size: 22px;
      font-weight: 800;
      line-height: 1.1;
      overflow-wrap: anywhere;
    }

    .work-order-print-subline {
      border-top: 1px solid #000;
      padding: 1.5mm 3mm;
      font-size: 11px;
      font-weight: 500;
    }

    .work-order-print-issue-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2mm;
      text-align: center;
    }

    .work-order-print-date {
      font-size: 23px;
      font-weight: 700;
      letter-spacing: 0;
    }

    .work-order-print-job-box {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
      flex-direction: column;
      padding: 4mm 4mm 3mm;
    }

    .work-order-print-job-lines {
      font-size: 24px;
      font-weight: 400;
      line-height: 1.22;
      overflow-wrap: anywhere;
    }

    .work-order-print-contact {
      margin-top: auto;
      font-size: 25px;
      font-weight: 800;
      line-height: 1.1;
      overflow-wrap: anywhere;
    }

    .work-order-print-delivery-box {
      display: flex;
      flex-direction: column;
      min-height: 0;
      padding-top: 2mm;
    }

    .work-order-print-check-row {
      display: grid;
      grid-template-columns: 1fr 10mm;
      align-items: center;
      min-height: 8.5mm;
      border-bottom: 1px solid #000;
      padding-left: 2mm;
      font-size: 15px;
      font-weight: 500;
      line-height: 1.05;
      overflow-wrap: anywhere;
    }

    .work-order-print-checkbox {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 6mm;
      height: 6mm;
      margin: 0 auto;
      border: 1px solid #000;
      font-size: 21px;
      font-weight: 900;
      line-height: 1;
    }

    .work-order-print-empty-field {
      margin-top: auto;
      border: 1px solid #000;
      padding: 1.5mm 4mm;
      font-size: 21px;
      font-weight: 700;
    }

    .work-order-print-document-row {
      display: grid;
      grid-template-columns: 78mm 1fr;
      flex: 0 0 auto;
      min-height: 22mm;
      border-bottom: 2px solid #000;
    }

    .work-order-print-planned-date {
      display: flex;
      align-items: center;
      justify-content: center;
      border-right: 1px solid #000;
      font-size: 32px;
      font-weight: 500;
    }

    .work-order-print-billing-box {
      display: grid;
      grid-template-columns: 50mm 1fr;
      padding: 2mm 2mm 2mm 5mm;
    }

    .work-order-print-billing-row {
      display: contents;
      font-size: 21px;
      font-weight: 800;
      line-height: 1.25;
    }

    .work-order-print-billing-row > span:first-child {
      display: flex;
      align-items: center;
    }

    .work-order-print-mark {
      min-height: 6.5mm;
      margin: 0.5mm 0;
      border: 1px solid #000;
      padding-left: 2mm;
      font-size: 25px;
      line-height: 1.05;
    }

    .work-order-print-notes-row {
      display: grid;
      grid-template-columns: 78mm 1fr;
      flex: 0 0 auto;
      min-height: 26mm;
      border-bottom: 2px solid #000;
    }

    .work-order-print-note-box,
    .work-order-print-address-box {
      padding: 2mm 3mm;
    }

    .work-order-print-note-box {
      border-right: 1px solid #000;
    }

    .work-order-print-note-lines,
    .work-order-print-address {
      margin-top: 3mm;
      font-size: 23px;
      font-weight: 800;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }

    .work-order-print-completion-row {
      display: grid;
      grid-template-columns: 78mm 1fr;
      align-items: center;
      flex: 0 0 auto;
      min-height: 10mm;
      border-bottom: 2px solid #000;
      font-size: 11px;
    }

    .work-order-print-completion-state,
    .work-order-print-completion-date {
      display: flex;
      align-items: center;
      gap: 5mm;
      padding: 1.5mm 3mm;
    }

    .work-order-print-completion-date {
      justify-content: flex-end;
    }

    .work-order-print-date-line {
      min-width: 40mm;
      border-bottom: 1px solid #000;
      padding-bottom: 0.5mm;
      text-align: right;
      font-size: 21px;
      font-weight: 500;
    }

    .work-order-print-signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      flex: 0 0 auto;
      gap: 24mm;
      padding: 3mm 3mm 0;
    }

    .work-order-print-align-right {
      text-align: right;
    }

    .work-order-print-signature-value {
      min-height: 10mm;
      border-bottom: 1px solid #000;
      padding-top: 2mm;
      text-align: center;
      font-size: 21px;
      font-style: italic;
      line-height: 1;
    }
  </style>
</head>
<body>
  <section class="work-order-print-sheet">
    <h1 class="work-order-print-title">RADNI NALOG</h1>

    <div class="work-order-print-hero">
      <div class="work-order-print-main-panel">
        <div class="work-order-print-top-grid">
          <div class="work-order-print-client-box">
            <div class="work-order-print-label">KLIJENT</div>
            <div class="work-order-print-client-name">{{.ClientName}}</div>
            <div class="work-order-print-subline">OPIS POSLA</div>
          </div>
          <div class="work-order-print-issue-box">
            <div class="work-order-print-date">{{.IssueDate}}</div>
            <div class="work-order-print-label">DATUM IZDAVANJA</div>
          </div>
        </div>

        <div class="work-order-print-job-box">
          <div class="work-order-print-job-lines">
            {{range .JobLines}}
              <div>{{.}}</div>
            {{end}}
          </div>
          {{if .ContactPerson}}
            <div class="work-order-print-contact">{{.ContactPerson}}</div>
          {{end}}
        </div>
      </div>

      <div class="work-order-print-delivery-box">
        {{range .DeliveryRows}}
          <div class="work-order-print-check-row">
            <span>{{.Label}}</span>
            <span class="work-order-print-checkbox">{{if .Checked}}X{{end}}</span>
          </div>
        {{end}}
        <div class="work-order-print-empty-field"></div>
      </div>
    </div>

    <div class="work-order-print-document-row">
      <div class="work-order-print-planned-date">{{.PlannedDate}}</div>
      <div class="work-order-print-billing-box">
        {{range .BillingRows}}
          <div class="work-order-print-billing-row">
            <span>{{.Label}}</span>
            <span class="work-order-print-mark">{{if .Checked}}X{{end}}</span>
          </div>
        {{end}}
      </div>
    </div>

    <div class="work-order-print-notes-row">
      <div class="work-order-print-note-box">
        <div class="work-order-print-label">NAPOMENA</div>
        <div class="work-order-print-note-lines">
          {{range .NoteLines}}
            <div>{{.}}</div>
          {{end}}
        </div>
      </div>
      <div class="work-order-print-address-box">
        <div class="work-order-print-label">ADRESA ZA SLANJE:</div>
        {{if .ShippingAddress}}
          <div class="work-order-print-address">{{.ShippingAddress}}</div>
        {{end}}
      </div>
    </div>

    <div class="work-order-print-completion-row">
      <div class="work-order-print-completion-state">
        <span>RADNI NALOG ZAVRŠEN</span>
        <span class="work-order-print-checkbox">{{if .Completed}}X{{end}}</span>
      </div>
      <div class="work-order-print-completion-date">
        <span>DATUM IZVRŠENJA POSLA</span>
        <span class="work-order-print-date-line">{{.CompletionDate}}</span>
      </div>
    </div>

    <div class="work-order-print-signatures">
      <div>
        <div class="work-order-print-label">RN IZDAO</div>
        <div class="work-order-print-signature-value">{{.IssuedBy}}</div>
      </div>
      <div>
        <div class="work-order-print-label work-order-print-align-right">IZVRŠILAC POSLA</div>
        <div class="work-order-print-signature-value">{{.ExecutedBy}}</div>
      </div>
    </div>
  </section>
</body>
</html>`

var parsedTemplate = template.Must(template.New("work_order").Parse(htmlTemplateStr))

func ResolvePrintShippingAddress(order domain.WorkOrder, locationAddress *string) string {
	if order.Shipping.ShippingAddress != nil {
		if value := uppercaseLine(order.Shipping.ShippingAddress); value != "" {
			return value
		}
	}
	if locationAddress != nil {
		if value := uppercaseLine(locationAddress); value != "" {
			return value
		}
	}
	return ""
}

func RenderWorkOrderHTML(order domain.WorkOrder, locationAddress *string) (string, error) {
	plannedDate := order.DueDate
	if plannedDate == nil {
		plannedDate = order.Assignment.ScheduledDate
	}
	if plannedDate == nil {
		plannedDate = order.CompletionDate
	}

	completed := order.IsCompleted || order.Status == domain.WorkOrderStatusInvoiced

	execBy := ""
	if order.ExecutedBy != nil {
		execBy = *order.ExecutedBy
	}

	data := WorkOrderPrintData{
		OrderNumber:     order.OrderNumber,
		ClientName:      uppercaseString(order.ClientName),
		IssueDate:       formatOptionalDate(&order.IssueDate),
		JobLines:        buildPrintJobLines(order),
		ContactPerson:   uppercaseLine(order.ContactPerson),
		DeliveryRows:    getPrintDeliveryRows(order.Shipping),
		PlannedDate:     formatOptionalDate(plannedDate),
		BillingRows:     getPrintBillingRows(order.BillingDocumentType),
		NoteLines:       buildPrintNoteLines(order),
		ShippingAddress: ResolvePrintShippingAddress(order, locationAddress),
		Completed:       completed,
		CompletionDate:  formatOptionalDate(order.CompletionDate),
		IssuedBy:        order.IssuedBy,
		ExecutedBy:      execBy,
	}

	var sb strings.Builder
	if err := parsedTemplate.Execute(&sb, data); err != nil {
		return "", err
	}
	return sb.String(), nil
}

func RenderWorkOrderPDF(ctx context.Context, order domain.WorkOrder, locationAddress *string) ([]byte, error) {
	htmlContent, err := RenderWorkOrderHTML(order, locationAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to render HTML template: %w", err)
	}

	// Create allocator context with no-sandbox flag to run reliably inside Docker environments.
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.NoSandbox,
		chromedp.DisableGPU,
	)

	allocCtx, cancelAlloc := chromedp.NewExecAllocator(ctx, opts...)
	defer cancelAlloc()

	taskCtx, cancelTask := chromedp.NewContext(allocCtx)
	defer cancelTask()

	// Ensure there is a timeout for generation.
	taskCtx, cancelTimeout := context.WithTimeout(taskCtx, 15*time.Second)
	defer cancelTimeout()

	var pdf []byte
	dataURI := "data:text/html;base64," + base64.StdEncoding.EncodeToString([]byte(htmlContent))

	err = chromedp.Run(taskCtx,
		chromedp.Navigate(dataURI),
		chromedp.ActionFunc(func(ctx context.Context) error {
			var err error
			// Print to PDF with exact A4 sheet configuration
			pdf, _, err = page.PrintToPDF().
				WithPrintBackground(true).
				WithPreferCSSPageSize(true).
				WithPaperWidth(8.27).  // A4 Width in inches (210mm)
				WithPaperHeight(11.69). // A4 Height in inches (297mm)
				WithMarginTop(0.315).    // 8mm
				WithMarginBottom(0.315).
				WithMarginLeft(0.315).
				WithMarginRight(0.315).
				Do(ctx)
			return err
		}),
	)

	if err != nil {
		return nil, fmt.Errorf("chromedp failed to render PDF: %w", err)
	}

	return pdf, nil
}
