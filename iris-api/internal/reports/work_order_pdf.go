package reports

import (
	"context"
	"encoding/base64"
	"fmt"
	"html/template"
	"strconv"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
)

type PrintCheckRow struct {
	Label   string
	Checked bool
}

// PrintItemRow is one "stavka" (line item) rendered as a table row: an
// enumerated name plus the selling price, quantity, and line-total columns. The
// numeric fields are pre-formatted and left empty when there is nothing to show
// (zero price, or a money-hidden printout) so the table never prints a bogus "0".
type PrintItemRow struct {
	Name      string
	UnitPrice string
	Quantity  string
	Total     string
}

type WorkOrderPrintData struct {
	FirmName         string
	OrderNumber      string
	ClientName       string
	ClientAddress    string
	IssueDate        string
	DescriptionLines []string
	ItemRows         []PrintItemRow
	TotalPrice       string
	ContactPerson    string
	DeliveryRows     []PrintCheckRow
	PlannedDate      string
	BillingRows      []PrintCheckRow
	NoteLines        []string
	ShippingAddress  string
	Completed        bool
	CompletionDate   string
	ExecutedBy       string

	// Section visibility, driven by the shop's PDF configuration.
	ShowDelivery        bool
	ShowBilling         bool
	ShowNotes           bool
	ShowShippingAddress bool
	ShowCompletion      bool
	ShowSignatures      bool
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

// formatAmount renders a monetary amount with thousands dots and up to two
// decimals, no currency suffix: 15000 -> "15.000", 15000.5 -> "15.000,5".
func formatAmount(p float64) string {
	intPart := int64(p)
	fracPart := p - float64(intPart)
	intStr := formatIntegerWithDots(intPart)

	if fracPart < 0.01 {
		return intStr
	}

	fracStr := fmt.Sprintf("%.2f", fracPart)
	fracStr = strings.TrimPrefix(fracStr, "0.")
	fracStr = strings.TrimSuffix(fracStr, "0")

	return intStr + "," + fracStr
}

func formatPrintPrice(price *float64) string {
	if price == nil {
		return ""
	}
	return formatAmount(*price) + " DINARA"
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

// resolveBillingDocumentType returns the document type (tip dokumenta) to tick on
// the printout. When the shop does not allow per-order override, the type is
// entirely shop-controlled, so the shop default is authoritative regardless of
// what the order stored (this is what keeps legacy/imported orders in sync with
// the configured default). When override is allowed, the order's own choice wins.
func resolveBillingDocumentType(order domain.WorkOrder, defaults domain.BillingDefaults) *domain.BillingDocumentType {
	if defaults.AllowOverride {
		return order.BillingDocumentType
	}
	docType := defaults.DocumentType
	return &docType
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

// buildPrintDescriptionLines returns the "opis posla" (job description) lines
// only: the structured job details when present, otherwise the free-text
// description. Line items (stavke) are produced separately by
// buildPrintItemLines so the two render in distinct panels. Falls back to a
// placeholder when there is nothing to show.
func buildPrintDescriptionLines(order domain.WorkOrder) []string {
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

	if len(detailLines) > 0 {
		return detailLines
	}
	if desc := uppercaseString(order.JobDescription); desc != "" {
		return []string{desc}
	}
	return []string{"OPIS POSLA NIJE UNET"}
}

// buildPrintItemRows returns the "stavke" (line items) as table rows: name plus
// the selling price, quantity, and line-total columns. Non-admin printouts have
// line prices stripped to 0 upstream, so the price and total columns come out
// empty (no "0" money leak). The grand total is rendered separately (pinned to
// the bottom of the job panel as "UKUPNA CENA"), not mixed in here.
func buildPrintItemRows(order domain.WorkOrder) []PrintItemRow {
	var rows []PrintItemRow
	for _, item := range order.InvoiceDraft.LineItems {
		name := uppercaseString(item.Description)
		if name == "" {
			continue
		}
		unit := uppercaseString(string(item.Unit))
		quantity := ""
		if item.Quantity > 0 {
			if unit != "" {
				quantity = fmt.Sprintf("%d %s", item.Quantity, unit)
			} else {
				quantity = strconv.Itoa(item.Quantity)
			}
		}
		unitPrice := ""
		total := ""
		if item.UnitPrice > 0 {
			unitPrice = formatAmount(item.UnitPrice)
			if item.Quantity > 0 {
				total = formatAmount(float64(item.Quantity) * item.UnitPrice)
			}
		}
		rows = append(rows, PrintItemRow{
			Name:      name,
			UnitPrice: unitPrice,
			Quantity:  quantity,
			Total:     total,
		})
	}
	return rows
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
      /* Roomy top margin (white space above the title) and a small bottom margin
         so the content sits lower on the page and reaches near the bottom. */
      margin: 20mm 8mm 2mm;
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
      height: 275mm;
      max-height: 275mm;
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
      position: relative;
      margin: 0;
      flex: 0 0 auto;
      border-bottom: 2px solid #000;
      padding: 0 0 2mm;
      text-align: center;
      font-size: 32px;
      font-weight: 800;
      letter-spacing: 0;
    }

    .work-order-print-number {
      position: absolute;
      top: 0;
      right: 0;
      border: 1px solid #000;
      padding: 1mm 2.5mm;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0;
      white-space: nowrap;
    }

    /* The lower area of the nalog: a left stack (stavke, billing, notes) beside
       the delivery checklist, which sits bottom-aligned in its right column. The
       KLIJENT/dates row and OPIS POSLA render full width above this. */
    .work-order-print-body {
      display: flex;
      align-items: stretch;
      flex: 1 1 auto;
      min-height: 0;
      border-bottom: 2px solid #000;
    }

    .work-order-print-left-stack {
      display: flex;
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
      flex-direction: column;
    }

    .work-order-print-top-grid {
      display: grid;
      grid-template-columns: 1fr 45mm;
      flex: 0 0 auto;
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
      padding: 2mm 3mm 0;
      font-size: 22px;
      font-weight: 800;
      line-height: 1.1;
      overflow-wrap: anywhere;
    }

    .work-order-print-client-address {
      padding: 0.5mm 3mm 3mm;
      font-size: 12px;
      font-weight: 500;
      line-height: 1.15;
      overflow-wrap: anywhere;
    }

    .work-order-print-issue-box {
      display: flex;
      flex-direction: column;
    }

    .work-order-print-issue-cell {
      flex: 1 1 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1.5mm;
      padding: 2mm 0;
      text-align: center;
    }

    .work-order-print-issue-cell + .work-order-print-issue-cell {
      border-top: 1px solid #000;
    }

    .work-order-print-date {
      font-size: 23px;
      font-weight: 700;
      letter-spacing: 0;
    }

    /* Opis posla renders full width above the two-column lower area. It sizes to
       its content, capped by max-height; the auto-fit script shrinks the text to
       fit that cap when the description is long. */
    .work-order-print-job-description {
      display: flex;
      flex: 0 0 auto;
      max-height: 48mm;
      flex-direction: column;
      overflow: hidden;
      border-bottom: 2px solid #000;
      padding: 2mm 4mm 3mm;
    }

    .work-order-print-description-lines {
      font-size: 24px;
      font-weight: 400;
      line-height: 1.22;
      overflow-wrap: anywhere;
    }

    .work-order-print-job-items {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
      flex-direction: column;
      padding: 2mm 4mm 3mm;
    }

    /* Panel corner labels: OPIS POSLA and STAVKE, both top-left, with a gap below
       so the content does not crowd the label. */
    .work-order-print-panel-header {
      display: flex;
      margin-bottom: 2.5mm;
    }

    .work-order-print-panel-header-left {
      justify-content: flex-start;
    }

    .work-order-print-panel-label {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0;
    }

    .work-order-print-job-lines {
      font-size: 24px;
      font-weight: 400;
      line-height: 1.22;
      overflow-wrap: anywhere;
    }

    /* Stavke render as a table: an enumerated name column plus selling price,
       quantity, and line-total columns. Fixed layout keeps the columns from
       collapsing; collapsed borders keep the row separators aligned. */
    .work-order-print-items-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    .work-order-print-items-table th,
    .work-order-print-items-table td {
      padding: 1.8mm 0;
      vertical-align: baseline;
    }

    /* Separators run between rows only (header underline + a rule above each
       item), so the last item has no trailing line doubling with the total's
       border. */
    .work-order-print-items-table tbody td {
      border-top: 1px solid #000;
    }

    /* Column header row: small labels so it does not eat the item rows' height. */
    .work-order-print-items-table thead th {
      padding-top: 0;
      border-bottom: 1px solid #000;
      font-size: 11px;
      font-weight: 500;
      text-align: right;
      white-space: nowrap;
    }

    .work-order-print-items-table thead th.work-order-print-col-name {
      text-align: left;
    }

    /* The name column keeps the remaining width (no explicit width in a fixed
       table = leftover space) and wraps long names. */
    .work-order-print-col-name {
      text-align: left;
      overflow-wrap: anywhere;
    }

    /* Numeric columns: fixed width, right-aligned, with a left gutter so figures
       never touch the previous column. Scoped under the table so this padding
       wins over the shared cell-padding shorthand above. */
    .work-order-print-items-table .work-order-print-col-num {
      width: 30mm;
      padding-left: 3mm;
      text-align: right;
      white-space: nowrap;
    }

    .work-order-print-item-number {
      font-weight: 700;
    }

    .work-order-print-item-text {
      padding-left: 1.5mm;
    }

    .work-order-print-job-footer {
      margin-top: auto;
    }

    .work-order-print-contact {
      font-size: 25px;
      font-weight: 800;
      line-height: 1.1;
      overflow-wrap: anywhere;
    }

    .work-order-print-total {
      margin-top: 3mm;
      border-top: 2px solid #000;
      padding-top: 2mm;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 0;
      overflow-wrap: anywhere;
    }

    /* The delivery checklist keeps its right-hand column but its rows are pinned
       to the bottom of the column, leaving the freed space at the top. */
    .work-order-print-delivery-box {
      display: flex;
      flex: 0 0 55mm;
      min-height: 0;
      min-width: 0;
      flex-direction: column;
      justify-content: flex-end;
      border-left: 1px solid #000;
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

    .work-order-print-billing-box {
      display: grid;
      grid-template-columns: 50mm 55mm;
      align-content: center;
      justify-content: start;
      flex: 0 0 auto;
      min-height: 22mm;
      border-top: 2px solid #000;
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
      border-top: 2px solid #000;
    }

    /* When the notes (napomena) box is hidden, the shipping address takes the
       full row width instead of being pinned to the right-hand column. */
    .work-order-print-notes-row-solo {
      grid-template-columns: 1fr;
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

    .work-order-print-signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      flex: 0 0 auto;
      gap: 24mm;
      padding: 3mm 3mm 0;
    }

    /* A single merged signatory field, pinned to the bottom-right column. */
    .work-order-print-signatures > div {
      grid-column: 2;
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
    <h1 class="work-order-print-title">RADNI NALOG{{if .OrderNumber}}<span class="work-order-print-number">{{.OrderNumber}}</span>{{end}}</h1>

    <!-- KLIJENT + dates and OPIS POSLA span the full sheet width, above the
         two-column lower area (stavke/billing/notes beside the checklist). -->
    <div class="work-order-print-top-grid">
      <div class="work-order-print-client-box">
        <div class="work-order-print-label">KLIJENT</div>
        <div class="work-order-print-client-name">{{.ClientName}}</div>
        {{if .ClientAddress}}<div class="work-order-print-client-address">{{.ClientAddress}}</div>{{end}}
      </div>
      <div class="work-order-print-issue-box">
        <div class="work-order-print-issue-cell">
          <div class="work-order-print-date">{{.IssueDate}}</div>
          <div class="work-order-print-label">DATUM IZDAVANJA</div>
        </div>
        <div class="work-order-print-issue-cell">
          <div class="work-order-print-date">{{.PlannedDate}}</div>
          <div class="work-order-print-label">ROK ZAVRŠETKA POSLA</div>
        </div>
      </div>
    </div>

    <div class="work-order-print-job-description">
      <div class="work-order-print-panel-header work-order-print-panel-header-left">
        <span class="work-order-print-panel-label">OPIS POSLA</span>
      </div>
      <div class="work-order-print-description-lines">
        {{range .DescriptionLines}}
          <div>{{.}}</div>
        {{end}}
      </div>
    </div>

    <div class="work-order-print-body{{if not .ShowDelivery}} work-order-print-body-solo{{end}}">
      <div class="work-order-print-left-stack">
        <div class="work-order-print-job-items">
          <div class="work-order-print-panel-header work-order-print-panel-header-left">
            <span class="work-order-print-panel-label">STAVKE</span>
          </div>
          <div class="work-order-print-job-lines">
            <table class="work-order-print-items-table">
              <thead>
                <tr>
                  <th class="work-order-print-col-name">NAZIV</th>
                  <th class="work-order-print-col-num">CENA</th>
                  <th class="work-order-print-col-num">KOL.</th>
                  <th class="work-order-print-col-num">UKUPNO</th>
                </tr>
              </thead>
              <tbody>
                {{range $i, $row := .ItemRows}}
                  <tr>
                    <td class="work-order-print-col-name"><span class="work-order-print-item-number">{{inc $i}}.</span><span class="work-order-print-item-text">{{$row.Name}}</span></td>
                    <td class="work-order-print-col-num">{{$row.UnitPrice}}</td>
                    <td class="work-order-print-col-num">{{$row.Quantity}}</td>
                    <td class="work-order-print-col-num">{{$row.Total}}</td>
                  </tr>
                {{end}}
              </tbody>
            </table>
          </div>
          <div class="work-order-print-job-footer">
            {{if .ContactPerson}}
              <div class="work-order-print-contact">{{.ContactPerson}}</div>
            {{end}}
            {{if .TotalPrice}}
              <div class="work-order-print-total">UKUPNA CENA: {{.TotalPrice}}</div>
            {{end}}
          </div>
        </div>

        {{if .ShowBilling}}
        <div class="work-order-print-billing-box">
          {{range .BillingRows}}
            <div class="work-order-print-billing-row">
              <span>{{.Label}}</span>
              <span class="work-order-print-mark">{{if .Checked}}X{{end}}</span>
            </div>
          {{end}}
        </div>
        {{end}}

        {{if or .ShowNotes .ShowShippingAddress}}
        <div class="work-order-print-notes-row{{if not .ShowNotes}} work-order-print-notes-row-solo{{end}}">
          {{if .ShowNotes}}
          <div class="work-order-print-note-box">
            <div class="work-order-print-label">NAPOMENA</div>
            <div class="work-order-print-note-lines">
              {{range .NoteLines}}
                <div>{{.}}</div>
              {{end}}
            </div>
          </div>
          {{end}}
          {{if .ShowShippingAddress}}
          <div class="work-order-print-address-box">
            <div class="work-order-print-label">ADRESA ZA DOSTAVU:</div>
            {{if .ShippingAddress}}
              <div class="work-order-print-address">{{.ShippingAddress}}</div>
            {{end}}
          </div>
          {{end}}
        </div>
        {{end}}
      </div>

      {{if .ShowDelivery}}
      <div class="work-order-print-delivery-box">
        {{range .DeliveryRows}}
          <div class="work-order-print-check-row">
            <span>{{.Label}}</span>
            <span class="work-order-print-checkbox">{{if .Checked}}X{{end}}</span>
          </div>
        {{end}}
      </div>
      {{end}}
    </div>

    {{if .ShowSignatures}}
    <div class="work-order-print-signatures">
      <div>
        <div class="work-order-print-label work-order-print-align-right">IZDAO / IZVRŠILAC</div>
        <div class="work-order-print-signature-value">{{.ExecutedBy}}</div>
      </div>
    </div>
    {{end}}
  </section>
  <script>
    // Shrink the opis posla and stavke text until it fits its fixed-height panel.
    // Runs synchronously before the load event so chromedp captures the fitted
    // layout. Mirrors fitPanelFont in apps/web WorkOrderPrintSheet.tsx.
    (function () {
      var MIN = 9;
      function fit(panelSelector, contentSelector) {
        var panel = document.querySelector(panelSelector);
        var content = panel && panel.querySelector(contentSelector);
        if (!panel || !content) return;
        content.style.fontSize = '';
        var size = parseFloat(getComputedStyle(content).fontSize);
        while (size > MIN && panel.scrollHeight > panel.clientHeight) {
          size -= 0.5;
          content.style.fontSize = size + 'px';
        }
      }
      fit('.work-order-print-job-description', '.work-order-print-description-lines');
      fit('.work-order-print-job-items', '.work-order-print-job-lines');
      // Shrink any numeric stavke cell whose value is too wide for its fixed
      // column, so large figures scale down instead of overflowing.
      var cells = document.querySelectorAll('.work-order-print-job-lines .work-order-print-col-num');
      for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        cell.style.fontSize = '';
        var cs = parseFloat(getComputedStyle(cell).fontSize);
        while (cs > MIN && cell.scrollWidth > cell.clientWidth) {
          cs -= 0.5;
          cell.style.fontSize = cs + 'px';
        }
      }
    })();
  </script>
</body>
</html>`

var parsedTemplate = template.Must(template.New("work_order").Funcs(template.FuncMap{
	// inc renders a 1-based ordinal for enumerated stavke entries.
	"inc": func(i int) int { return i + 1 },
}).Parse(htmlTemplateStr))

// ResolvePrintShippingAddress returns the order's explicit delivery address only.
// It intentionally does not fall back to the client's location address: the
// delivery address is meant to be a separate destination, and the client's own
// address is shown at the top of the nalog (under the client name).
func ResolvePrintShippingAddress(order domain.WorkOrder) string {
	return uppercaseLine(order.Shipping.ShippingAddress)
}

func RenderWorkOrderHTML(order domain.WorkOrder, locationAddress *string, sections domain.PDFSections, firmName string, billingDefaults domain.BillingDefaults) (string, error) {
	plannedDate := order.DueDate
	if plannedDate == nil {
		plannedDate = order.CompletionDate
	}

	completed := order.IsCompleted || order.Status == domain.WorkOrderStatusInvoiced

	execBy := ""
	if order.ExecutedBy != nil {
		execBy = *order.ExecutedBy
	}

	data := WorkOrderPrintData{
		FirmName:         strings.TrimSpace(firmName),
		OrderNumber:      order.OrderNumber,
		ClientName:       uppercaseString(order.ClientName),
		ClientAddress:    uppercaseLine(locationAddress),
		IssueDate:        formatOptionalDate(&order.IssueDate),
		DescriptionLines: buildPrintDescriptionLines(order),
		ItemRows:         buildPrintItemRows(order),
		TotalPrice:       formatPrintPrice(order.Price),
		ContactPerson:    uppercaseLine(order.ContactPerson),
		DeliveryRows:     getPrintDeliveryRows(order.Shipping),
		PlannedDate:      formatOptionalDate(plannedDate),
		BillingRows:      getPrintBillingRows(resolveBillingDocumentType(order, billingDefaults)),
		NoteLines:        buildPrintNoteLines(order),
		ShippingAddress:  ResolvePrintShippingAddress(order),
		Completed:        completed,
		CompletionDate:   formatOptionalDate(order.CompletionDate),
		ExecutedBy:       execBy,

		ShowDelivery:        sections.Delivery,
		ShowBilling:         sections.Billing,
		ShowNotes:           sections.Notes,
		ShowShippingAddress: sections.ShippingAddress,
		ShowCompletion:      sections.Completion,
		ShowSignatures:      sections.Signatures,
	}

	var sb strings.Builder
	if err := parsedTemplate.Execute(&sb, data); err != nil {
		return "", err
	}
	return sb.String(), nil
}

func RenderWorkOrderPDF(ctx context.Context, order domain.WorkOrder, locationAddress *string, sections domain.PDFSections, firmName string, billingDefaults domain.BillingDefaults) ([]byte, error) {
	htmlContent, err := RenderWorkOrderHTML(order, locationAddress, sections, firmName, billingDefaults)
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
				WithPaperWidth(8.27).   // A4 Width in inches (210mm)
				WithPaperHeight(11.69). // A4 Height in inches (297mm)
				WithMarginTop(0.787).     // 20mm, white space above the title
				WithMarginBottom(0.0787). // 2mm, so content reaches near the page bottom
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
