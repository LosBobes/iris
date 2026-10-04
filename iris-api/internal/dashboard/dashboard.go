// Package dashboard holds the pure, server-side dashboard aggregation. It is a
// faithful port of the web client's former client-side aggregation
// (apps/web/src/lib/dashboard/aggregations.ts and profit.ts), including
// insertion-order tie-breaks and Serbian (Latin) collation.
package dashboard

import (
	"math"
	"sort"
	"strings"
	"time"

	"golang.org/x/text/collate"
	"golang.org/x/text/language"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// DateLayout is the YYYY-MM-DD layout used for every date in the contract.
const DateLayout = "2006-01-02"

// Filters scope the "filtered" aggregates (summary, buckets, delivery, top
// clients, finance). Empty strings mean "no filter".
type Filters struct {
	DateFrom string
	DateTo   string
	IssuedBy string
	// CompanyKey scopes only the per-item profit breakdown.
	CompanyKey string
}

// Options is the input to Build besides the orders themselves.
type Options struct {
	Filters Filters
	// Today is the caller's local date (YYYY-MM-DD).
	Today string
	// IsAdmin gates the cost-derived Finance section.
	IsAdmin bool
	// Username is the session user, for the operator queue.
	Username string
}

// Signal severities, mirroring ATTENTION_SIGNAL_SEVERITY.
const (
	severityOverdue     = 600
	severityDueToday    = 500
	severityDueThisWeek = 400
	severityUnassigned  = 100
)

type signal int

const (
	signalOverdue signal = iota
	signalDueToday
	signalDueThisWeek
	signalUnassigned
)

var coreSignals = []signal{signalOverdue, signalDueToday, signalDueThisWeek}
var internalSignals = []signal{signalUnassigned}

func (s signal) severity() int {
	switch s {
	case signalOverdue:
		return severityOverdue
	case signalDueToday:
		return severityDueToday
	case signalDueThisWeek:
		return severityDueThisWeek
	default:
		return severityUnassigned
	}
}

// statusOrder mirrors WORK_ORDER_STATUS_ORDER.
var statusOrder = []domain.WorkOrderStatus{
	domain.WorkOrderStatusNew,
	domain.WorkOrderStatusAssigned,
	domain.WorkOrderStatusInProgress,
	domain.WorkOrderStatusCompleted,
	domain.WorkOrderStatusInvoiced,
	domain.WorkOrderStatusCancelled,
}

func newCollator() *collate.Collator {
	// collate.Collator is not safe for concurrent use, so every Build gets its own.
	// x/text's "sr-Latn" falls back to root collation (Č sorts with C), while
	// browsers' ICU tailors it with Č/Ć/Dž/Đ/Š/Ž as separate letters. The "hr"
	// tailoring uses the same Latin alphabet order, so it matches the web's
	// localeCompare(..., 'sr-Latn').
	return collate.New(language.Croatian)
}

// CountsTowardWorkQueue is false for cancelled orders (abandoned work).
func CountsTowardWorkQueue(order *domain.WorkOrder) bool {
	return order.Status != domain.WorkOrderStatusCancelled
}

// NormalizeClientGroupName trims, collapses whitespace and lowercases.
func NormalizeClientGroupName(name string) string {
	return strings.ToLower(strings.Join(strings.Fields(name), " "))
}

// WorkOrderGroupKey is the customer id, else the normalized client name.
func WorkOrderGroupKey(order *domain.WorkOrder) string {
	if order.CustomerID != nil {
		return *order.CustomerID
	}
	return NormalizeClientGroupName(order.ClientName)
}

// FilterWorkOrders applies the issueDate / issuedBy filters (string comparison
// on YYYY-MM-DD is safe for ISO dates).
func FilterWorkOrders(orders []domain.WorkOrder, f Filters) []domain.WorkOrder {
	out := make([]domain.WorkOrder, 0, len(orders))
	for _, order := range orders {
		if f.DateFrom != "" && order.IssueDate < f.DateFrom {
			continue
		}
		if f.DateTo != "" && order.IssueDate > f.DateTo {
			continue
		}
		if f.IssuedBy != "" && order.IssuedBy != f.IssuedBy {
			continue
		}
		out = append(out, order)
	}
	return out
}

// Build computes the full dashboard payload. Finance is nil unless IsAdmin.
func Build(orders []domain.WorkOrder, opts Options) domain.DashboardData {
	col := newCollator()
	filtered := FilterWorkOrders(orders, opts.Filters)

	data := domain.DashboardData{
		Summary:              DeriveSummary(filtered),
		MonthlyBuckets:       MonthlyBuckets(filtered),
		DeliveryDistribution: DeliveryDistribution(filtered),
		TopClients:           TopClients(filtered, 10, col),
		SignalCounts:         BuildSignalCounts(orders, opts.Today),
		ClientAttentionRows:  BuildAttentionRows(orders, coreSignals, opts.Today, col),
		InternalAttentionRows: BuildAttentionRows(
			orders, internalSignals, opts.Today, col),
		QueueSummary:  BuildQueueSummary(orders, opts.Today),
		OperatorQueue: BuildOperatorQueue(orders, opts.Today, opts.Username),
	}

	if opts.IsAdmin {
		scoped := filtered
		if opts.Filters.CompanyKey != "" {
			scoped = make([]domain.WorkOrder, 0)
			for i := range filtered {
				if WorkOrderGroupKey(&filtered[i]) == opts.Filters.CompanyKey {
					scoped = append(scoped, filtered[i])
				}
			}
		}
		data.Finance = &domain.DashboardFinance{
			ProfitTotals:  ProfitByKind(filtered),
			Revenue:       TotalRevenue(filtered),
			MonthlyProfit: MonthlyProfit(filtered),
			CompanyProfit: ProfitByCompany(filtered, col),
			ItemProfit:    ProfitByItem(scoped, col),
		}
	}
	return data
}

// ---------------------------------------------------------------------------
// Summary / buckets / distributions
// ---------------------------------------------------------------------------

// DeriveSummary counts orders per canonical status and sums order prices.
// Orders with a non-canonical status are counted in TotalOrders only.
func DeriveSummary(orders []domain.WorkOrder) domain.DashboardSummary {
	counts := make(map[domain.WorkOrderStatus]int, len(statusOrder))
	for _, status := range statusOrder {
		counts[status] = 0
	}
	revenue := 0.0
	for _, order := range orders {
		if _, ok := counts[order.Status]; ok {
			counts[order.Status]++
		}
		if order.Price != nil {
			revenue += *order.Price
		}
	}
	return domain.DashboardSummary{
		TotalOrders:  len(orders),
		StatusCounts: counts,
		TotalRevenue: revenue,
	}
}

func monthOf(date string) string {
	if len(date) < 7 {
		return date
	}
	return date[:7]
}

// MonthlyBuckets groups by issueDate month, sorted chronologically.
func MonthlyBuckets(orders []domain.WorkOrder) []domain.DashboardMonthlyBucket {
	index := map[string]int{}
	buckets := make([]domain.DashboardMonthlyBucket, 0)
	for _, order := range orders {
		month := monthOf(order.IssueDate)
		i, ok := index[month]
		if !ok {
			i = len(buckets)
			index[month] = i
			buckets = append(buckets, domain.DashboardMonthlyBucket{Month: month})
		}
		buckets[i].Count++
		if order.Price != nil {
			buckets[i].Revenue += *order.Price
		}
	}
	sort.SliceStable(buckets, func(a, b int) bool { return buckets[a].Month < buckets[b].Month })
	return buckets
}

// DeliveryDistribution returns per-method counts, count descending (ties keep
// first-seen order).
func DeliveryDistribution(orders []domain.WorkOrder) []domain.DashboardDeliveryCount {
	index := map[domain.DeliveryMethod]int{}
	out := make([]domain.DashboardDeliveryCount, 0)
	for _, order := range orders {
		method := order.Shipping.DeliveryMethod
		if method == nil {
			continue
		}
		i, ok := index[*method]
		if !ok {
			i = len(out)
			index[*method] = i
			out = append(out, domain.DashboardDeliveryCount{Method: *method})
		}
		out[i].Count++
	}
	sort.SliceStable(out, func(a, b int) bool { return out[a].Count > out[b].Count })
	return out
}

// TopClients returns the top n clients by order count, descending, then by
// collated name.
func TopClients(orders []domain.WorkOrder, n int, col *collate.Collator) []domain.DashboardClientCount {
	index := map[string]int{}
	out := make([]domain.DashboardClientCount, 0)
	for _, order := range orders {
		i, ok := index[order.ClientName]
		if !ok {
			i = len(out)
			index[order.ClientName] = i
			out = append(out, domain.DashboardClientCount{ClientName: order.ClientName})
		}
		out[i].Count++
	}
	sort.SliceStable(out, func(a, b int) bool {
		if out[a].Count != out[b].Count {
			return out[a].Count > out[b].Count
		}
		return col.CompareString(out[a].ClientName, out[b].ClientName) < 0
	})
	if len(out) > n {
		out = out[:n]
	}
	return out
}

// ---------------------------------------------------------------------------
// Attention signals
// ---------------------------------------------------------------------------

func isUnassigned(order *domain.WorkOrder) bool {
	return order.Assignment.AssignedTo == nil || *order.Assignment.AssignedTo == ""
}

// weekEnd is today + 7 calendar days (inclusive upper bound of "this week").
func weekEnd(today string) (time.Time, bool) {
	t, err := time.Parse(DateLayout, today)
	if err != nil {
		return time.Time{}, false
	}
	return t.AddDate(0, 0, 7), true
}

// OrderSignals ports getWorkOrderAttentionSignals. Cancelled orders raise none.
func orderSignals(order *domain.WorkOrder, today string) []signal {
	var signals []signal
	if !CountsTowardWorkQueue(order) {
		return signals
	}
	if order.DueDate != nil {
		due := *order.DueDate
		if due < today && !order.IsCompleted {
			signals = append(signals, signalOverdue)
		}
		if due == today {
			signals = append(signals, signalDueToday)
		}
		dueT, dueErr := time.Parse(DateLayout, due)
		todayT, todayErr := time.Parse(DateLayout, today)
		if dueErr == nil && todayErr == nil {
			end, _ := weekEnd(today)
			if !dueT.Before(todayT) && !dueT.After(end) {
				signals = append(signals, signalDueThisWeek)
			}
		}
	}
	if isUnassigned(order) {
		signals = append(signals, signalUnassigned)
	}
	return signals
}

func addSignal(c *domain.DashboardSignalCounts, s signal) {
	switch s {
	case signalOverdue:
		c.Overdue++
	case signalDueToday:
		c.DueToday++
	case signalDueThisWeek:
		c.DueThisWeek++
	case signalUnassigned:
		c.Unassigned++
	}
}

func totalSignals(c domain.DashboardSignalCounts) int {
	return c.Overdue + c.DueToday + c.DueThisWeek + c.Unassigned
}

// BuildSignalCounts counts every signal across the orders.
func BuildSignalCounts(orders []domain.WorkOrder, today string) domain.DashboardSignalCounts {
	var counts domain.DashboardSignalCounts
	for i := range orders {
		for _, s := range orderSignals(&orders[i], today) {
			addSignal(&counts, s)
		}
	}
	return counts
}

func maxSeverity(signals []signal) int {
	best := 0
	for _, s := range signals {
		if v := s.severity(); v > best {
			best = v
		}
	}
	return best
}

type attentionAcc struct {
	row             domain.DashboardAttentionRow
	severity        int
	latestUpdatedAt string
	orders          []*domain.WorkOrder
}

// BuildAttentionRows groups orders carrying any of the selected signals by
// company, ordered by severity, signal total, then collated display name.
func BuildAttentionRows(
	orders []domain.WorkOrder,
	selected []signal,
	today string,
	col *collate.Collator,
) []domain.DashboardAttentionRow {
	isSelected := map[signal]bool{}
	for _, s := range selected {
		isSelected[s] = true
	}

	index := map[string]int{}
	accs := make([]*attentionAcc, 0)

	for i := range orders {
		order := &orders[i]
		var matching []signal
		for _, s := range orderSignals(order, today) {
			if isSelected[s] {
				matching = append(matching, s)
			}
		}
		if len(matching) == 0 {
			continue
		}

		key := WorkOrderGroupKey(order)
		idx, ok := index[key]
		if !ok {
			idx = len(accs)
			index[key] = idx
			accs = append(accs, &attentionAcc{
				row: domain.DashboardAttentionRow{
					GroupKey:    key,
					CustomerID:  order.CustomerID,
					DisplayName: order.ClientName,
				},
				latestUpdatedAt: order.UpdatedAt,
			})
		}
		acc := accs[idx]
		if order.UpdatedAt >= acc.latestUpdatedAt {
			acc.row.DisplayName = order.ClientName
			acc.latestUpdatedAt = order.UpdatedAt
		}
		for _, s := range matching {
			addSignal(&acc.row.Counts, s)
			if v := s.severity(); v > acc.severity {
				acc.severity = v
			}
		}
		acc.orders = append(acc.orders, order)
	}

	rows := make([]domain.DashboardAttentionRow, 0, len(accs))
	for _, acc := range accs {
		sorted := append([]*domain.WorkOrder(nil), acc.orders...)
		sort.SliceStable(sorted, func(a, b int) bool {
			sa := maxSeverity(orderSignals(sorted[a], today))
			sb := maxSeverity(orderSignals(sorted[b], today))
			if sa != sb {
				return sa > sb
			}
			return col.CompareString(sorted[a].OrderNumber, sorted[b].OrderNumber) < 0
		})
		slim := make([]domain.DashboardAttentionOrder, 0, len(sorted))
		for _, o := range sorted {
			slim = append(slim, domain.DashboardAttentionOrder{
				ID:             o.ID,
				OrderNumber:    o.OrderNumber,
				JobDescription: o.JobDescription,
				Status:         o.Status,
				DueDate:        o.DueDate,
			})
		}
		row := acc.row
		row.Severity = float64(acc.severity) + float64(totalSignals(row.Counts))/100
		row.Orders = slim
		rows = append(rows, row)
	}

	sort.SliceStable(rows, func(a, b int) bool {
		if rows[a].Severity != rows[b].Severity {
			return rows[a].Severity > rows[b].Severity
		}
		ta, tb := totalSignals(rows[a].Counts), totalSignals(rows[b].Counts)
		if ta != tb {
			return ta > tb
		}
		return col.CompareString(rows[a].DisplayName, rows[b].DisplayName) < 0
	})
	return rows
}

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

// BuildQueueSummary ports the queueSummary memo.
func BuildQueueSummary(orders []domain.WorkOrder, today string) domain.DashboardQueueSummary {
	var q domain.DashboardQueueSummary
	for i := range orders {
		order := &orders[i]
		if !CountsTowardWorkQueue(order) {
			continue
		}
		if order.DueDate != nil && *order.DueDate == today {
			q.Today++
		}
		if order.DueDate != nil && *order.DueDate != "" && *order.DueDate < today && !order.IsCompleted {
			q.Overdue++
		}
		if isUnassigned(order) {
			q.Unassigned++
		}
	}
	return q
}

// BuildOperatorQueue ports the operatorQueue memo for the given username.
func BuildOperatorQueue(orders []domain.WorkOrder, today, username string) domain.DashboardOperatorQueue {
	var q domain.DashboardOperatorQueue
	for i := range orders {
		order := &orders[i]
		open := !order.IsCompleted && CountsTowardWorkQueue(order)
		if !open {
			continue
		}
		if isUnassigned(order) {
			q.Available++
		}
		if order.Assignment.AssignedTo == nil || *order.Assignment.AssignedTo != username {
			continue
		}
		q.AssignedToMe++
		if order.DueDate != nil {
			if *order.DueDate == today {
				q.DueToday++
			}
			if *order.DueDate != "" && *order.DueDate < today {
				q.Overdue++
			}
		}
		if order.Status == domain.WorkOrderStatusInProgress {
			q.InProgress++
		}
	}
	return q
}

// ---------------------------------------------------------------------------
// Profit (admin-only; callers must gate)
// ---------------------------------------------------------------------------

// LineMargin is (unitPrice - unitCost) * quantity, with a nil cost counting as 0.
func LineMargin(line *domain.InvoiceLineItem) float64 {
	cost := 0.0
	if line.UnitCost != nil {
		cost = *line.UnitCost
	}
	return (line.UnitPrice - cost) * line.Quantity
}

// LineRevenue is unitPrice * quantity.
func LineRevenue(line *domain.InvoiceLineItem) float64 {
	return line.UnitPrice * line.Quantity
}

func isGoods(line *domain.InvoiceLineItem) bool {
	return line.Kind == domain.InvoiceLineItemKindGoods
}

// ProfitByKind splits margin across services and goods.
func ProfitByKind(orders []domain.WorkOrder) domain.DashboardProfitTotals {
	var t domain.DashboardProfitTotals
	for i := range orders {
		lines := orders[i].InvoiceDraft.LineItems
		for j := range lines {
			m := LineMargin(&lines[j])
			if isGoods(&lines[j]) {
				t.Article += m
			} else {
				t.Service += m
			}
			t.Total += m
		}
	}
	return t
}

// TotalRevenue sums line-item sale revenue.
func TotalRevenue(orders []domain.WorkOrder) float64 {
	revenue := 0.0
	for i := range orders {
		lines := orders[i].InvoiceDraft.LineItems
		for j := range lines {
			revenue += LineRevenue(&lines[j])
		}
	}
	return revenue
}

// MonthlyProfit splits profit by kind per issueDate month, chronologically.
// Orders without line items are skipped.
func MonthlyProfit(orders []domain.WorkOrder) []domain.DashboardMonthlyProfit {
	index := map[string]int{}
	out := make([]domain.DashboardMonthlyProfit, 0)
	for i := range orders {
		lines := orders[i].InvoiceDraft.LineItems
		if len(lines) == 0 {
			continue
		}
		month := monthOf(orders[i].IssueDate)
		idx, ok := index[month]
		if !ok {
			idx = len(out)
			index[month] = idx
			out = append(out, domain.DashboardMonthlyProfit{Month: month})
		}
		for j := range lines {
			m := LineMargin(&lines[j])
			if isGoods(&lines[j]) {
				out[idx].Article += m
			} else {
				out[idx].Service += m
			}
			out[idx].Total += m
		}
	}
	sort.SliceStable(out, func(a, b int) bool { return out[a].Month < out[b].Month })
	return out
}

// ProfitByCompany groups by company key, profit descending then collated name.
func ProfitByCompany(orders []domain.WorkOrder, col *collate.Collator) []domain.DashboardCompanyProfit {
	index := map[string]int{}
	out := make([]domain.DashboardCompanyProfit, 0)
	latest := make([]string, 0)
	for i := range orders {
		order := &orders[i]
		key := WorkOrderGroupKey(order)
		idx, ok := index[key]
		if !ok {
			idx = len(out)
			index[key] = idx
			out = append(out, domain.DashboardCompanyProfit{
				GroupKey:   key,
				CustomerID: order.CustomerID,
				Name:       order.ClientName,
			})
			latest = append(latest, order.UpdatedAt)
		}
		row := &out[idx]
		if order.UpdatedAt >= latest[idx] {
			row.Name = order.ClientName
			latest[idx] = order.UpdatedAt
		}
		lines := order.InvoiceDraft.LineItems
		for j := range lines {
			m := LineMargin(&lines[j])
			row.Profit += m
			if isGoods(&lines[j]) {
				row.ArticleProfit += m
			} else {
				row.ServiceProfit += m
			}
			row.Revenue += LineRevenue(&lines[j])
		}
		row.OrderCount++
	}
	sort.SliceStable(out, func(a, b int) bool {
		if out[a].Profit != out[b].Profit {
			return out[a].Profit > out[b].Profit
		}
		return col.CompareString(out[a].Name, out[b].Name) < 0
	})
	return out
}

// ProfitByItem groups line items by catalog item (or normalized description for
// ad-hoc lines) within their kind, each list sorted by profit descending.
func ProfitByItem(orders []domain.WorkOrder, col *collate.Collator) domain.DashboardItemProfitBreakdown {
	index := map[string]int{}
	rows := make([]domain.DashboardItemProfit, 0)
	for i := range orders {
		lines := orders[i].InvoiceDraft.LineItems
		for j := range lines {
			line := &lines[j]
			name := strings.TrimSpace(line.Description)
			if name == "" {
				name = "—"
			}
			var baseKey string
			if line.CatalogItemID != nil {
				baseKey = *line.CatalogItemID
			} else {
				baseKey = "desc:" + strings.ToLower(name)
			}
			groupKey := string(line.Kind) + ":" + baseKey
			idx, ok := index[groupKey]
			if !ok {
				idx = len(rows)
				index[groupKey] = idx
				rows = append(rows, domain.DashboardItemProfit{
					GroupKey:      groupKey,
					CatalogItemID: line.CatalogItemID,
					Name:          name,
					Kind:          line.Kind,
				})
			}
			rows[idx].Profit += LineMargin(line)
			rows[idx].Revenue += LineRevenue(line)
			rows[idx].Quantity += line.Quantity
		}
	}

	less := func(list []domain.DashboardItemProfit) func(a, b int) bool {
		return func(a, b int) bool {
			if list[a].Profit != list[b].Profit && !math.IsNaN(list[a].Profit-list[b].Profit) {
				return list[a].Profit > list[b].Profit
			}
			return col.CompareString(list[a].Name, list[b].Name) < 0
		}
	}
	services := make([]domain.DashboardItemProfit, 0)
	articles := make([]domain.DashboardItemProfit, 0)
	for _, row := range rows {
		if row.Kind == domain.InvoiceLineItemKindGoods {
			articles = append(articles, row)
		} else {
			services = append(services, row)
		}
	}
	sort.SliceStable(services, less(services))
	sort.SliceStable(articles, less(articles))
	return domain.DashboardItemProfitBreakdown{Services: services, Articles: articles}
}
