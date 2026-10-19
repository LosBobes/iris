package store

import (
	"fmt"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Live work: the open and just-finished orders, created through the API path
// so every one carries a process (stock reservations, consumption and
// production come from marking steps done), captured line costs and a real
// timeline. Together they cover every dashboard signal — overdue, due today,
// due this week, unassigned — the cost-review queue, a customer sign-off, a paid
// invoice, a cancelled order, a material shortage, a skipped step and a step in
// progress that the planner keeps in place.

// demoOrder is one live work order to create.
type demoOrder struct {
	key                   string // name used by the CLI summary
	customer, description string
	template              string
	daysAgo, dueIn        int // issue date and due date, relative to now
	assignee              string
	priority              domain.WorkOrderPriority
	quantity              int // jobDetails.quantity; drives planned step durations
	details               *domain.JobDetails
	lines                 []demoHistoryLine        // catalog invoice lines
	adhoc                 []domain.InvoiceLineItem // lines without a catalog link (cost unknown)
	doc                   domain.BillingDocumentType
	delivery              domain.DeliveryMethod
	shipping              *domain.Shipping // full shipping block; nil = delivery only
	proformaDueIn         int              // 0 = none
	internalNotes         []string
	customerNotes         []string
	attachments           []string
	materials             []domain.MaterialUsage
	timeEntries           map[string]int // operator -> minutes
	notify                bool           // e-mail notifications to the customer's address
	// scale overrides planned quantities of nodes (after the process is attached).
	scale map[string]float64
	// status path after creation, e.g. assigned, inProgress.
	statuses []domain.WorkOrderStatus
	// done lists step batches to complete in order; actual overrides the
	// recorded quantity of item nodes when that batch is marked done.
	done []demoDone
	// inProgress and skipped set those step statuses after the done batches.
	inProgress, skipped []string
	// finish moves the order to the final status after the process work.
	finish []domain.WorkOrderStatus
	// invoice issues (and pays) the invoice once finished.
	invoice *demoInvoice
	// signedBy records the customer's sign-off.
	signedBy string
}

type demoDone struct {
	steps  []string
	actual map[string]float64
}

type demoInvoice struct {
	paid bool
}

func (b *demoContentBuilder) liveOrderSpecs() []demoOrder {
	assigned := []domain.WorkOrderStatus{domain.WorkOrderStatusAssigned}
	progress := []domain.WorkOrderStatus{domain.WorkOrderStatusAssigned, domain.WorkOrderStatusInProgress}
	completed := []domain.WorkOrderStatus{domain.WorkOrderStatusCompleted}
	offsetAll := []demoDone{{steps: []string{"priprema"}}, {steps: []string{"stampa"}}, {steps: []string{"secenje"}}, {steps: []string{"pakovanje"}}}
	advance := domain.PostagePaymentTypeAdvance
	post := domain.DeliveryMethodPostExpress
	return []demoOrder{
		{ // new, untouched -> reserved stock; due this week
			key: "flajeri", customer: "pekara", description: "Flajeri A5, 5.000 kom, 4+4", quantity: 5000, template: "offset", daysAgo: 2, dueIn: 6,
			assignee: demoOperatorUsername, priority: domain.WorkOrderPriorityNormal,
			details: &domain.JobDetails{ProductCode: str("FLA-A5"), PaperWeightGsm: integer(135), Dimensions: str("148 × 210 mm"), Quantity: integer(5000), FinishingNote: str("Sečenje na format, pakovanje po 500")},
			lines:   []demoHistoryLine{svc("offset", 5000), goods("papir80", 650)},
			scale:   map[string]float64{"papir": 650, "boja": 2, "ploce": 4},
		},
		{ // new digital, high priority, due in two days
			key: "vizit", customer: "pixel", description: "Vizit karte, 500 kom, kunstdruk 350g", quantity: 500, template: "digital", daysAgo: 1, dueIn: 2,
			assignee: demoOperatorUsername, priority: domain.WorkOrderPriorityHigh,
			lines: []demoHistoryLine{svc("digital", 500), goods("karton", 30)},
			scale: map[string]float64{"papir": 40, "toner": 1},
			doc:   domain.BillingDocumentTypeCashCollection,
		},
		{ // in progress, actual paper above plan; proforma with its own deadline
			key: "obrasci", customer: "opstina", description: "Obrasci A4 u tri primerka, 10.000 kom", quantity: 10000, template: "offset", daysAgo: 9, dueIn: 4,
			assignee: demoOperatorUsername, priority: domain.WorkOrderPriorityNormal,
			lines: []demoHistoryLine{svc("offset", 10000), goods("papir80", 2600)},
			doc:   domain.BillingDocumentTypeProforma, proformaDueIn: 3,
			scale:         map[string]float64{"papir": 2500, "boja": 6, "ploce": 8, "mak-stampa": 40, "mak-secenje": 25},
			statuses:      progress,
			internalNotes: []string{"NCR papir u tri boje (beli, žuti, roze) – paziti na redosled slaganja."},
			done: []demoDone{
				{steps: []string{"priprema"}},
				{steps: []string{"stampa"}, actual: map[string]float64{"papir": 2750, "boja": 6.5, "mak-stampa": 55}},
			},
			timeEntries: map[string]int{demoOperatorUsername: 310},
		},
		{ // in progress brochure, two parallel steps done, due today
			key: "katalog", customer: "slovo", description: "Katalog izdanja, 24 strane, 500 kom", quantity: 500, template: "brosura", daysAgo: 6, dueIn: 0,
			assignee: demoAdminUsername, priority: domain.WorkOrderPriorityHigh,
			lines:         []demoHistoryLine{svc("offset", 3000), svc("knjigovez", 500), goods("kunstdruk", 650)},
			scale:         map[string]float64{"papir": 600, "boja": 6, "karton": 150, "zica": 2, "mak": 12},
			statuses:      progress,
			done:          []demoDone{{steps: []string{"stampa-tabaka", "stampa-korica"}}},
			internalNotes: []string{"Rok je danas – šivenje i obrezivanje prvo ujutru."},
			attachments:   []string{"katalog-izdanja-imposition.pdf"},
		},
		{ // completed offset, signed off by the customer, with customer notes
			key: "brosure", customer: "volan", description: "Brošure i uputstva A4, 3.000 kom", quantity: 3000, template: "offset", daysAgo: 20, dueIn: -6,
			assignee: demoOperatorUsername, priority: domain.WorkOrderPriorityNormal,
			lines:    []demoHistoryLine{svc("offset", 3000), svc("dorada", 3000), goods("papir80", 1100)},
			scale:    map[string]float64{"papir": 1100, "boja": 4, "ploce": 4, "mak-stampa": 18, "mak-secenje": 9},
			statuses: progress, done: offsetAll, finish: completed,
			customerNotes: []string{"Probni otisak odobren, krećemo u štampu.", "Brošure su spremne za preuzimanje."},
			timeEntries:   map[string]int{demoOperatorUsername: 240, "jelena.markovic": 90},
			attachments:   []string{"brosura-volan-final.pdf"},
			signedBy:      "Dragan Savić",
		},
		{ // completed banner -> invoiced and paid
			key: "baner", customer: "pixel", description: "Baner 4 × 2 m za sajam", quantity: 1, template: "baner", daysAgo: 15, dueIn: -9,
			assignee: demoAdminUsername, priority: domain.WorkOrderPriorityUrgent,
			lines:    []demoHistoryLine{sqm("ploter", 8), goodsM2("baner", 9)},
			scale:    map[string]float64{"baner": 8, "otpad": 0.5},
			statuses: progress,
			done:     []demoDone{{steps: []string{"priprema"}}, {steps: []string{"stampa"}}, {steps: []string{"ojacanje"}}},
			finish:   []domain.WorkOrderStatus{domain.WorkOrderStatusCompleted, domain.WorkOrderStatusInvoiced},
			invoice:  &demoInvoice{paid: true},
		},
		{ // big order, planned inputs exceed stock
			key: "zbirka", customer: "slovo", description: "Zbirka priča, 320 strana, tiraž 2.000", quantity: 2000, template: "offset", daysAgo: 3, dueIn: 6,
			assignee: demoOperatorUsername, priority: domain.WorkOrderPriorityHigh,
			details:  &domain.JobDetails{ProductCode: str("KNJ-A5"), PaperWeightGsm: integer(80), Dimensions: str("A5, 320 str."), Quantity: integer(2000), FinishingNote: str("Meki povez, korice 300g mat plastifikacija")},
			lines:    []demoHistoryLine{svc("offset", 16000), svc("knjigovez", 2000), goods("papir80", 8000)},
			scale:    map[string]float64{"papir": 8000, "boja": 30, "ploce": 24, "mak-stampa": 120, "mak-secenje": 60},
			statuses: assigned,
		},
		{ // cancelled, must not reserve stock
			key: "plakati", customer: "opstina", description: "Plakati A3, 200 kom", quantity: 200, template: "digital", daysAgo: 12, dueIn: 2,
			assignee: demoOperatorUsername, priority: domain.WorkOrderPriorityLow,
			lines:         []demoHistoryLine{svc("digital", 200)},
			scale:         map[string]float64{"papir": 400, "toner": 1},
			statuses:      []domain.WorkOrderStatus{domain.WorkOrderStatusCancelled},
			internalNotes: []string{"Otkazano – javna rasprava odložena."},
		},
		{ // unassigned, with an ad-hoc line whose cost is unknown (cost review)
			key: "meni", customer: "hotel", description: "Meni karte A4 laminirane, 200 kom", quantity: 200, template: "digital", daysAgo: 1, dueIn: 3,
			priority: domain.WorkOrderPriorityNormal,
			lines:    []demoHistoryLine{svc("digital", 400), goods("karton", 210)},
			adhoc:    []domain.InvoiceLineItem{{Kind: domain.InvoiceLineItemKindService, Description: "Laminacija mat 125 µ", Quantity: 200, Unit: domain.InvoiceUnitKom, UnitPrice: 25}},
			scale:    map[string]float64{"papir": 210, "toner": 1},
			notify:   true,
		},
		{ // urgent and overdue, with notes and attachments
			key: "etikete", customer: "vinarija", description: "Etikete za vino 0,75 l, 4.000 kom", quantity: 4000, template: "offset", daysAgo: 7, dueIn: -2,
			assignee: "marko.petrovic", priority: domain.WorkOrderPriorityUrgent,
			details:       &domain.JobDetails{ProductCode: str("ETK-075"), PaperWeightGsm: integer(135), Dimensions: str("90 × 120 mm"), Quantity: integer(4000), FinishingNote: str("Mat plastifikacija, zlatotisak na logu")},
			lines:         []demoHistoryLine{svc("priprema", 2), svc("offset", 4000), goods("kunstdruk", 280)},
			scale:         map[string]float64{"papir": 300, "boja": 2, "ploce": 4},
			statuses:      assigned,
			internalNotes: []string{"Klijent menja godinu berbe na etiketi – čekamo novi fajl.", "Novi fajl stigao, zlatotisak ide kod kooperanta."},
			attachments:   []string{"etiketa-final-v2.pdf", "etiketa-dimenzije.png"},
			delivery:      demoDeliveryCourier,
		},
		{ // calendar with two starting steps done, cutting in progress
			key: "kalendar", customer: "dentis", description: "Zidni kalendar 2027, 150 kom", quantity: 150, template: "kalendar", daysAgo: 5, dueIn: 9,
			assignee: "jelena.markovic", priority: domain.WorkOrderPriorityNormal,
			details:     &domain.JobDetails{ProductCode: str("KAL-ZID"), PaperWeightGsm: integer(135), Dimensions: str("297 × 420 mm, 13 listova"), Quantity: integer(150)},
			lines:       []demoHistoryLine{svc("digital", 1950), goods("karton", 160), goods("spirala", 150)},
			scale:       map[string]float64{"papir": 1000, "karton": 160, "toner": 1, "spirala": 150, "ostaci": 20},
			statuses:    progress,
			done:        []demoDone{{steps: []string{"stampa-listova", "stampa-podloge"}}},
			inProgress:  []string{"secenje"},
			materials:   []domain.MaterialUsage{{Name: "Lepak za podlogu", Quantity: 1, Unit: "kom", UnitCost: num(850)}},
			timeEntries: map[string]int{"jelena.markovic": 150},
		},
		{ // roll-up banners sold as goods, every shipping option, proforma
			key: "rollup", customer: "pekara", description: "Roll-up baner 85 × 200, 2 kom", quantity: 2, template: "baner", daysAgo: 4, dueIn: 12,
			assignee: "ana.jovic", priority: domain.WorkOrderPriorityNormal,
			lines: []demoHistoryLine{goods("rollup", 2), sqm("ploter", 3.4)},
			scale: map[string]float64{"baner": 4, "otpad": 0.3},
			doc:   domain.BillingDocumentTypeProforma, proformaDueIn: 5,
			shipping: &domain.Shipping{
				DeliveryMethod: &post, PostagePaymentType: &advance, DrivesOut: true, WaitForPayment: true,
				HasPackaging: true, HasLabeling: true, IsFragile: true, RequiresSignature: true, HasInsurance: true,
				ShippingAddress: str("Pekara Liman, Narodnog fronta 45, Novi Sad"),
			},
			statuses: assigned,
		},
		{ // due tomorrow, customer notified by e-mail
			key: "memorandumi", customer: "firma", description: "Memorandumi A4, 2.000 kom", quantity: 2000, template: "offset", daysAgo: 2, dueIn: 1,
			assignee: "stefan.nikolic", priority: domain.WorkOrderPriorityNormal,
			lines:    []demoHistoryLine{svc("offset", 2000), goods("papir80", 520)},
			scale:    map[string]float64{"papir": 520, "boja": 1, "ploce": 4},
			statuses: assigned,
			notify:   true,
		},
		{ // in progress with the finishing step skipped
			key: "pozivnice", customer: "opstina", description: "Pozivnice za svečanost, 300 kom", quantity: 300, template: "digital", daysAgo: 3, dueIn: 5,
			assignee: demoOperatorUsername, priority: domain.WorkOrderPriorityNormal,
			lines:         []demoHistoryLine{svc("digital", 300), goods("karton", 40)},
			scale:         map[string]float64{"papir": 40, "toner": 1},
			statuses:      progress,
			done:          []demoDone{{steps: []string{"priprema"}}, {steps: []string{"stampa"}}},
			skipped:       []string{"dorada"},
			customerNotes: []string{"Pozivnice se isporučuju bez dorade, kako je dogovoreno."},
		},
	}
}

func (b *demoContentBuilder) workOrders() error {
	for i, order := range b.liveOrderSpecs() {
		number, err := b.createOrder(order)
		if err != nil {
			return fmt.Errorf("demo order %d (%s): %w", i+1, order.key, err)
		}
		b.orderNumbers[order.key] = number
	}
	return nil
}

// catalogLines builds invoice lines from the catalog: kind, description, unit
// and sale price come from the item; the API captures the cost on save.
func (b *demoContentBuilder) catalogLines(lines []demoHistoryLine) ([]domain.InvoiceLineItem, error) {
	out := make([]domain.InvoiceLineItem, 0, len(lines))
	for _, l := range lines {
		line := domain.InvoiceLineItem{Quantity: l.qty, Unit: l.unit}
		if line.Unit == "" {
			line.Unit = domain.InvoiceUnitKom
		}
		var item domain.CatalogItem
		var ok bool
		if l.service != "" {
			item, ok = b.services[l.service]
			line.Kind = domain.InvoiceLineItemKindService
		} else {
			item, ok = b.articles[l.article]
			line.Kind = domain.InvoiceLineItemKindGoods
		}
		if !ok {
			return nil, fmt.Errorf("unknown catalog key %q/%q", l.service, l.article)
		}
		line.CatalogItemID, line.Description = str(item.ID), item.Name
		if l.description != "" {
			line.Description = l.description
		}
		if l.price > 0 {
			line.UnitPrice = l.price
		} else if item.SalePrice != nil {
			line.UnitPrice = *item.SalePrice
		}
		out = append(out, line)
	}
	return out, nil
}

func (b *demoContentBuilder) createOrder(o demoOrder) (string, error) {
	customer, ok := b.customers[o.customer]
	if !ok {
		return "", fmt.Errorf("unknown customer %q", o.customer)
	}
	location := b.locations[o.customer]
	lines, err := b.catalogLines(o.lines)
	if err != nil {
		return "", err
	}
	lines = append(lines, o.adhoc...)
	var price float64
	for _, line := range lines {
		price += line.UnitPrice * line.Quantity
	}
	details := o.details
	if details == nil {
		details = &domain.JobDetails{Quantity: integer(o.quantity)}
	}
	doc := o.doc
	if doc == "" {
		doc = domain.BillingDocumentTypeInvoice
	}
	shipping := domain.Shipping{}
	if o.shipping != nil {
		shipping = *o.shipping
	} else {
		delivery := o.delivery
		if delivery == "" {
			delivery = demoHistoryDeliveries[len(b.liveOrders)%len(demoHistoryDeliveries)]
		}
		shipping.DeliveryMethod = &delivery
	}
	input := domain.CreateWorkOrderInput{
		CustomerID: str(customer.ID), ClientName: customer.Name, ContactPerson: customer.ContactName,
		JobDescription: o.description, JobDetails: details,
		BillingDocumentType: &doc, Shipping: shipping,
		IssuedBy: demoAdminUsername, IssueDate: b.day(-o.daysAgo), DueDate: str(b.day(o.dueIn)),
		Assignment: domain.Assignment{Priority: o.priority}, Price: num(price),
		InvoiceDraft: domain.InvoiceDraft{Status: domain.InvoiceDraftStatusDraft, LineItems: lines},
	}
	if location.ID != "" {
		input.LocationID = str(location.ID)
	}
	if o.assignee != "" {
		input.Assignment.AssignedTo = str(o.assignee)
		input.ExecutedBy = str(o.assignee)
	}
	if o.proformaDueIn != 0 {
		input.ProformaDueDate = str(b.day(o.proformaDueIn))
	}
	for _, body := range o.internalNotes {
		input.InternalNotes = append(input.InternalNotes, domain.WorkOrderNote{Author: demoAdminUsername, Body: body})
	}
	for _, body := range o.customerNotes {
		input.CustomerNotes = append(input.CustomerNotes, domain.WorkOrderNote{Author: demoAdminUsername, Body: body})
	}
	for _, name := range o.attachments {
		fileType := "application/pdf"
		if len(name) > 4 && name[len(name)-4:] == ".png" {
			fileType = "image/png"
		}
		input.Attachments = append(input.Attachments, domain.Attachment{FileName: name, FileType: fileType})
	}
	input.MaterialUsage = o.materials
	for operator, minutes := range o.timeEntries {
		input.TimeEntries = append(input.TimeEntries, domain.TimeEntry{Operator: operator, Minutes: minutes})
	}
	if o.notify && customer.Email != nil {
		input.Communication = domain.CustomerCommunication{NotificationEmail: customer.Email, EmailNotificationsEnabled: true}
	}
	order, err := b.s.CreateWorkOrder(b.ctx, input)
	if err != nil {
		return "", err
	}
	b.liveOrders = append(b.liveOrders, order.ID)

	// New orders get the default template automatically; any other one replaces it.
	template := b.templates[o.template]
	if process, err := b.s.WorkOrderProcess(b.ctx, order.ID); err != nil {
		return "", err
	} else if process == nil || process.TemplateID == nil || *process.TemplateID != template.ID {
		if process != nil {
			if err := b.s.DeleteWorkOrderProcess(b.ctx, order.ID); err != nil {
				return "", err
			}
		}
		if _, err := b.s.ApplyProcessTemplate(b.ctx, order.ID, template.ID, demoAdminUsername); err != nil {
			return "", err
		}
	}
	// Scale planned quantities on the order's own graph (admin, structural).
	if err := b.editProcess(order.ID, demoAdminUsername, true, func(node *domain.ProcessNode) {
		if qty, ok := o.scale[node.ID]; ok {
			node.Quantity = num(qty)
		}
	}); err != nil {
		return "", err
	}
	if err := b.setStatuses(order.ID, o.statuses); err != nil {
		return "", err
	}
	// Operators mark steps done and record actual quantities; the store posts
	// the matching consumption/production movements.
	operator := o.assignee
	if operator == "" {
		operator = demoOperatorUsername
	}
	for _, batch := range o.done {
		steps := map[string]bool{}
		for _, id := range batch.steps {
			steps[id] = true
		}
		if err := b.editProcess(order.ID, operator, false, func(node *domain.ProcessNode) {
			if steps[node.ID] {
				node.Status = domain.ProcessStepDone
			}
			if actual, ok := batch.actual[node.ID]; ok {
				node.ActualQuantity = num(actual)
			}
		}); err != nil {
			return "", err
		}
	}
	if len(o.inProgress)+len(o.skipped) > 0 {
		status := map[string]domain.ProcessStepStatus{}
		for _, id := range o.inProgress {
			status[id] = domain.ProcessStepInProgress
		}
		for _, id := range o.skipped {
			status[id] = domain.ProcessStepSkipped
		}
		if err := b.editProcess(order.ID, operator, false, func(node *domain.ProcessNode) {
			if s, ok := status[node.ID]; ok {
				node.Status = s
			}
		}); err != nil {
			return "", err
		}
	}
	if err := b.setStatuses(order.ID, o.finish); err != nil {
		return "", err
	}
	if o.invoice != nil {
		b.invoiceSeq[b.now.Year()]++
		number := fmt.Sprintf("FA-%d-%04d", b.now.Year(), b.invoiceSeq[b.now.Year()])
		current, err := b.s.WorkOrderByID(b.ctx, order.ID)
		if err != nil {
			return "", err
		}
		draft := current.InvoiceDraft
		draft.Status, draft.InvoiceNumber = domain.InvoiceDraftStatusIssued, str(number)
		fields := map[string]any{"invoiceDraft": draft, "billingDocumentNumber": number}
		if o.invoice.paid {
			draft.Status, draft.PaidAt = domain.InvoiceDraftStatusPaid, str(b.at(-1, 12, 0))
			fields["invoiceDraft"], fields["isPaid"] = draft, true
		}
		if err := b.patch(order.ID, fields); err != nil {
			return "", err
		}
	}
	if o.signedBy != "" {
		current, err := b.s.WorkOrderByID(b.ctx, order.ID)
		if err != nil {
			return "", err
		}
		communication := current.Communication
		communication.SignedBy, communication.SignedAt = str(o.signedBy), str(b.at(-5, 16, 45))
		if err := b.patch(order.ID, map[string]any{"communication": communication}); err != nil {
			return "", err
		}
	}
	return order.OrderNumber, nil
}

func (b *demoContentBuilder) editProcess(workOrderID, user string, structural bool, edit func(*domain.ProcessNode)) error {
	process, err := b.s.WorkOrderProcess(b.ctx, workOrderID)
	if err != nil {
		return err
	}
	if process == nil {
		return fmt.Errorf("work order %s has no process", workOrderID)
	}
	graph := domain.CloneProcessGraph(process.Graph)
	for i := range graph.Nodes {
		edit(&graph.Nodes[i])
	}
	_, err = b.s.UpdateWorkOrderProcess(b.ctx, workOrderID, graph, user, structural)
	return err
}
