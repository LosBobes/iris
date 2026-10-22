package invoice

import (
	"context"
	_ "embed"
	"fmt"
	"html/template"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/reports"
)

//go:embed invoice.html.tmpl
var invoiceTemplate string

var parsedTemplate = template.Must(template.New("invoice").Funcs(template.FuncMap{
	"money": FormatMoney,
	"price": func(v float64) string { return FormatMoney(toPara(v)) },
	"qty":   formatQuantity,
	"pct":   formatPercent,
	"date":  formatDate,
	"inc":   func(i int) int { return i + 1 },
}).Parse(invoiceTemplate))

// footerTemplate is Chrome's page footer: page count and the issuing program.
// Chrome renders it in its own tiny-font context, so the styles are inline.
const footerTemplate = `<div style="width:100%;font-family:'Liberation Sans',Arial,sans-serif;font-size:7px;color:#6b7c8f;padding:0 12mm;display:flex;justify-content:space-between;">` +
	`<span>Strana <span class="pageNumber"></span> od <span class="totalPages"></span></span>` +
	`<span>Iris · operativni sistem za proizvodne i uslužne radnje</span></div>`

var pageLayout = reports.PageLayout{MarginTop: 0.47, MarginBottom: 0.55, MarginLeft: 0.47, MarginRight: 0.47, FooterTemplate: footerTemplate}

type templateData struct {
	Invoice
	Totals
	PaymentModel     string
	PaymentReference string
	VatExemptNote    string
	Generated        string
}

// RenderHTML renders the invoice as a self-contained A4 HTML document.
func RenderHTML(inv Invoice) (string, error) {
	model, reference := inv.ReferenceNumber()
	data := templateData{
		Invoice:          inv,
		Totals:           inv.Compute(),
		PaymentModel:     model,
		PaymentReference: reference,
		Generated:        time.Now().Format("02.01.2006 15:04"),
	}
	if !inv.Seller.VatPayer {
		data.VatExemptNote = vatExemptNote
	}
	var sb strings.Builder
	if err := parsedTemplate.Execute(&sb, data); err != nil {
		return "", err
	}
	return sb.String(), nil
}

// RenderPDF renders the invoice and prints it to PDF in headless Chromium.
func RenderPDF(ctx context.Context, inv Invoice) ([]byte, error) {
	html, err := RenderHTML(inv)
	if err != nil {
		return nil, err
	}
	return reports.RenderHTMLToPDF(ctx, html, pageLayout)
}

// FormatMoney prints para as Serbian dinars with two decimals: 38773284 ->
// "387.732,84".
func FormatMoney(para int64) string {
	sign := ""
	if para < 0 {
		sign, para = "-", -para
	}
	return fmt.Sprintf("%s%s,%02d", sign, groupThousands(para/100), para%100)
}

func groupThousands(n int64) string {
	digits := fmt.Sprintf("%d", n)
	var out strings.Builder
	for i, r := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			out.WriteByte('.')
		}
		out.WriteRune(r)
	}
	return out.String()
}

// formatQuantity prints three decimals like the classic račun: 2 -> "2,000".
func formatQuantity(q float64) string {
	milli := int64(q*1000 + 0.5)
	return fmt.Sprintf("%s,%03d", groupThousands(milli/1000), milli%1000)
}

// formatPercent prints a rate without trailing zeros: 20 -> "20", 2.5 -> "2,5".
func formatPercent(p float64) string {
	return strings.ReplaceAll(strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.2f", p), "0"), "."), ".", ",")
}

// formatDate turns a stored YYYY-MM-DD date into the displayed DD.MM.YYYY.
func formatDate(value string) string {
	parsed, err := time.Parse(time.DateOnly, value)
	if err != nil {
		return value
	}
	return parsed.Format("02.01.2006")
}
