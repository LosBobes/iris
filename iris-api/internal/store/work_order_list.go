package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Work-order list queues. They mirror the dashboard tiles, which leave
// cancelled orders out.
const (
	WorkOrderQueueUnassigned = "unassigned"
	WorkOrderQueueOverdue    = "overdue"
	WorkOrderQueueToday      = "today"
	WorkOrderQueueThisWeek   = "thisWeek"
)

// IsWorkOrderQueue reports whether value names a list queue bucket.
func IsWorkOrderQueue(value string) bool {
	switch value {
	case WorkOrderQueueUnassigned, WorkOrderQueueOverdue, WorkOrderQueueToday, WorkOrderQueueThisWeek:
		return true
	}
	return false
}

// FoldSearchText lowercases text and folds the Serbian Latin diacritics
// (č, ć → c; š → s; ž → z; đ → dj), the same rule the web command palette uses,
// so "cobanovic" finds "Čobanović". SQLite's LOWER() is ASCII-only, which is why
// the folding happens in Go — both for the stored search_text column and for
// the query term.
func FoldSearchText(value string) string {
	var builder strings.Builder
	builder.Grow(len(value))
	for _, r := range strings.ToLower(value) {
		switch r {
		case 'č', 'ć':
			builder.WriteByte('c')
		case 'š':
			builder.WriteByte('s')
		case 'ž':
			builder.WriteByte('z')
		case 'đ':
			builder.WriteString("dj")
		default:
			builder.WriteRune(r)
		}
	}
	return builder.String()
}

// WorkOrderSummary returns the list projection of a work order: the order
// without the per-order history collections that only the detail page reads.
// The selling side (InvoiceDraft) stays, since duplicating an order from the
// list pre-fills the form from it.
func WorkOrderSummary(workOrder domain.WorkOrder) domain.WorkOrder {
	workOrder.StatusHistory = nil
	workOrder.InternalNotes = nil
	workOrder.CustomerNotes = nil
	workOrder.Events = nil
	workOrder.Attachments = nil
	workOrder.MaterialUsage = nil
	workOrder.TimeEntries = nil
	return workOrder
}

// workOrderListColumns are the denormalized work_orders columns that back
// server-side list filtering, sorting and the summary projection. They are
// derived from the payload on every write (putWorkOrder) and backfilled by
// migration v24.
type workOrderListColumns struct {
	BillingDocumentType any
	DeliveryMethod      any
	Priority            string
	IsCompleted         int
	SearchText          string
	OrderNumberSort     string
	SummaryPayload      string
}

func listColumnsFor(workOrder domain.WorkOrder) (workOrderListColumns, error) {
	summary, err := json.Marshal(WorkOrderSummary(workOrder))
	if err != nil {
		return workOrderListColumns{}, fmt.Errorf("encode work order summary: %w", err)
	}
	columns := workOrderListColumns{
		Priority:        string(workOrder.Assignment.Priority),
		IsCompleted:     boolInt(workOrder.IsCompleted),
		SearchText:      workOrderSearchText(workOrder),
		OrderNumberSort: orderNumberSortKey(workOrder.OrderNumber),
		SummaryPayload:  string(summary),
	}
	if workOrder.BillingDocumentType != nil && *workOrder.BillingDocumentType != "" {
		columns.BillingDocumentType = string(*workOrder.BillingDocumentType)
	}
	if workOrder.Shipping.DeliveryMethod != nil && *workOrder.Shipping.DeliveryMethod != "" {
		columns.DeliveryMethod = string(*workOrder.Shipping.DeliveryMethod)
	}
	return columns, nil
}

// workOrderSearchText is the folded free-text haystack of a work order. It
// covers the list columns the web table shows: order number, client, job
// description, operator, priority and document type (raw value + Serbian
// label), the issue/due dates (ISO and DD.MM.YYYY) and the price (raw and
// formatted as "12.500,5 RSD").
func workOrderSearchText(workOrder domain.WorkOrder) string {
	parts := []string{
		workOrder.OrderNumber,
		workOrder.ClientName,
		workOrder.JobDescription,
	}
	if workOrder.Assignment.AssignedTo != nil {
		parts = append(parts, *workOrder.Assignment.AssignedTo)
	}
	if workOrder.Assignment.Priority != "" {
		parts = append(parts, string(workOrder.Assignment.Priority), workOrderPriorityLabel(workOrder.Assignment.Priority))
	}
	if workOrder.BillingDocumentType != nil && *workOrder.BillingDocumentType != "" {
		parts = append(parts, string(*workOrder.BillingDocumentType), billingDocumentTypeLabel(workOrder.BillingDocumentType))
	}
	for _, date := range []*string{&workOrder.IssueDate, workOrder.DueDate} {
		if date != nil && *date != "" {
			parts = append(parts, *date, displayDate(*date))
		}
	}
	if workOrder.Price != nil {
		parts = append(parts,
			strconv.FormatFloat(*workOrder.Price, 'f', -1, 64),
			FormatSerbianAmount(*workOrder.Price)+" RSD",
		)
	}
	return FoldSearchText(strings.Join(parts, " "))
}

// displayDate turns YYYY-MM-DD into DD.MM.YYYY; other input passes through.
func displayDate(value string) string {
	parts := strings.Split(value, "-")
	if len(parts) != 3 {
		return value
	}
	return parts[2] + "." + parts[1] + "." + parts[0]
}

// FormatSerbianAmount formats a number the way the web table does
// (Intl.NumberFormat("sr-Latn-RS"), 0–2 fraction digits): "." groups
// thousands and "," separates decimals, e.g. 1234567.891 → "1.234.567,89".
func FormatSerbianAmount(value float64) string {
	formatted := strconv.FormatFloat(value, 'f', 2, 64)
	negative := strings.HasPrefix(formatted, "-")
	formatted = strings.TrimPrefix(formatted, "-")
	integer, fraction, _ := strings.Cut(formatted, ".")
	fraction = strings.TrimRight(fraction, "0")

	var grouped strings.Builder
	for index, digit := range integer {
		if index > 0 && (len(integer)-index)%3 == 0 {
			grouped.WriteByte('.')
		}
		grouped.WriteRune(digit)
	}
	result := grouped.String()
	if fraction != "" {
		result += "," + fraction
	}
	if negative && strings.Trim(result, "0.,") != "" {
		result = "-" + result
	}
	return result
}

// orderNumberSortKey zero-pads every digit run so a plain text ORDER BY sorts
// order numbers by their embedded numbers (RN-2026-9 before RN-2026-10), the
// way the web table compares them.
func orderNumberSortKey(orderNumber string) string {
	const width = 20
	var builder strings.Builder
	digits := strings.Builder{}
	flush := func() {
		if digits.Len() == 0 {
			return
		}
		run := strings.TrimLeft(digits.String(), "0")
		if len(run) < width {
			builder.WriteString(strings.Repeat("0", width-len(run)))
		}
		builder.WriteString(run)
		digits.Reset()
	}
	for _, r := range strings.ToLower(orderNumber) {
		if r >= '0' && r <= '9' {
			digits.WriteRune(r)
			continue
		}
		flush()
		builder.WriteRune(r)
	}
	flush()
	return builder.String()
}

// listToday returns the query's "today" (the client's local date) or the
// server's current UTC date when none was given.
func listToday(query WorkOrderListQuery) string {
	if query.Today != "" {
		return query.Today
	}
	return time.Now().UTC().Format("2006-01-02")
}

// addDays shifts a YYYY-MM-DD date; an unparsable date is returned unchanged.
func addDays(date string, days int) string {
	parsed, err := time.Parse("2006-01-02", date)
	if err != nil {
		return date
	}
	return parsed.AddDate(0, 0, days).Format("2006-01-02")
}

// escapeLike escapes the LIKE wildcards in a user term (used with ESCAPE '\').
func escapeLike(value string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(value)
}

func buildWorkOrderWhere(tenantID string, query WorkOrderListQuery) (string, []any) {
	clauses := []string{"tenant_id = ?"}
	args := []any{tenantID}
	if search := FoldSearchText(strings.TrimSpace(query.Search)); search != "" {
		clauses = append(clauses, `search_text LIKE ? ESCAPE '\'`)
		args = append(args, "%"+escapeLike(search)+"%")
	}
	if query.Status != "" {
		clauses = append(clauses, `status = ?`)
		args = append(args, string(query.Status))
	}
	if query.AssignedTo != "" {
		clauses = append(clauses, `assigned_to = ?`)
		args = append(args, query.AssignedTo)
	}
	if query.CustomerID != "" {
		clauses = append(clauses, `customer_id = ?`)
		args = append(args, query.CustomerID)
	}
	if query.BillingDocumentType != "" {
		clauses = append(clauses, `billing_document_type = ?`)
		args = append(args, query.BillingDocumentType)
	}
	if query.DeliveryMethod != "" {
		clauses = append(clauses, `delivery_method = ?`)
		args = append(args, query.DeliveryMethod)
	}
	if query.DateFrom != "" {
		clauses = append(clauses, `issue_date >= ?`)
		args = append(args, query.DateFrom)
	}
	if query.DateTo != "" {
		clauses = append(clauses, `issue_date <= ?`)
		args = append(args, query.DateTo)
	}
	if query.NeedsCostReview {
		clauses = append(clauses, `needs_cost_review = 1`)
	}
	if IsWorkOrderQueue(query.Queue) {
		today := listToday(query)
		clauses = append(clauses, `status <> 'cancelled'`)
		switch query.Queue {
		case WorkOrderQueueUnassigned:
			clauses = append(clauses, `(assigned_to IS NULL OR assigned_to = '')`)
		case WorkOrderQueueOverdue:
			clauses = append(clauses, `due_date IS NOT NULL AND due_date <> '' AND due_date < ? AND is_completed = 0`)
			args = append(args, today)
		case WorkOrderQueueToday:
			clauses = append(clauses, `due_date = ?`)
			args = append(args, today)
		case WorkOrderQueueThisWeek:
			clauses = append(clauses, `due_date >= ? AND due_date <= ?`)
			args = append(args, today, addDays(today, 7))
		}
	}
	return "WHERE " + strings.Join(clauses, " AND "), args
}

// workOrderOrderBy maps a list sort key ("field" or "-field") to ORDER BY.
// Missing values sort last in both directions, like the web table; the
// default (empty key) is newest issue date first.
func workOrderOrderBy(sortKey string) string {
	desc := strings.HasPrefix(sortKey, "-") || sortKey == ""
	field := strings.TrimPrefix(sortKey, "-")
	direction := "ASC"
	if desc {
		direction = "DESC"
	}
	nullable := func(column string) string {
		return "ORDER BY (" + column + " IS NULL) ASC, " + column + " " + direction + ", id ASC"
	}
	switch field {
	case "orderNumber":
		return "ORDER BY order_number_sort " + direction + ", id ASC"
	case "clientName":
		return "ORDER BY LOWER(client_name) " + direction + ", id ASC"
	case "jobDescription":
		return "ORDER BY LOWER(job_description) " + direction + ", id ASC"
	case "status":
		return "ORDER BY status " + direction + ", id ASC"
	case "assignedTo":
		return nullable("assigned_to")
	case "priority":
		return "ORDER BY CASE priority WHEN 'low' THEN 0 WHEN 'normal' THEN 1 WHEN 'high' THEN 2 WHEN 'urgent' THEN 3 ELSE 4 END " +
			direction + ", id ASC"
	case "billingDocumentType":
		return nullable("billing_document_type")
	case "deliveryMethod":
		return nullable("delivery_method")
	case "dueDate":
		return nullable("due_date")
	case "price":
		return nullable("price")
	default:
		return "ORDER BY issue_date " + direction + ", id ASC"
	}
}

// workOrderMatchesListQuery is the in-memory twin of buildWorkOrderWhere, used
// by the fixture store.
func workOrderMatchesListQuery(workOrder domain.WorkOrder, query WorkOrderListQuery) bool {
	if search := FoldSearchText(strings.TrimSpace(query.Search)); search != "" &&
		!strings.Contains(workOrderSearchText(workOrder), search) {
		return false
	}
	if query.Status != "" && workOrder.Status != query.Status {
		return false
	}
	assignedTo := ""
	if workOrder.Assignment.AssignedTo != nil {
		assignedTo = *workOrder.Assignment.AssignedTo
	}
	if query.AssignedTo != "" && assignedTo != query.AssignedTo {
		return false
	}
	if query.CustomerID != "" && (workOrder.CustomerID == nil || *workOrder.CustomerID != query.CustomerID) {
		return false
	}
	if query.BillingDocumentType != "" &&
		(workOrder.BillingDocumentType == nil || string(*workOrder.BillingDocumentType) != query.BillingDocumentType) {
		return false
	}
	if query.DeliveryMethod != "" &&
		(workOrder.Shipping.DeliveryMethod == nil || string(*workOrder.Shipping.DeliveryMethod) != query.DeliveryMethod) {
		return false
	}
	if query.DateFrom != "" && workOrder.IssueDate < query.DateFrom {
		return false
	}
	if query.DateTo != "" && workOrder.IssueDate > query.DateTo {
		return false
	}
	if query.NeedsCostReview && !workOrder.NeedsCostReview {
		return false
	}
	if IsWorkOrderQueue(query.Queue) {
		if workOrder.Status == domain.WorkOrderStatusCancelled {
			return false
		}
		today := listToday(query)
		dueDate := ""
		if workOrder.DueDate != nil {
			dueDate = *workOrder.DueDate
		}
		switch query.Queue {
		case WorkOrderQueueUnassigned:
			if assignedTo != "" {
				return false
			}
		case WorkOrderQueueOverdue:
			if dueDate == "" || dueDate >= today || workOrder.IsCompleted {
				return false
			}
		case WorkOrderQueueToday:
			if dueDate != today {
				return false
			}
		case WorkOrderQueueThisWeek:
			if dueDate == "" || dueDate < today || dueDate > addDays(today, 7) {
				return false
			}
		}
	}
	return true
}

// filterWorkOrders applies a list query's filters and sort in memory (fixture
// store); paging is left to the caller.
func filterWorkOrders(workOrders []domain.WorkOrder, query WorkOrderListQuery) []domain.WorkOrder {
	filtered := make([]domain.WorkOrder, 0, len(workOrders))
	for _, workOrder := range workOrders {
		if workOrderMatchesListQuery(workOrder, query) {
			filtered = append(filtered, workOrder)
		}
	}
	sortWorkOrders(filtered, query.Sort)
	return filtered
}

// sortWorkOrders is the in-memory twin of workOrderOrderBy (fixture store).
func sortWorkOrders(workOrders []domain.WorkOrder, sortKey string) {
	desc := strings.HasPrefix(sortKey, "-") || sortKey == ""
	field := strings.TrimPrefix(sortKey, "-")
	sort.SliceStable(workOrders, func(i int, j int) bool {
		a, aMissing := workOrderSortValue(workOrders[i], field)
		b, bMissing := workOrderSortValue(workOrders[j], field)
		if aMissing != bMissing {
			return bMissing
		}
		if desc {
			return a > b
		}
		return a < b
	})
}

// workOrderSortValue returns a comparable string for a sort field and whether
// the value is missing (missing values sort last).
func workOrderSortValue(workOrder domain.WorkOrder, field string) (string, bool) {
	optional := func(value *string) (string, bool) {
		if value == nil {
			return "", true
		}
		return *value, false
	}
	switch field {
	case "orderNumber":
		return orderNumberSortKey(workOrder.OrderNumber), false
	case "clientName":
		return strings.ToLower(workOrder.ClientName), false
	case "jobDescription":
		return strings.ToLower(workOrder.JobDescription), false
	case "status":
		return string(workOrder.Status), false
	case "assignedTo":
		return optional(workOrder.Assignment.AssignedTo)
	case "priority":
		rank := map[domain.WorkOrderPriority]string{"low": "0", "normal": "1", "high": "2", "urgent": "3"}
		if value, ok := rank[workOrder.Assignment.Priority]; ok {
			return value, false
		}
		return "4", false
	case "billingDocumentType":
		if workOrder.BillingDocumentType == nil {
			return "", true
		}
		return string(*workOrder.BillingDocumentType), false
	case "deliveryMethod":
		if workOrder.Shipping.DeliveryMethod == nil {
			return "", true
		}
		return string(*workOrder.Shipping.DeliveryMethod), false
	case "dueDate":
		return optional(workOrder.DueDate)
	case "price":
		if workOrder.Price == nil {
			return "", true
		}
		// Offset so negative values still order correctly as text.
		return fmt.Sprintf("%030.4f", *workOrder.Price+1e15), false
	default:
		return workOrder.IssueDate, false
	}
}

// workOrderListColumnsMigration (v24) adds the denormalized list columns —
// billing_document_type, delivery_method, priority, is_completed, search_text
// (folded haystack), order_number_sort (natural-sort key) and summary_payload
// (the slim list JSON) — plus tenant-scoped indexes, then backfills every row
// from its payload. The backfill needs the Go folding/formatting logic, hence a
// Go migration; the DDL is plain portable SQL.
func workOrderListColumnsMigration(ctx context.Context, db *sql.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin work-order list columns migration: %w", err)
	}
	defer tx.Rollback()

	statements := []string{
		`ALTER TABLE work_orders ADD COLUMN billing_document_type TEXT`,
		`ALTER TABLE work_orders ADD COLUMN delivery_method TEXT`,
		`ALTER TABLE work_orders ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'`,
		`ALTER TABLE work_orders ADD COLUMN is_completed INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE work_orders ADD COLUMN search_text TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE work_orders ADD COLUMN order_number_sort TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE work_orders ADD COLUMN summary_payload TEXT`,
		`CREATE INDEX IF NOT EXISTS idx_work_orders_tenant_order_number_sort ON work_orders(tenant_id, order_number_sort)`,
		`CREATE INDEX IF NOT EXISTS idx_work_orders_tenant_due_date ON work_orders(tenant_id, due_date)`,
		`CREATE INDEX IF NOT EXISTS idx_work_orders_tenant_customer ON work_orders(tenant_id, customer_id)`,
		`CREATE INDEX IF NOT EXISTS idx_work_orders_tenant_billing ON work_orders(tenant_id, billing_document_type)`,
		`CREATE INDEX IF NOT EXISTS idx_work_orders_tenant_delivery ON work_orders(tenant_id, delivery_method)`,
		`CREATE INDEX IF NOT EXISTS idx_work_orders_tenant_status ON work_orders(tenant_id, status)`,
	}
	for _, statement := range statements {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("work-order list columns migration: %w", err)
		}
	}
	if err := backfillWorkOrderListColumns(ctx, tx); err != nil {
		return err
	}
	return tx.Commit()
}

// backfillWorkOrderListColumns recomputes the denormalized list columns of
// every work order from its stored payload.
func backfillWorkOrderListColumns(ctx context.Context, tx *sql.Tx) error {
	type pending struct {
		id      string
		payload string
	}
	rows, err := tx.QueryContext(ctx, `SELECT id, payload FROM work_orders`)
	if err != nil {
		return fmt.Errorf("read work orders for backfill: %w", err)
	}
	var orders []pending
	for rows.Next() {
		var row pending
		if err := rows.Scan(&row.id, &row.payload); err != nil {
			rows.Close()
			return fmt.Errorf("scan work order for backfill: %w", err)
		}
		orders = append(orders, row)
	}
	if err := rows.Close(); err != nil {
		return err
	}

	for _, row := range orders {
		var workOrder domain.WorkOrder
		if err := json.Unmarshal([]byte(row.payload), &workOrder); err != nil {
			return fmt.Errorf("decode work order %s for backfill: %w", row.id, err)
		}
		columns, err := listColumnsFor(workOrder)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(
			ctx,
			`UPDATE work_orders SET billing_document_type = ?, delivery_method = ?, priority = ?,
			   is_completed = ?, search_text = ?, order_number_sort = ?, summary_payload = ?
			 WHERE id = ?`,
			columns.BillingDocumentType, columns.DeliveryMethod, columns.Priority,
			columns.IsCompleted, columns.SearchText, columns.OrderNumberSort, columns.SummaryPayload,
			row.id,
		); err != nil {
			return fmt.Errorf("backfill work order %s: %w", row.id, err)
		}
	}
	return nil
}
