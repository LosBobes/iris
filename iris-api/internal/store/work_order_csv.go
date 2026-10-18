package store

import (
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// WorkOrderCSVColumns lists the exportable work-order list columns in their
// canonical order, keyed like the web table's columns, with the Serbian and
// English headers the table shows.
var WorkOrderCSVColumns = []struct {
	Key      string
	Header   string
	HeaderEN string
}{
	{"orderNumber", "Br. naloga", "Order no."},
	{"clientName", "Klijent", "Client"},
	{"jobDescription", "Opis posla", "Job description"},
	{"assigned", "Operater", "Operator"},
	{"priority", "Prioritet", "Priority"},
	{"billing", "Tip dokumenta", "Document type"},
	{"schedule", "Plan", "Schedule"},
	{"price", "Cena", "Price"},
	{"status", "Status", "Status"},
}

// CSV export languages (the `lang` query parameter); anything else is Serbian.
const (
	CSVLanguageSerbian = "sr"
	CSVLanguageEnglish = "en"
)

// English labels of the enum columns, matching the web app's en bundle. A
// value without one (an admin-added document type) is exported as stored.
var (
	csvPriorityLabelsEN = map[domain.WorkOrderPriority]string{
		domain.WorkOrderPriorityLow:    "Low",
		domain.WorkOrderPriorityNormal: "Normal",
		domain.WorkOrderPriorityHigh:   "High",
		domain.WorkOrderPriorityUrgent: "Urgent",
	}
	csvBillingLabelsEN = map[domain.BillingDocumentType]string{
		domain.BillingDocumentTypeInvoice:        "Invoice",
		domain.BillingDocumentTypeCashCollection: "Cash on delivery",
		domain.BillingDocumentTypeProforma:       "Proforma",
	}
	csvStatusLabelsEN = map[domain.WorkOrderStatus]string{
		domain.WorkOrderStatusNew:                 "New",
		domain.WorkOrderStatusAssigned:            "Assigned",
		domain.WorkOrderStatusInProgress:          "In progress",
		domain.WorkOrderStatusWaitingForCustomer:  "Waiting for customer",
		domain.WorkOrderStatusWaitingForMaterials: "Waiting for materials",
		domain.WorkOrderStatusCompleted:           "Completed",
		domain.WorkOrderStatusCancelled:           "Cancelled",
		domain.WorkOrderStatusInvoiced:            "Invoiced",
	}
)

// csvFormulaSafe neutralizes a text cell a spreadsheet would run as a formula
// (CSV/formula injection): a leading =, +, -, @, tab or carriage return gets a
// leading apostrophe. Applied to text columns only; the price stays a number.
func csvFormulaSafe(value string) string {
	if value == "" {
		return value
	}
	switch value[0] {
	case '=', '+', '-', '@', '\t', '\r':
		return "'" + value
	}
	return value
}

// WriteWorkOrdersCSV writes the work-order list export: a UTF-8 BOM (so Excel
// renders Serbian characters), a header row and one row per order, CRLF line
// endings and RFC 4180 quoting. Only the columns named in keys are written
// (in canonical order); an empty keys writes every column. Values match the
// web export: enum fields as labels, the due date as DD.MM.YYYY and the
// selling price as a raw number spreadsheets can parse. lang picks the header
// and label language (CSVLanguageEnglish, otherwise Serbian). Text cells that
// would start a spreadsheet formula are prefixed with an apostrophe.
func WriteWorkOrdersCSV(w io.Writer, orders []domain.WorkOrder, keys []string, lang string) error {
	english := lang == CSVLanguageEnglish
	wanted := make(map[string]bool, len(keys))
	for _, key := range keys {
		wanted[strings.TrimSpace(key)] = true
	}
	var headers, columns []string
	for _, column := range WorkOrderCSVColumns {
		if len(keys) == 0 || wanted[column.Key] || column.Key == "orderNumber" {
			header := column.Header
			if english {
				header = column.HeaderEN
			}
			headers = append(headers, header)
			columns = append(columns, column.Key)
		}
	}

	var builder strings.Builder
	builder.WriteString(string([]byte{0xEF, 0xBB, 0xBF})) // UTF-8 BOM
	writeCSVRow(&builder, headers)
	for _, order := range orders {
		builder.WriteString("\r\n")
		values := make([]string, len(columns))
		for index, key := range columns {
			value := workOrderCSVValue(order, key, english)
			if key != "price" {
				value = csvFormulaSafe(value)
			}
			values[index] = value
		}
		writeCSVRow(&builder, values)
	}
	_, err := io.WriteString(w, builder.String())
	return err
}

func writeCSVRow(builder *strings.Builder, values []string) {
	for index, value := range values {
		if index > 0 {
			builder.WriteByte(',')
		}
		if strings.ContainsAny(value, "\",\r\n") {
			value = `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
		}
		builder.WriteString(value)
	}
}

func csvLabel[K comparable](english bool, labels map[K]string, value K, serbian func() string) string {
	if english {
		if label, ok := labels[value]; ok {
			return label
		}
		return fmt.Sprint(value)
	}
	return serbian()
}

func workOrderCSVValue(order domain.WorkOrder, key string, english bool) string {
	switch key {
	case "orderNumber":
		return order.OrderNumber
	case "clientName":
		return order.ClientName
	case "jobDescription":
		return order.JobDescription
	case "assigned":
		if order.Assignment.AssignedTo == nil {
			return ""
		}
		return *order.Assignment.AssignedTo
	case "priority":
		return csvLabel(english, csvPriorityLabelsEN, order.Assignment.Priority, func() string {
			return workOrderPriorityLabel(order.Assignment.Priority)
		})
	case "billing":
		if order.BillingDocumentType == nil || *order.BillingDocumentType == "" {
			return ""
		}
		return csvLabel(english, csvBillingLabelsEN, *order.BillingDocumentType, func() string {
			return billingDocumentTypeLabel(order.BillingDocumentType)
		})
	case "schedule":
		if order.DueDate == nil || *order.DueDate == "" {
			return ""
		}
		return displayDate(*order.DueDate)
	case "price":
		if order.Price == nil {
			return ""
		}
		return strconv.FormatFloat(*order.Price, 'f', -1, 64)
	case "status":
		return csvLabel(english, csvStatusLabelsEN, order.Status, func() string {
			return workOrderStatusLabel(order.Status)
		})
	}
	return ""
}
