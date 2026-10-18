package store

import (
	"io"
	"strconv"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// WorkOrderCSVColumns lists the exportable work-order list columns in their
// canonical order, keyed like the web table's columns, with the Serbian header
// the table shows.
var WorkOrderCSVColumns = []struct {
	Key    string
	Header string
}{
	{"orderNumber", "Br. naloga"},
	{"clientName", "Klijent"},
	{"jobDescription", "Opis posla"},
	{"assigned", "Operater"},
	{"priority", "Prioritet"},
	{"billing", "Tip dokumenta"},
	{"schedule", "Plan"},
	{"price", "Cena"},
	{"status", "Status"},
}

// WriteWorkOrdersCSV writes the work-order list export: a UTF-8 BOM (so Excel
// renders Serbian characters), a header row and one row per order, CRLF line
// endings and RFC 4180 quoting. Only the columns named in keys are written
// (in canonical order); an empty keys writes every column. Values match the
// web export: enum fields as Serbian labels, the due date as DD.MM.YYYY and
// the selling price as a raw number spreadsheets can parse.
func WriteWorkOrdersCSV(w io.Writer, orders []domain.WorkOrder, keys []string) error {
	wanted := make(map[string]bool, len(keys))
	for _, key := range keys {
		wanted[strings.TrimSpace(key)] = true
	}
	var headers, columns []string
	for _, column := range WorkOrderCSVColumns {
		if len(keys) == 0 || wanted[column.Key] || column.Key == "orderNumber" {
			headers = append(headers, column.Header)
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
			values[index] = workOrderCSVValue(order, key)
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

func workOrderCSVValue(order domain.WorkOrder, key string) string {
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
		return workOrderPriorityLabel(order.Assignment.Priority)
	case "billing":
		if order.BillingDocumentType == nil || *order.BillingDocumentType == "" {
			return ""
		}
		return billingDocumentTypeLabel(order.BillingDocumentType)
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
		return workOrderStatusLabel(order.Status)
	}
	return ""
}
