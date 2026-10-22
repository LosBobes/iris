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

// runInvoice issues the vendor's invoice (račun) to a client organization as a
// PDF, or as HTML with -html. The buyer comes from flags or, with -tenant, from
// that organization's saved seller identity (its legal name, address, PIB, MB).
func runInvoice(ctx context.Context, args []string) error {
	cmd := flag.NewFlagSet("invoice", flag.ExitOnError)
	sellerPath := cmd.String("seller", os.Getenv(invoiceSellerEnv), "JSON sa podacima prodavca (ili "+invoiceSellerEnv+")")
	number := cmd.String("number", "", "broj računa, npr. 26-PW0001")
	issueDate := cmd.String("date", time.Now().Format(time.DateOnly), "datum izdavanja GGGG-MM-DD")
	supplyDate := cmd.String("supply-date", "", "datum prometa GGGG-MM-DD (podrazumevano datum izdavanja)")
	dueDate := cmd.String("due", "", "valuta plaćanja GGGG-MM-DD (podrazumevano datum + -due-days)")
	dueDays := cmd.Int("due-days", 8, "rok plaćanja u danima kad -due nije zadat")
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
	note := cmd.String("note", "", "napomena na računu")
	vat := cmd.Float64("vat", 20, "podrazumevana stopa PDV-a za stavke (ako je prodavac u sistemu PDV-a)")
	model := cmd.String("model", "97", "model poziva na broj: 97 (sa kontrolnim brojem) ili 00")
	out := cmd.String("out", "", "izlazni fajl (podrazumevano racun-<broj>.pdf)")
	asHTML := cmd.Bool("html", false, "upiši HTML umesto PDF-a")
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
		Number:       strings.TrimSpace(*number),
		IssueDate:    *issueDate,
		SupplyDate:   *supplyDate,
		DueDate:      *dueDate,
		IssuePlace:   *place,
		SupplyPlace:  *place,
		ContractRef:  *contract,
		PartnerCode:  *partnerCode,
		Seller:       seller,
		Note:         *note,
		PaymentModel: *model,
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

	for _, spec := range items {
		item, err := invoice.ParseItem(spec, *vat)
		if err != nil {
			return err
		}
		inv.Items = append(inv.Items, item)
	}
	if err := inv.Validate(); err != nil {
		return err
	}

	path := *out
	if path == "" {
		ext := ".pdf"
		if *asHTML {
			ext = ".html"
		}
		path = "racun-" + regexp.MustCompile(`[^A-Za-z0-9_-]+`).ReplaceAllString(inv.Number, "-") + ext
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
	fmt.Printf("Račun %s za %s: %s RSD, valuta %s → %s\n", inv.Number, inv.Buyer.Name, invoice.FormatMoney(total), inv.DueDate, path)
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
