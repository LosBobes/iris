package invoice

import (
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

func TestPlanItemsAddUpToThePriceList(t *testing.T) {
	for _, plan := range Plans {
		for billing, want := range map[Billing]int64{BillingMonthly: plan.Monthly, BillingQuarterly: 3 * plan.Monthly, BillingAnnual: plan.Annual} {
			items, err := PlanItems(PlanOptions{Plan: plan.Key, Billing: billing})
			if err != nil {
				t.Fatal(err)
			}
			if got := lineSum(items); got != want {
				t.Errorf("%s %s: lines add up to %d, want %d", plan.Key, billing, got, want)
			}
		}
	}
}

func TestPlanItemsListEveryModule(t *testing.T) {
	items, err := PlanItems(PlanOptions{Plan: "Pro", Period: "oktobar 2026", ExtraUsers: 2, Onboarding: true})
	if err != nil {
		t.Fatal(err)
	}
	codes := []string{"IR-OSN", "IR-MAG", "IR-PRC", "IR-EFA", "IR-EOT", "IR-PRS", "IR-PLN", "IR-KOR", "IR-UVO"}
	if len(items) != len(codes) {
		t.Fatalf("got %d lines, want %d: %+v", len(items), len(codes), items)
	}
	for i, code := range codes {
		if items[i].Code != code {
			t.Errorf("line %d = %s, want %s", i+1, items[i].Code, code)
		}
	}
	if items[0].Name != baseSubscription.Name+", oktobar 2026" {
		t.Errorf("base line = %q", items[0].Name)
	}
	if items[1].Price != 1250 || items[5].Price != 2500 {
		t.Errorf("module shares = %v / %v, want 1250 / 2500", items[1].Price, items[5].Price)
	}
	if items[7].Quantity != 2 || items[7].Price != 490 || items[8].Price != 160000 || items[8].DiscountPercent != 0 {
		t.Errorf("extra users / onboarding: %+v / %+v", items[7], items[8])
	}

	annual, _ := PlanItems(PlanOptions{Plan: "pro", Billing: BillingAnnual, ExtraUsers: 1, Onboarding: true})
	users, onboarding := annual[7], annual[8]
	if users.Unit != "KOR/GOD" || users.Price != 4900 || onboarding.DiscountPercent != annualOnboardingDiscount {
		t.Errorf("annual extra users / onboarding: %+v / %+v", users, onboarding)
	}

	if _, err := PlanItems(PlanOptions{Plan: "zlatni"}); err == nil {
		t.Error("expected an error for an unknown plan")
	}
	if _, err := PlanItems(PlanOptions{Plan: "pro", Billing: "nedeljno"}); err == nil {
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

// TestPlansMatchLandingPage keeps Plans in step with the public price list.
func TestPlansMatchLandingPage(t *testing.T) {
	src, err := os.ReadFile("../../../apps/web/src/components/home/PricingPlans.tsx")
	if err != nil {
		t.Skipf("landing page not in this checkout: %v", err)
	}
	block := regexp.MustCompile(`name: "([^"]+)",[\s\S]*?monthly: (\d+),\s*annual: (\d+),\s*users: (\d+),\s*onboarding: (\d+)`)
	matches := block.FindAllStringSubmatch(string(src), -1)
	if len(matches) != len(Plans) {
		t.Fatalf("landing page lists %d plans, Plans has %d", len(matches), len(Plans))
	}
	num := func(s string) int64 { n, _ := strconv.ParseInt(s, 10, 64); return n }
	for i, m := range matches {
		p := Plans[i]
		if m[1] != p.Name || num(m[2]) != p.Monthly || num(m[3]) != p.Annual || int(num(m[4])) != p.Users || num(m[5]) != p.Onboarding {
			t.Errorf("plan %d: landing page %v, Plans %+v", i+1, m[1:], p)
		}
	}
	if extra := regexp.MustCompile(`Dodatni korisnik je (\d+) RSD`).FindStringSubmatch(string(src)); extra == nil || num(extra[1]) != ExtraUserMonthly {
		t.Errorf("extra user price on the landing page = %v, want %d", extra, ExtraUserMonthly)
	}
	if !regexp.MustCompile(`uvođenje je ` + strconv.Itoa(annualOnboardingDiscount) + `% jeftinije`).Match(src) {
		t.Errorf("annual onboarding discount on the landing page is not %d%%", annualOnboardingDiscount)
	}
}
