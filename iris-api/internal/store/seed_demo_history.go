package store

import (
	"fmt"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// A year of finished work. These orders are written directly (PutWorkOrder)
// because the API path stamps everything "now": the history needs issue,
// completion and invoice dates spread over the past twelve months so the
// dashboard's monthly orders, revenue and profit charts, the top clients, the
// company and item profit tables and the list's date filters all have depth.
// Their invoice lines reference the catalog with the cost frozen on the line,
// the way the API captures it, so profit is real. They carry no process: they
// predate the modules in the demo's story.

// demoHistoryLine is one invoice line: a service (by demoServices key) or an
// article sold as goods (by demoArticles key). price overrides the catalog
// sale price; unit defaults to kom.
type demoHistoryLine struct {
	service, article string
	qty              float64
	price            float64
	unit             domain.InvoiceUnit
	description      string
}

func svc(key string, qty float64) demoHistoryLine   { return demoHistoryLine{service: key, qty: qty} }
func goods(key string, qty float64) demoHistoryLine { return demoHistoryLine{article: key, qty: qty} }
func sqm(key string, qty float64) demoHistoryLine {
	return demoHistoryLine{service: key, qty: qty, unit: domain.InvoiceUnitM2}
}
func goodsM2(key string, qty float64) demoHistoryLine {
	return demoHistoryLine{article: key, qty: qty, unit: domain.InvoiceUnitM2}
}

type demoHistoryOrder struct {
	daysAgo  int
	customer string
	desc     string
	lines    []demoHistoryLine
	// Optional overrides; zero values fall back to a rotation.
	status   domain.WorkOrderStatus // invoiced (default), completed, cancelled
	priority domain.WorkOrderPriority
	delivery domain.DeliveryMethod
	doc      domain.BillingDocumentType
	assignee string
	duration int  // days from issue to completion
	unpaid   bool // invoiced but not paid yet
	details  *domain.JobDetails
	extras   func(b *demoContentBuilder, o *domain.WorkOrder, issueOffset int)
}

var demoHistoryOperators = []string{"ana.jovic", "marko.petrovic", "jelena.markovic", "stefan.nikolic", demoOperatorUsername}

var demoHistoryDeliveries = []domain.DeliveryMethod{
	domain.DeliveryMethodPickup, domain.DeliveryMethodPostExpress, domain.DeliveryMethodCityExpress,
	domain.DeliveryMethodFieldVisit, demoDeliveryCourier,
}

func demoHistoryOrders() []demoHistoryOrder {
	note := func(body string) func(*demoContentBuilder, *domain.WorkOrder, int) {
		return func(b *demoContentBuilder, o *domain.WorkOrder, issue int) {
			o.InternalNotes = append(o.InternalNotes, domain.WorkOrderNote{Author: o.IssuedBy, Body: body, CreatedAt: b.at(issue, 9, 15)})
		}
	}
	return []demoHistoryOrder{
		{daysAgo: 362, customer: "vinarija", desc: "Etikete za vino – berba 2025, 6.000 kom", lines: []demoHistoryLine{svc("priprema", 2), svc("offset", 6000), goods("kunstdruk", 400)},
			details: &domain.JobDetails{ProductCode: str("ETK-075"), PaperWeightGsm: integer(135), Dimensions: str("90 × 120 mm"), Quantity: integer(6000), FinishingNote: str("Mat plastifikacija, sečenje na format")},
			extras: func(b *demoContentBuilder, o *domain.WorkOrder, issue int) {
				o.Attachments = append(o.Attachments, domain.Attachment{FileName: "etiketa-berba-2025.pdf", FileType: "application/pdf", UploadedAt: b.at(issue, 10, 0)})
			}},
		{daysAgo: 355, customer: "pekara", desc: "Jelovnici A4 laminirani, 60 kom", lines: []demoHistoryLine{svc("digital", 120), svc("dorada", 60), goods("karton", 70)}, doc: domain.BillingDocumentTypeCashCollection},
		{daysAgo: 348, customer: "opstina", desc: "Obrasci zahteva A4, 5.000 kom", lines: []demoHistoryLine{svc("offset", 5000), goods("papir80", 1300)}, doc: domain.BillingDocumentTypeProforma},
		{daysAgo: 341, customer: "firma", desc: "Vizit karte, 10 × 100 kom", lines: []demoHistoryLine{svc("digital", 1000), goods("karton", 60)}},
		{daysAgo: 333, customer: "hotel", desc: "Flajeri za novogodišnji program, 2.000 kom", lines: []demoHistoryLine{svc("offset", 2000), goods("kunstdruk", 300)}},
		{daysAgo: 329, customer: "slovo", desc: "Katalog izdanja – zima, 500 kom", lines: []demoHistoryLine{svc("offset", 4000), svc("knjigovez", 500), goods("kunstdruk", 1100)}, priority: domain.WorkOrderPriorityHigh},
		{daysAgo: 321, customer: "kompanija", desc: "Novogodišnje čestitke, 300 kom", lines: []demoHistoryLine{svc("digital", 300), goods("karton", 40)}},
		{daysAgo: 315, customer: "dentis", desc: "Podsetnici za termine, 1.000 kom", lines: []demoHistoryLine{svc("digital", 1000)}, doc: domain.BillingDocumentTypeCashCollection},
		{daysAgo: 304, customer: "studio", desc: "Baner 3 × 1 m za izložbu", lines: []demoHistoryLine{sqm("ploter", 3), goodsM2("baner", 3.5)}, priority: domain.WorkOrderPriorityUrgent, duration: 2},
		{daysAgo: 297, customer: "agencija", desc: "Plakati B2 za koncert, 150 kom", lines: []demoHistoryLine{sqm("ploter", 52)}},
		{daysAgo: 290, customer: "tehnoservis", desc: "Nalepnice za servis, 2.000 kom", lines: []demoHistoryLine{svc("digital", 2000), svc("dorada", 2000)}},
		{daysAgo: 283, customer: "pekara", desc: "Kutije za torte – štampa, 500 kom", lines: []demoHistoryLine{svc("offset", 500), goods("karton", 520)}, status: domain.WorkOrderStatusCancelled,
			extras: note("Klijent odustao posle probnog otiska – kutije će nabaviti gotove.")},
		{daysAgo: 276, customer: "opstina", desc: "Bilten opštine, 2.000 kom", lines: []demoHistoryLine{svc("offset", 8000), svc("knjigovez", 2000), goods("papir80", 2100)}, doc: domain.BillingDocumentTypeProforma},
		{daysAgo: 268, customer: "volan", desc: "Testovi za teorijsku obuku, 3.000 kom", lines: []demoHistoryLine{svc("offset", 3000), goods("papir80", 800)}},
		{daysAgo: 261, customer: "pixel", desc: "Brošura za klijenta, 16 strana, 1.000 kom", lines: []demoHistoryLine{svc("priprema", 3), svc("offset", 4000), svc("knjigovez", 1000), goods("kunstdruk", 1050)}, priority: domain.WorkOrderPriorityHigh},
		{daysAgo: 253, customer: "hotel", desc: "Roll-up baneri, 3 kom", lines: []demoHistoryLine{goods("rollup", 3), sqm("ploter", 5.1)},
			extras: func(b *demoContentBuilder, o *domain.WorkOrder, issue int) {
				o.Shipping.IsFragile, o.Shipping.HasPackaging, o.Shipping.RequiresSignature = true, true, true
				o.Shipping.ShippingAddress = str("Hotel Panorama, recepcija, Fruškogorska 15, Novi Sad")
			}},
		{daysAgo: 246, customer: "firma", desc: "Memorandumi A4, 5.000 kom", lines: []demoHistoryLine{svc("offset", 5000), goods("papir80", 1300)}},
		{daysAgo: 238, customer: "vinarija", desc: "Etikete – limitirana serija, 800 kom", lines: []demoHistoryLine{svc("digital", 800), goods("kunstdruk", 60)}},
		{daysAgo: 231, customer: "slovo", desc: "Bookmarkeri, 5.000 kom", lines: []demoHistoryLine{svc("offset", 5000), svc("dorada", 5000), goods("karton", 120)}},
		{daysAgo: 223, customer: "kompanija", desc: "Godišnji izveštaj, 120 kom", lines: []demoHistoryLine{svc("digital", 4800), svc("knjigovez", 120), goods("kunstdruk", 1250)}, duration: 7,
			extras: note("Korice sa UV lakom – klijent odobrio probni otisak 12. u mesecu.")},
		{daysAgo: 215, customer: "dentis", desc: "Vizit karte lekara, 500 kom", lines: []demoHistoryLine{svc("digital", 500), goods("karton", 30)}, status: domain.WorkOrderStatusCompleted},
		{daysAgo: 208, customer: "studio", desc: "Pozivnice za vernisaž, 200 kom", lines: []demoHistoryLine{svc("digital", 200), goods("karton", 25)}},
		{daysAgo: 200, customer: "agencija", desc: "Flajeri A5, 10.000 kom", lines: []demoHistoryLine{svc("offset", 10000), goods("papir80", 2600)}, priority: domain.WorkOrderPriorityHigh},
		{daysAgo: 192, customer: "opstina", desc: "Plakati A3 – javna rasprava, 100 kom", lines: []demoHistoryLine{svc("digital", 100)}, doc: domain.BillingDocumentTypeProforma, duration: 1},
		{daysAgo: 184, customer: "pekara", desc: "Flajeri – letnja akcija, 3.000 kom", lines: []demoHistoryLine{svc("offset", 3000), goods("kunstdruk", 400)}},
		{daysAgo: 176, customer: "tehnoservis", desc: "Garantni listovi, 2.000 kom", lines: []demoHistoryLine{svc("offset", 2000), goods("papir80", 520)}},
		{daysAgo: 167, customer: "hotel", desc: "Meni karte – leto, 80 kom", lines: []demoHistoryLine{svc("digital", 160), goods("karton", 90)},
			extras: func(b *demoContentBuilder, o *domain.WorkOrder, issue int) {
				o.CustomerNotes = append(o.CustomerNotes, domain.WorkOrderNote{Author: o.IssuedBy, Body: "Probni otisak poslat na e-mail; molimo potvrdu boja.", CreatedAt: b.at(issue+1, 11, 0)})
			}},
		{daysAgo: 159, customer: "volan", desc: "Brošura „Saobraćajni znaci“, 1.500 kom", lines: []demoHistoryLine{svc("offset", 6000), svc("knjigovez", 1500), goods("kunstdruk", 1550)}, duration: 8},
		{daysAgo: 150, customer: "pixel", desc: "Katalog za sajam, 300 kom", lines: []demoHistoryLine{svc("offset", 2400), svc("knjigovez", 300), goods("kunstdruk", 650)}, priority: domain.WorkOrderPriorityUrgent, duration: 3,
			extras: func(b *demoContentBuilder, o *domain.WorkOrder, issue int) {
				o.Communication.SignedBy, o.Communication.SignedAt = str("Nikola Ilić"), str(b.at(issue+3, 16, 20))
				o.Attachments = append(o.Attachments, domain.Attachment{FileName: "katalog-sajam-print.pdf", FileType: "application/pdf", UploadedAt: b.at(issue, 9, 40)})
			}},
		{daysAgo: 141, customer: "vinarija", desc: "Baner za festival 4 × 2 m", lines: []demoHistoryLine{sqm("ploter", 8), goodsM2("baner", 9)}},
		{daysAgo: 132, customer: "firma", desc: "Fascikle sa logom, 1.000 kom", lines: []demoHistoryLine{svc("offset", 1000), svc("dorada", 1000), goods("karton", 1050)},
			extras: func(b *demoContentBuilder, o *domain.WorkOrder, issue int) {
				o.MaterialUsage = append(o.MaterialUsage, domain.MaterialUsage{Name: "Lak za bigovanje", Quantity: 1, Unit: "kom", UnitCost: num(2400)})
			}},
		{daysAgo: 123, customer: "slovo", desc: "Kalendar izdanja 2027 – probna serija, 50 kom", lines: []demoHistoryLine{svc("digital", 650), goods("karton", 60), goods("spirala", 50)}},
		{daysAgo: 114, customer: "kompanija", desc: "Nalepnice za ambalažu, 20.000 kom", lines: []demoHistoryLine{svc("offset", 20000), goods("kunstdruk", 2100)}, duration: 9},
		{daysAgo: 105, customer: "dentis", desc: "Blokovi za recepte, 100 kom", lines: []demoHistoryLine{svc("offset", 5000), svc("knjigovez", 100), goods("papir80", 5100)}},
		{daysAgo: 96, customer: "opstina", desc: "Obrasci – matična služba, 8.000 kom", lines: []demoHistoryLine{svc("offset", 8000), goods("papir80", 2100)}, doc: domain.BillingDocumentTypeProforma, unpaid: true},
		{daysAgo: 87, customer: "agencija", desc: "Roll-up i baner za promociju", lines: []demoHistoryLine{goods("rollup", 2), sqm("ploter", 3.4), goodsM2("baner", 4)}},
		{daysAgo: 78, customer: "pekara", desc: "Jelovnici – jesen, 60 kom", lines: []demoHistoryLine{svc("digital", 120), svc("dorada", 120), goods("karton", 70)}, doc: domain.BillingDocumentTypeCashCollection},
		{daysAgo: 69, customer: "studio", desc: "Plakat izložbe B1, 40 kom", lines: []demoHistoryLine{sqm("ploter", 28)}},
		{daysAgo: 60, customer: "tehnoservis", desc: "Vizit karte, 5 × 100 kom", lines: []demoHistoryLine{svc("digital", 500), goods("karton", 30)}},
		{daysAgo: 51, customer: "hotel", desc: "Flajeri za wellness, 2.000 kom", lines: []demoHistoryLine{svc("offset", 2000), goods("kunstdruk", 270)}},
		{daysAgo: 44, customer: "volan", desc: "Potvrde o obuci, 1.000 kom", lines: []demoHistoryLine{svc("digital", 1000), goods("kunstdruk", 110)}, status: domain.WorkOrderStatusCompleted,
			extras: note("Čeka fakturisanje – klijent traži zbirnu fakturu krajem meseca.")},
		{daysAgo: 37, customer: "firma", desc: "Pozivnice za jubilej, 150 kom", lines: []demoHistoryLine{svc("digital", 150), goods("karton", 20), svc("dostava", 1)}},
		{daysAgo: 30, customer: "kompanija", desc: "Brošura proizvoda, 2.000 kom", lines: []demoHistoryLine{svc("offset", 8000), svc("knjigovez", 2000), goods("kunstdruk", 2100)}, priority: domain.WorkOrderPriorityHigh, duration: 7},
		{daysAgo: 24, customer: "pixel", desc: "Nalepnice za vozila, 12 kom", lines: []demoHistoryLine{sqm("ploter", 6)}, unpaid: true},
	}
}

// history writes the finished orders of the past year. Order numbers follow
// the issue year; the oldest year starts mid-sequence (a shop that was already
// busy), later years from 1, and the live orders then continue the current
// year's sequence through the normal allocator.
func (b *demoContentBuilder) history() error {
	orders := demoHistoryOrders()
	sequence := map[int]int{}
	firstYear := b.now.AddDate(0, 0, -orders[0].daysAgo).Year()
	for i, h := range orders {
		issue := -h.daysAgo
		year := b.now.AddDate(0, 0, issue).Year()
		if _, ok := sequence[year]; !ok {
			if year == firstYear {
				sequence[year] = 380
			} else {
				sequence[year] = 0
			}
		}
		sequence[year]++
		order, err := b.buildHistoryOrder(i, h, year, sequence[year])
		if err != nil {
			return err
		}
		if err := b.s.PutWorkOrder(b.ctx, order); err != nil {
			return fmt.Errorf("demo history order %d: %w", i+1, err)
		}
	}
	return nil
}

func (b *demoContentBuilder) buildHistoryOrder(i int, h demoHistoryOrder, year, seq int) (domain.WorkOrder, error) {
	customer, ok := b.customers[h.customer]
	if !ok {
		return domain.WorkOrder{}, fmt.Errorf("demo history: unknown customer %q", h.customer)
	}
	issue := -h.daysAgo
	status := h.status
	if status == "" {
		status = domain.WorkOrderStatusInvoiced
	}
	assignee := h.assignee
	if assignee == "" {
		assignee = demoHistoryOperators[i%len(demoHistoryOperators)]
	}
	issuedBy := demoAdminUsername
	if i%3 == 1 {
		issuedBy = assignee
	}
	priority := h.priority
	if priority == "" {
		priority = domain.WorkOrderPriorityNormal
	}
	delivery := h.delivery
	if delivery == "" {
		delivery = demoHistoryDeliveries[i%len(demoHistoryDeliveries)]
	}
	doc := h.doc
	if doc == "" {
		doc = domain.BillingDocumentTypeInvoice
	}
	duration := h.duration
	if duration == 0 {
		duration = 4 + i%5
	}
	created := b.at(issue, 8, 30+i%20)

	// Invoice lines with the catalog cost frozen on them, as the API does.
	lines, err := b.catalogLines(h.lines)
	if err != nil {
		return domain.WorkOrder{}, fmt.Errorf("demo history: %w", err)
	}
	var price, profit float64
	for n := range lines {
		line := &lines[n]
		line.ID = fmt.Sprintf("line-%d", n+1)
		margin := line.UnitPrice
		if item := b.catalogItemByID(*line.CatalogItemID); item.PurchasePrice != nil {
			line.UnitCost = num(*item.PurchasePrice)
			margin -= *item.PurchasePrice
		}
		price += line.UnitPrice * line.Quantity
		profit += margin * line.Quantity
	}

	location := b.locations[h.customer]
	var locationID *string
	if location.ID != "" {
		locationID = str(location.ID)
	}
	order := domain.WorkOrder{
		ID:                  fmt.Sprintf("demo-h-%03d", i+1),
		OrderNumber:         fmt.Sprintf("RN-%d-%05d", year, seq),
		CustomerID:          str(customer.ID),
		LocationID:          locationID,
		ClientName:          customer.Name,
		ContactPerson:       customer.ContactName,
		JobDescription:      h.desc,
		JobDetails:          h.details,
		BillingDocumentType: &doc,
		Shipping:            domain.Shipping{DeliveryMethod: &delivery},
		IssuedBy:            issuedBy,
		ExecutedBy:          str(assignee),
		Assignment:          domain.Assignment{AssignedTo: str(assignee), Priority: priority},
		IssueDate:           b.day(issue),
		DueDate:             str(b.day(issue + duration + 2)),
		Status:              status,
		Price:               num(price),
		Profit:              num(profit),
		CreatedAt:           created,
		UpdatedAt:           created,
		InternalNotes:       []domain.WorkOrderNote{},
		CustomerNotes:       []domain.WorkOrderNote{},
		Attachments:         []domain.Attachment{},
		MaterialUsage:       []domain.MaterialUsage{},
		TimeEntries:         []domain.TimeEntry{},
		InvoiceDraft:        domain.InvoiceDraft{Status: domain.InvoiceDraftStatusDraft, LineItems: lines},
		Communication:       domain.CustomerCommunication{PublicToken: fmt.Sprintf("wo-demo-h-%03d", i+1)},
	}
	if h.details == nil {
		order.JobDetails = &domain.JobDetails{Quantity: integer(int(h.lines[0].qty))}
	}
	if delivery == domain.DeliveryMethodPostExpress {
		cod := domain.PostagePaymentTypeCOD
		order.Shipping.PostagePaymentType = &cod
	}
	if i%4 == 0 && customer.Email != nil {
		order.Communication.NotificationEmail = customer.Email
		order.Communication.EmailNotificationsEnabled = true
	}

	// Timeline: created → assigned (same morning) → in progress (next day) →
	// completed (completion day) → invoiced (two days later) → paid.
	order.StatusHistory = []domain.WorkOrderStatusHistory{{Status: domain.WorkOrderStatusNew, ChangedAt: created, ChangedBy: issuedBy}}
	order.Events = []domain.WorkOrderEvent{{ID: "event-created", Kind: "created", Label: "Nalog kreiran", Actor: issuedBy, CreatedAt: created}}
	advance := func(status domain.WorkOrderStatus, at, actor string) {
		order.StatusHistory = append(order.StatusHistory, domain.WorkOrderStatusHistory{Status: status, ChangedAt: at, ChangedBy: actor})
		order.Events = append(order.Events, domain.WorkOrderEvent{
			ID: fmt.Sprintf("event-%d", len(order.Events)+1), Kind: "status",
			Label: fmt.Sprintf("Status promenjen na %s", workOrderStatusLabel(status)), Actor: actor, CreatedAt: at,
		})
		order.Status, order.UpdatedAt = status, at
	}
	advance(domain.WorkOrderStatusAssigned, b.at(issue, 10, 5), issuedBy)
	if status == domain.WorkOrderStatusCancelled {
		advance(domain.WorkOrderStatusCancelled, b.at(issue+2, 9, 30), issuedBy)
		order.Price = nil
	} else {
		advance(domain.WorkOrderStatusInProgress, b.at(issue+1, 7, 40), assignee)
		completion := issue + duration
		advance(domain.WorkOrderStatusCompleted, b.at(completion, 15, 30), assignee)
		order.IsCompleted = true
		order.CompletionDate = str(b.day(completion))
		for n, l := range h.lines {
			if l.service == "" {
				continue
			}
			minutes := int(l.qty*0.03) + 20
			if l.service == "priprema" {
				minutes = int(l.qty * 60)
			}
			order.TimeEntries = append(order.TimeEntries, domain.TimeEntry{
				ID: fmt.Sprintf("time-%d", n+1), Operator: assignee, Minutes: minutes, LoggedAt: b.at(completion, 15, 0),
			})
		}
		if status == domain.WorkOrderStatusInvoiced {
			b.invoiceSeq[year]++
			advance(domain.WorkOrderStatusInvoiced, b.at(completion+2, 10, 0), demoAdminUsername)
			number := fmt.Sprintf("FA-%d-%04d", year, b.invoiceSeq[year])
			order.InvoiceDraft.Status = domain.InvoiceDraftStatusIssued
			order.InvoiceDraft.InvoiceNumber = str(number)
			order.BillingDocumentNumber = str(number)
			if !h.unpaid {
				order.InvoiceDraft.Status = domain.InvoiceDraftStatusPaid
				order.InvoiceDraft.PaidAt = str(b.at(completion+2+10+i%9, 12, 0))
				order.IsPaid = true
			}
		}
	}
	if h.extras != nil {
		h.extras(b, &order, issue)
	}
	for n := range order.InternalNotes {
		order.InternalNotes[n].ID, order.InternalNotes[n].Visibility = fmt.Sprintf("note-%d", n+1), domain.WorkOrderNoteInternal
	}
	for n := range order.CustomerNotes {
		order.CustomerNotes[n].ID, order.CustomerNotes[n].Visibility = fmt.Sprintf("note-%d", n+1), domain.WorkOrderNoteCustomer
	}
	for n := range order.Attachments {
		order.Attachments[n].ID = fmt.Sprintf("attachment-%d", n+1)
	}
	for n := range order.MaterialUsage {
		order.MaterialUsage[n].ID = fmt.Sprintf("material-%d", n+1)
	}
	return order, nil
}

// backdateLiveOrders rewrites the timestamps of the live orders, which the API
// path stamped at seed time, so each order's timeline runs from its issue date
// to now: creation on the issue morning, every later status change, event and
// note spread evenly up to an hour ago. Processes and stock movements are
// separate tables and stay as posted.
func (b *demoContentBuilder) backdateLiveOrders() error {
	end := b.now.Add(-time.Hour)
	for _, id := range b.liveOrders {
		order, err := b.s.WorkOrderByID(b.ctx, id)
		if err != nil {
			return err
		}
		if order == nil {
			return fmt.Errorf("demo live order %s vanished", id)
		}
		issue, err := time.ParseInLocation("2006-01-02", order.IssueDate, b.location)
		if err != nil {
			return err
		}
		start := issue.Add(8*time.Hour + 30*time.Minute)
		if !start.Before(end) {
			start = end.Add(-2 * time.Hour)
		}
		// Events are the finest-grained record; status history and notes take
		// the timestamp of the event at the same position in the sequence.
		count := len(order.Events)
		stamp := func(position int) string {
			if count <= 1 {
				return start.UTC().Format(time.RFC3339)
			}
			step := end.Sub(start) / time.Duration(count-1)
			return start.Add(step * time.Duration(position)).UTC().Format(time.RFC3339)
		}
		for i := range order.Events {
			order.Events[i].CreatedAt = stamp(i)
		}
		for i := range order.StatusHistory {
			order.StatusHistory[i].ChangedAt = stamp(i * (count - 1) / maxInt(len(order.StatusHistory)-1, 1))
		}
		for i := range order.InternalNotes {
			order.InternalNotes[i].CreatedAt = stamp((i + 1) * (count - 1) / (len(order.InternalNotes) + 1))
		}
		for i := range order.CustomerNotes {
			order.CustomerNotes[i].CreatedAt = stamp((i + 1) * (count - 1) / (len(order.CustomerNotes) + 1))
		}
		for i := range order.TimeEntries {
			order.TimeEntries[i].LoggedAt = stamp(count - 1)
		}
		for i := range order.Attachments {
			order.Attachments[i].UploadedAt = stamp(0)
		}
		order.CreatedAt = stamp(0)
		order.UpdatedAt = stamp(count - 1)
		if err := b.s.PutWorkOrder(b.ctx, *order); err != nil {
			return fmt.Errorf("demo backdate %s: %w", order.OrderNumber, err)
		}
	}
	return nil
}

// catalogItemByID finds a seeded service or article by id.
func (b *demoContentBuilder) catalogItemByID(id string) domain.CatalogItem {
	for _, item := range b.services {
		if item.ID == id {
			return item
		}
	}
	for _, item := range b.articles {
		if item.ID == id {
			return item
		}
	}
	return domain.CatalogItem{}
}
