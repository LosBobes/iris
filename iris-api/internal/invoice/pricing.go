package invoice

import (
	"fmt"
	"strings"
)

// The price list mirrors the landing page (apps/web/src/components/home/
// PricingPlans.tsx); TestPlansMatchLandingPage fails when the two drift.
// Prices are whole dinars and final: the provider is outside the VAT system.
//
// The price list sells plans, but the documents list every module as its own
// line. The base subscription costs what the Osnovni plan costs, and each
// higher plan's surcharge is split evenly over the modules it adds, so the
// lines of a plan always add up to its listed price.

// Billing is how the subscription is invoiced.
type Billing string

const (
	BillingMonthly   Billing = "mesecno"
	BillingQuarterly Billing = "kvartalno"
	BillingAnnual    Billing = "godisnje"
)

// Plan is one subscription plan of the price list.
type Plan struct {
	Key        string // flag value
	Name       string
	Monthly    int64 // RSD
	Annual     int64 // RSD, ten months for twelve
	Onboarding int64 // RSD, one-time
	Users      int   // users included
	// Modules are the modules this plan adds over the previous one.
	Modules []Module
}

// Module is an optional Iris module as an invoice line.
type Module struct {
	Code string
	Name string
}

// baseSubscription is the line every plan starts with.
var baseSubscription = Module{
	Code: "IR-OSN",
	Name: "Iris - osnovna pretplata (radni nalozi, klijenti i lokacije, katalog, kontrolna tabla, javno praćenje naloga)",
}

// Plans are ordered: each includes everything of the ones before it.
var Plans = []Plan{
	{Key: "osnovni", Name: "Osnovni", Monthly: 3900, Annual: 39000, Onboarding: 30000, Users: 5},
	{Key: "proizvodnja", Name: "Proizvodnja", Monthly: 8900, Annual: 89000, Onboarding: 80000, Users: 15, Modules: []Module{
		{Code: "IR-MAG", Name: "Iris - modul Magacin"},
		{Code: "IR-PRC", Name: "Iris - modul Procesi rada"},
		{Code: "IR-EFA", Name: "Iris - modul e-Fakture"},
		{Code: "IR-EOT", Name: "Iris - modul e-Otpremnice"},
	}},
	{Key: "pro", Name: "Pro", Monthly: 13900, Annual: 139000, Onboarding: 160000, Users: 25, Modules: []Module{
		{Code: "IR-PRS", Name: "Iris - modul Prisustvo"},
		{Code: "IR-PLN", Name: "Iris - modul Planiranje (dnevni plan i „Moj red“)"},
	}},
}

const (
	// ExtraUserMonthly is the price of a user over the plan's limit.
	ExtraUserMonthly int64 = 490
	// annualOnboardingDiscount applies to onboarding with an annual subscription.
	annualOnboardingDiscount = 30
)

// PlanOptions selects the generated lines.
type PlanOptions struct {
	Plan       string
	Billing    Billing
	Period     string // e.g. "oktobar 2026", appended to the base line
	ExtraUsers int
	Onboarding bool
}

// PlanItems returns the subscription lines for a plan: the base subscription,
// one line per module, extra users and, optionally, the one-time onboarding.
func PlanItems(opts PlanOptions) ([]Item, error) {
	index := -1
	for i, plan := range Plans {
		if plan.Key == strings.ToLower(strings.TrimSpace(opts.Plan)) {
			index = i
		}
	}
	if index < 0 {
		keys := make([]string, len(Plans))
		for i, plan := range Plans {
			keys[i] = plan.Key
		}
		return nil, fmt.Errorf("nepoznat paket %q (moguće: %s)", opts.Plan, strings.Join(keys, ", "))
	}

	// quantity and unit per billing; annual uses the annual prices as is.
	quantity, unit := 1.0, "MES"
	annual := false
	switch opts.Billing {
	case BillingMonthly, "":
	case BillingQuarterly:
		quantity = 3
	case BillingAnnual:
		unit, annual = "GOD", true
	default:
		return nil, fmt.Errorf("nepoznat način plaćanja %q (moguće: mesecno, kvartalno, godisnje)", opts.Billing)
	}
	price := func(plan Plan) int64 {
		if annual {
			return plan.Annual
		}
		return plan.Monthly
	}

	base := baseSubscription.Name
	if period := strings.TrimSpace(opts.Period); period != "" {
		base += ", " + period
	}
	items := []Item{{Code: baseSubscription.Code, Name: base, Unit: unit, Quantity: quantity, Price: float64(price(Plans[0]))}}
	for i := 1; i <= index; i++ {
		plan, previous := Plans[i], Plans[i-1]
		share := splitEvenly(price(plan)-price(previous), len(plan.Modules))
		for j, module := range plan.Modules {
			items = append(items, Item{Code: module.Code, Name: module.Name, Unit: unit, Quantity: quantity, Price: float64(share[j])})
		}
	}

	if opts.ExtraUsers > 0 {
		perUser := ExtraUserMonthly
		if annual {
			perUser *= 10 // ten months for twelve, like the plans
		}
		// Monthly and quarterly bill user-months; annual bills user-years.
		users := Item{
			Code: "IR-KOR", Name: fmt.Sprintf("Iris - dodatni korisnik (preko %d u paketu)", Plans[index].Users),
			Unit: "KOR/MES", Quantity: float64(opts.ExtraUsers) * quantity, Price: float64(perUser),
		}
		if annual {
			users.Unit, users.Quantity = "KOR/GOD", float64(opts.ExtraUsers)
		}
		items = append(items, users)
	}

	if opts.Onboarding {
		plan := Plans[index]
		item := Item{Code: "IR-UVO", Name: "Iris - uvođenje, paket " + plan.Name + " (jednokratno)", Unit: "KOM", Quantity: 1, Price: float64(plan.Onboarding)}
		if annual {
			item.Name += ", uz godišnju pretplatu"
			item.DiscountPercent = annualOnboardingDiscount
		}
		items = append(items, item)
	}
	return items, nil
}

// splitEvenly divides amount into n whole-dinar shares that add up to it,
// giving the remainder to the first shares.
func splitEvenly(amount int64, n int) []int64 {
	shares := make([]int64, n)
	for i := range shares {
		shares[i] = amount / int64(n)
		if int64(i) < amount%int64(n) {
			shares[i]++
		}
	}
	return shares
}

// ApplyDiscount gives every line without its own rabat the client's discount
// (percent); lines that already carry one keep it.
func ApplyDiscount(items []Item, percent float64) {
	for i := range items {
		if items[i].DiscountPercent == 0 {
			items[i].DiscountPercent = percent
		}
	}
}
