package invoice

import (
	"encoding/json"
	"os"
	"regexp"
	"strconv"
	"testing"
)

func lineSum(items []Item) int64 {
	var sum int64
	for _, item := range items {
		sum += toPara(item.Quantity*item.Price*(1-item.DiscountPercent/100)) / 100
	}
	return sum
}

func pricing(t *testing.T, spec string, opts PricingOptions) []Item {
	t.Helper()
	modules, err := ParseModules(spec)
	if err != nil {
		t.Fatal(err)
	}
	opts.Modules = modules
	if opts.ModuleLicence == 0 {
		opts.ModuleLicence = DefaultModuleLicence
	}
	if opts.ModuleMonthly == 0 {
		opts.ModuleMonthly = DefaultModuleMonthly
	}
	items, err := PricingItems(opts)
	if err != nil {
		t.Fatal(err)
	}
	return items
}

func TestParseModules(t *testing.T) {
	modules, err := ParseModules("planiranje, Magacin")
	if err != nil || len(modules) != 2 || modules[0].Key != "magacin" || modules[1].Key != "planiranje" {
		t.Fatalf("modules = %+v, %v", modules, err)
	}
	for plan, want := range map[string]int{"pro": 6, "proizvodnja": 4, "osnovni": 0, "": 0} {
		if modules, err := ParseModules(plan); err != nil || len(modules) != want {
			t.Errorf("ParseModules(%q) = %d modules, %v; want %d", plan, len(modules), err, want)
		}
	}
	if _, err := ParseModules("magacin,crm"); err == nil {
		t.Error("expected an error for an unknown module")
	}
}

func TestLicenceIsOneLinePerModule(t *testing.T) {
	items := pricing(t, "pro", PricingOptions{Licence: true})
	if len(items) != 6 || lineSum(items) != 6*DefaultModuleLicence {
		t.Fatalf("licence lines = %d, sum %d", len(items), lineSum(items))
	}
	if items[0].Code != "IR-LMAG" || items[5].Code != "IR-LPLN" || items[0].Unit != "KOM" {
		t.Errorf("licence lines: %+v", items)
	}
	if _, err := PricingItems(PricingOptions{Licence: true}); err == nil {
		t.Error("expected an error for a licence without modules")
	}
}

func TestSubscriptionGrowsByModule(t *testing.T) {
	cases := []struct {
		spec    string
		billing Billing
		want    int64
	}{
		{"osnovni", BillingMonthly, 3900},
		{"pro", BillingMonthly, 3900 + 6*300},
		{"magacin,procesi", BillingQuarterly, 3 * (3900 + 2*300)},
		{"pro", BillingAnnual, 10 * (3900 + 6*300)},
	}
	for _, c := range cases {
		items := pricing(t, c.spec, PricingOptions{Subscription: true, Billing: c.billing})
		if got := lineSum(items); got != c.want {
			t.Errorf("%s %s: subscription %d, want %d", c.spec, c.billing, got, c.want)
		}
	}

	items := pricing(t, "pro", PricingOptions{Subscription: true, Period: "oktobar 2026", ExtraUsers: 2})
	if len(items) != 3 || items[1].Quantity != 6 || items[1].Price != 300 || items[1].Unit != "MOD/MES" {
		t.Fatalf("subscription lines: %+v", items)
	}
	if items[2].Code != "IR-KOR" || items[2].Quantity != 2 || items[2].Price != 490 {
		t.Errorf("extra users: %+v", items[2])
	}
	if _, err := PricingItems(PricingOptions{Subscription: true, Billing: "nedeljno"}); err == nil {
		t.Error("expected an error for an unknown billing")
	}
}

func TestApplyDiscountKeepsOwnRabat(t *testing.T) {
	items := []Item{{Price: 100}, {Price: 100, DiscountPercent: 10}}
	ApplyDiscount(items, 30)
	if items[0].DiscountPercent != 30 || items[1].DiscountPercent != 10 {
		t.Fatalf("discounts = %v, %v", items[0].DiscountPercent, items[1].DiscountPercent)
	}
}

// TestPricesMatchLandingPage keeps the base subscription and the extra-user
// price in step with the public price list, which the landing page and its
// PDF read from apps/web/src/lib/home/pricing.json.
func TestPricesMatchLandingPage(t *testing.T) {
	src, err := os.ReadFile("../../../apps/web/src/lib/home/pricing.json")
	if err != nil {
		t.Skipf("landing page not in this checkout: %v", err)
	}
	var pricing struct {
		Plans []struct {
			Name    string `json:"name"`
			Monthly int64  `json:"monthly"`
			Users   int    `json:"users"`
		} `json:"plans"`
		Terms string `json:"terms"`
	}
	if err := json.Unmarshal(src, &pricing); err != nil {
		t.Fatalf("pricing.json: %v", err)
	}
	found := false
	for _, plan := range pricing.Plans {
		if plan.Name != "Osnovni" {
			continue
		}
		found = true
		if plan.Monthly != BaseMonthly || plan.Users != BaseUsers {
			t.Errorf("Osnovni on the landing page = %d RSD for %d users, want %d RSD for %d users",
				plan.Monthly, plan.Users, BaseMonthly, BaseUsers)
		}
	}
	if !found {
		t.Error("no Osnovni plan on the landing page")
	}
	extra := regexp.MustCompile(`Dodatni korisnik je (\d+) RSD`).FindStringSubmatch(pricing.Terms)
	if extra == nil || extra[1] != strconv.FormatInt(ExtraUserMonthly, 10) {
		t.Errorf("extra user price on the landing page = %q, want %d", extra, ExtraUserMonthly)
	}
}
