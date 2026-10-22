package invoice

import (
	"fmt"
	"strings"
)

// Iris is sold as a one-time licence per module plus a monthly subscription
// that grows by a small fee for every module the organization runs. The
// licence also covers onboarding. Prices are whole dinars and final: the
// provider is outside the VAT system.
//
// BaseMonthly and ExtraUserMonthly mirror the landing page's price list
// (apps/web/src/components/home/PricingPlans.tsx); TestPricesMatchLandingPage
// fails when they drift.

// Billing is how the subscription is invoiced.
type Billing string

const (
	BillingMonthly   Billing = "mesecno"
	BillingQuarterly Billing = "kvartalno"
	BillingAnnual    Billing = "godisnje"
)

const (
	// BaseMonthly is the subscription without modules (the Osnovni plan).
	BaseMonthly int64 = 3900
	// BaseUsers is how many users the subscription includes.
	BaseUsers = 5
	// ExtraUserMonthly is the price of a user over BaseUsers.
	ExtraUserMonthly int64 = 490
	// DefaultModuleLicence is the one-time licence of a module.
	DefaultModuleLicence int64 = 12500
	// DefaultModuleMonthly is what each module adds to the monthly subscription.
	DefaultModuleMonthly int64 = 300
	// annualMonths is what a year costs in months (ten months for twelve).
	annualMonths = 10
)

// Module is an optional Iris module as an invoice line.
type Module struct {
	Key  string // flag value
	Code string
	Name string
}

// Modules are listed in the order they appear on documents.
var Modules = []Module{
	{Key: "magacin", Code: "MAG", Name: "Magacin"},
	{Key: "procesi", Code: "PRC", Name: "Procesi rada"},
	{Key: "efakture", Code: "EFA", Name: "e-Fakture"},
	{Key: "eotpremnice", Code: "EOT", Name: "e-Otpremnice"},
	{Key: "prisustvo", Code: "PRS", Name: "Prisustvo"},
	{Key: "planiranje", Code: "PLN", Name: "Planiranje"},
}

// planModules are shortcuts for -modules, named after the landing page plans.
var planModules = map[string][]string{
	"osnovni":     {},
	"proizvodnja": {"magacin", "procesi", "efakture", "eotpremnice"},
	"pro":         {"magacin", "procesi", "efakture", "eotpremnice", "prisustvo", "planiranje"},
}

// ParseModules reads a comma-separated module list ("magacin,procesi") or a
// plan name ("pro", "proizvodnja", "osnovni") into Modules order.
func ParseModules(spec string) ([]Module, error) {
	spec = strings.ToLower(strings.TrimSpace(spec))
	keys := strings.Split(spec, ",")
	if plan, ok := planModules[spec]; ok {
		keys = plan
	}
	wanted := map[string]bool{}
	for _, key := range keys {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		found := false
		for _, module := range Modules {
			found = found || module.Key == key
		}
		if !found {
			names := make([]string, len(Modules))
			for i, module := range Modules {
				names[i] = module.Key
			}
			return nil, fmt.Errorf("nepoznat modul %q (moguće: %s, ili paket osnovni, proizvodnja, pro)", key, strings.Join(names, ", "))
		}
		wanted[key] = true
	}
	var modules []Module
	for _, module := range Modules {
		if wanted[module.Key] {
			modules = append(modules, module)
		}
	}
	return modules, nil
}

// PricingOptions selects the generated lines.
type PricingOptions struct {
	Modules []Module
	// Licence adds one licence line per module; Subscription adds the
	// subscription for Billing.
	Licence, Subscription bool
	Billing               Billing
	Period                string // e.g. "oktobar 2026", appended to the subscription
	ExtraUsers            int
	ModuleLicence         int64 // RSD per module, one-time
	ModuleMonthly         int64 // RSD per module and month
}

// PricingItems returns the licence lines (one per module) and the
// subscription: the base line, one line for all modules (quantity = module
// count) and extra users.
func PricingItems(opts PricingOptions) ([]Item, error) {
	var items []Item
	if opts.Licence {
		if len(opts.Modules) == 0 {
			return nil, fmt.Errorf("licenca se naplaćuje po modulu: zadajte -modules")
		}
		for _, module := range opts.Modules {
			items = append(items, Item{
				Code: "IR-L" + module.Code, Name: "Iris - licenca za modul " + module.Name + ", sa uvođenjem (jednokratno)",
				Unit: "KOM", Quantity: 1, Price: float64(opts.ModuleLicence),
			})
		}
	}
	if !opts.Subscription {
		return items, nil
	}

	// months billed per line; annual bills one year at ten months' price.
	quantity, unit, months := 1.0, "MES", int64(1)
	switch opts.Billing {
	case BillingMonthly, "":
	case BillingQuarterly:
		quantity = 3
	case BillingAnnual:
		unit, months = "GOD", annualMonths
	default:
		return nil, fmt.Errorf("nepoznat način plaćanja %q (moguće: mesecno, kvartalno, godisnje)", opts.Billing)
	}

	base := "Iris - pretplata, osnovni sistem (radni nalozi, klijenti i lokacije, katalog, kontrolna tabla, javno praćenje naloga)"
	if period := strings.TrimSpace(opts.Period); period != "" {
		base += ", " + period
	}
	items = append(items, Item{Code: "IR-PRE", Name: base, Unit: unit, Quantity: quantity, Price: float64(BaseMonthly * months)})

	if n := len(opts.Modules); n > 0 {
		names := make([]string, n)
		for i, module := range opts.Modules {
			names[i] = module.Name
		}
		perModule := "MOD/" + unit
		items = append(items, Item{
			Code: "IR-PMO", Name: "Iris - pretplata za module: " + strings.Join(names, ", "),
			Unit: perModule, Quantity: float64(n) * quantity, Price: float64(opts.ModuleMonthly * months),
		})
	}

	if opts.ExtraUsers > 0 {
		items = append(items, Item{
			Code: "IR-KOR", Name: fmt.Sprintf("Iris - dodatni korisnik (preko %d u pretplati)", BaseUsers),
			Unit: "KOR/" + unit, Quantity: float64(opts.ExtraUsers) * quantity, Price: float64(ExtraUserMonthly * months),
		})
	}
	return items, nil
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
