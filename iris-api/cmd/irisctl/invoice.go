package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/LosBobes/iris/iris-api/internal/invoice"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

// stringList is a repeatable string flag (-item … -item …).
type stringList []string

func (l *stringList) String() string     { return strings.Join(*l, ", ") }
func (l *stringList) Set(v string) error { *l = append(*l, v); return nil }

// invoiceSellerEnv points at the seller JSON when -seller is not given.
const invoiceSellerEnv = "IRIS_INVOICE_SELLER"

// runInvoice issues the vendor's invoice (račun) to a client organization.
func runInvoice(ctx context.Context, args []string) error {
	return runDocument(ctx, invoice.KindInvoice, args)
}

// runOffer issues the vendor's offer (ponuda) to a prospective client.
func runOffer(ctx context.Context, args []string) error {
	return runDocument(ctx, invoice.KindOffer, args)
}

// runDocument issues a račun or a ponuda as a PDF, or as HTML with -html. The
// buyer comes from flags or, with -tenant, from that organization's saved
// seller identity (its legal name, address, PIB, MB).
func runDocument(ctx context.Context, kind invoice.Kind, args []string) error {
	offer := kind == invoice.KindOffer
	name, noun, prefix := "invoice", "računa", "racun-"
	if offer {
		name, noun, prefix = "offer", "ponude", "ponuda-"
	}
	cmd := flag.NewFlagSet(name, flag.ExitOnError)
	sellerPath := cmd.String("seller", os.Getenv(invoiceSellerEnv), "JSON sa podacima prodavca (ili "+invoiceSellerEnv+")")
	number := cmd.String("number", "", "broj "+noun+", npr. 26-PW0001")
	issueDate := cmd.String("date", time.Now().Format(time.DateOnly), "datum izdavanja GGGG-MM-DD")
	var supplyDate, dueDate, paymentTerms, deliveryTerms *string
	var dueDays *int
	if offer {
		dueDate = cmd.String("valid-until", "", "ponuda važi do GGGG-MM-DD (podrazumevano datum + -valid-days)")
		dueDays = cmd.Int("valid-days", 15, "rok važenja ponude u danima kad -valid-until nije zadat")
		paymentTerms = cmd.String("payment", "Po ispostavljenom računu, u roku od 8 dana", "način plaćanja")
		deliveryTerms = cmd.String("delivery", "", "rok isporuke ili implementacije")
		supplyDate = new(string)
	} else {
		supplyDate = cmd.String("supply-date", "", "datum prometa GGGG-MM-DD (podrazumevano datum izdavanja)")
		dueDate = cmd.String("due", "", "valuta plaćanja GGGG-MM-DD (podrazumevano datum + -due-days)")
		dueDays = cmd.Int("due-days", 8, "rok plaćanja u danima kad -due nije zadat")
		paymentTerms, deliveryTerms = new(string), new(string)
	}
	place := cmd.String("place", "", "mesto izdavanja i prometa (podrazumevano grad prodavca)")
	tenantSlug := cmd.String("tenant", "", "oznaka organizacije: kupac se popunjava iz njenih podataka za e-fakture")
	buyerName := cmd.String("buyer-name", "", "naziv kupca")
	buyerStreet := cmd.String("buyer-street", "", "ulica i broj kupca")
	buyerPostal := cmd.String("buyer-postal", "", "poštanski broj kupca")
	buyerCity := cmd.String("buyer-city", "", "mesto kupca")
	buyerPib := cmd.String("buyer-pib", "", "PIB kupca")
	buyerMb := cmd.String("buyer-mb", "", "matični broj kupca")
	partnerCode := cmd.String("partner-code", "", "šifra partnera")
	contract := cmd.String("contract", "", "osnov, npr. \"Ugovor br. 12/2026\"")
	note := cmd.String("note", "", "napomena na dokumentu")
	vat := cmd.Float64("vat", 20, "podrazumevana stopa PDV-a za stavke (ako je prodavac u sistemu PDV-a)")
	model := new(string)
	*model = "97"
	if !offer {
		model = cmd.String("model", "97", "model poziva na broj: 97 (sa kontrolnim brojem) ili 00")
	}
	out := cmd.String("out", "", "izlazni fajl (podrazumevano "+prefix+"<broj>.pdf)")
	asHTML := cmd.Bool("html", false, "upiši HTML umesto PDF-a")
	plan := cmd.String("plan", "", "paket iz cenovnika (osnovni, proizvodnja, pro): pretplata i svaki modul kao posebna stavka")
	billing := cmd.String("billing", string(invoice.BillingMonthly), "obračun pretplate: mesecno, kvartalno ili godisnje")
	period := cmd.String("period", "", "period pretplate na stavci, npr. \"oktobar 2026\"")
	extraUsers := cmd.Int("extra-users", 0, "broj dodatnih korisnika preko limita paketa")
	onboarding := cmd.Bool("onboarding", false, "dodaj jednokratno uvođenje paketa")
	discount := cmd.Float64("discount", 0, "rabat klijenta u % za sve stavke bez sopstvenog rabata")
	var items stringList
	cmd.Var(&items, "item", "stavka \"naziv;jm;količina;cena[;rabat%][;pdv%][;šifra]\" (ponovljivo)")
	_ = cmd.Parse(args)

	if strings.TrimSpace(*sellerPath) == "" {
		return errors.New("zadajte -seller <fajl.json> ili " + invoiceSellerEnv + " (primer: deploy/invoice/seller.example.json)")
	}
	seller, err := invoice.LoadSeller(*sellerPath)
	if err != nil {
		return err
	}

	inv := invoice.Invoice{
		Kind:          kind,
		Number:        strings.TrimSpace(*number),
		IssueDate:     *issueDate,
		SupplyDate:    *supplyDate,
		DueDate:       *dueDate,
		IssuePlace:    *place,
		SupplyPlace:   *place,
		ContractRef:   *contract,
		PartnerCode:   *partnerCode,
		Seller:        seller,
		Note:          *note,
		PaymentModel:  *model,
		PaymentTerms:  strings.TrimSpace(*paymentTerms),
		DeliveryTerms: strings.TrimSpace(*deliveryTerms),
	}
	if inv.SupplyDate == "" {
		inv.SupplyDate = inv.IssueDate
	}
	if inv.DueDate == "" {
		issued, err := time.Parse(time.DateOnly, inv.IssueDate)
		if err != nil {
			return fmt.Errorf("datum %q mora biti u obliku GGGG-MM-DD", inv.IssueDate)
		}
		inv.DueDate = issued.AddDate(0, 0, *dueDays).Format(time.DateOnly)
	}
	if inv.IssuePlace == "" {
		inv.IssuePlace, inv.SupplyPlace = seller.City, seller.City
	}

	if *tenantSlug != "" {
		buyer, err := tenantBuyer(ctx, *tenantSlug)
		if err != nil {
			return err
		}
		inv.Buyer = buyer
	}
	for target, value := range map[*string]string{
		&inv.Buyer.Name: *buyerName, &inv.Buyer.Street: *buyerStreet, &inv.Buyer.PostalCode: *buyerPostal,
		&inv.Buyer.City: *buyerCity, &inv.Buyer.Pib: *buyerPib, &inv.Buyer.Mb: *buyerMb,
	} {
		if v := strings.TrimSpace(value); v != "" {
			*target = v
		}
	}

	if *plan != "" {
		planItems, err := invoice.PlanItems(invoice.PlanOptions{
			Plan: *plan, Billing: invoice.Billing(*billing), Period: *period,
			ExtraUsers: *extraUsers, Onboarding: *onboarding,
		})
		if err != nil {
			return err
		}
		for i := range planItems {
			planItems[i].VatPercent = *vat
		}
		inv.Items = append(inv.Items, planItems...)
	}
	for _, spec := range items {
		item, err := invoice.ParseItem(spec, *vat)
		if err != nil {
			return err
		}
		inv.Items = append(inv.Items, item)
	}
	if *discount < 0 || *discount > 100 {
		return fmt.Errorf("rabat mora biti između 0 i 100%%")
	}
	invoice.ApplyDiscount(inv.Items, *discount)
	if err := inv.Validate(); err != nil {
		return err
	}

	path := *out
	if path == "" {
		ext := ".pdf"
		if *asHTML {
			ext = ".html"
		}
		path = prefix + regexp.MustCompile(`[^A-Za-z0-9_-]+`).ReplaceAllString(inv.Number, "-") + ext
	}
	var content []byte
	if *asHTML {
		html, err := invoice.RenderHTML(inv)
		if err != nil {
			return err
		}
		content = []byte(html)
	} else if content, err = invoice.RenderPDF(ctx, inv); err != nil {
		return err
	}
	if err := os.WriteFile(path, content, 0o644); err != nil {
		return err
	}
	total := inv.Compute().Total
	if offer {
		fmt.Printf("Ponuda %s za %s: %s RSD, važi do %s → %s\n", inv.Number, inv.Buyer.Name, invoice.FormatMoney(total), inv.DueDate, path)
	} else {
		fmt.Printf("Račun %s za %s: %s RSD, valuta %s → %s\n", inv.Number, inv.Buyer.Name, invoice.FormatMoney(total), inv.DueDate, path)
	}
	return nil
}

// tenantBuyer reads the buyer from an organization in the Iris database: its
// seller identity for e-invoicing when saved, otherwise just its name.
func tenantBuyer(ctx context.Context, slug string) (invoice.Party, error) {
	dataStore := mustOpenStore(ctx)
	defer dataStore.Close()
	tenant, err := dataStore.TenantBySlug(ctx, slug)
	if err != nil {
		return invoice.Party{}, err
	}
	if tenant == nil {
		return invoice.Party{}, fmt.Errorf("organizacija %q ne postoji", slug)
	}
	settings, err := dataStore.OrganizationSettings(store.ContextWithTenant(ctx, tenant.ID))
	if err != nil {
		return invoice.Party{}, err
	}
	identity := settings.SellerIdentity
	if identity == nil {
		return invoice.Party{Name: tenant.Name}, nil
	}
	return invoice.Party{
		Name:       identity.LegalName,
		Street:     identity.Street,
		PostalCode: identity.PostalCode,
		City:       identity.City,
		Pib:        identity.Pib,
		Mb:         identity.Mb,
	}, nil
}
