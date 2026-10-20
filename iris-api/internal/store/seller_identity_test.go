package store

import (
	"context"
	"errors"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func validSellerIdentity() domain.SellerIdentity {
	email := "  racuni@primer.rs "
	return domain.SellerIdentity{
		LegalName:   " Primer d.o.o. ",
		Pib:         "101234569",
		Mb:          "12345678",
		Street:      "Bulevar oslobođenja 1",
		City:        "Novi Sad",
		PostalCode:  "21000",
		CountryCode: "rs",
		BankAccount: "160-12345-67",
		VatPayer:    true,
		Email:       &email,
	}
}

func TestNormalizeSellerIdentity(t *testing.T) {
	identity, err := normalizeSellerIdentity(validSellerIdentity())
	if err != nil {
		t.Fatal(err)
	}
	if identity.LegalName != "Primer d.o.o." || identity.CountryCode != "RS" ||
		identity.BankAccount != "160-0000000012345-67" || identity.Email == nil || *identity.Email != "racuni@primer.rs" {
		t.Fatalf("normalized = %+v", identity)
	}

	blankEmail := " "
	cases := map[string]func(*domain.SellerIdentity){
		"no name":          func(i *domain.SellerIdentity) { i.LegalName = " " },
		"bad pib checksum": func(i *domain.SellerIdentity) { i.Pib = "101234568" },
		"short mb":         func(i *domain.SellerIdentity) { i.Mb = "1234567" },
		"no city":          func(i *domain.SellerIdentity) { i.City = "" },
		"rs postal code":   func(i *domain.SellerIdentity) { i.PostalCode = "2100" },
		"country code":     func(i *domain.SellerIdentity) { i.CountryCode = "SRB" },
		"account format":   func(i *domain.SellerIdentity) { i.BankAccount = "16-12345-67" },
		"account letters":  func(i *domain.SellerIdentity) { i.BankAccount = "160-12A45-67" },
		"bad email":        func(i *domain.SellerIdentity) { e := "racuni.primer.rs"; i.Email = &e },
	}
	for name, mutate := range cases {
		input := validSellerIdentity()
		mutate(&input)
		var validation *ValidationError
		if _, err := normalizeSellerIdentity(input); !errors.As(err, &validation) {
			t.Errorf("%s: err = %v, want a validation error", name, err)
		}
	}

	// A blank e-mail is dropped; a foreign address only needs some postal code.
	input := validSellerIdentity()
	input.Email = &blankEmail
	input.CountryCode = "DE"
	input.PostalCode = "D-10115"
	if identity, err := normalizeSellerIdentity(input); err != nil || identity.Email != nil {
		t.Fatalf("foreign seller = %+v, %v", identity, err)
	}
}

func TestNormalizeBankAccount(t *testing.T) {
	for raw, want := range map[string]string{
		"160-0000000012345-67": "160-0000000012345-67",
		"160000000001234567":   "160-0000000012345-67",
		" 160-12345-67 ":       "160-0000000012345-67",
	} {
		if got, ok := normalizeBankAccount(raw); !ok || got != want {
			t.Errorf("normalizeBankAccount(%q) = %q, %v; want %q", raw, got, ok, want)
		}
	}
	for _, raw := range []string{"", "160-12345", "16000000000123456", "160-00000000000012345-67", "160--67"} {
		if got, ok := normalizeBankAccount(raw); ok {
			t.Errorf("normalizeBankAccount(%q) = %q, want rejection", raw, got)
		}
	}
}

// scenarioSellerIdentityRoundTrip runs on both engines (see storeScenarios):
// no identity until saved, a saved one is normalized, survives a settings
// update of another key and an invalid one leaves the stored value as it was.
func scenarioSellerIdentityRoundTrip(t *testing.T, ctx context.Context, s *SQLStore) {
	settings, err := s.OrganizationSettings(ctx)
	if err != nil || settings.SellerIdentity != nil {
		t.Fatalf("default seller identity = %+v, %v", settings.SellerIdentity, err)
	}
	identity := validSellerIdentity()
	if settings, err = s.UpdateOrganizationSettings(ctx, domain.OrganizationSettingsUpdate{SellerIdentity: &identity}); err != nil {
		t.Fatal(err)
	}
	if settings.SellerIdentity == nil || settings.SellerIdentity.BankAccount != "160-0000000012345-67" {
		t.Fatalf("saved seller identity = %+v", settings.SellerIdentity)
	}

	show := true
	if _, err := s.UpdateOrganizationSettings(ctx, domain.OrganizationSettingsUpdate{ShowShippingOptions: &show}); err != nil {
		t.Fatal(err)
	}
	invalid := validSellerIdentity()
	invalid.Pib = "123"
	if _, err := s.UpdateOrganizationSettings(ctx, domain.OrganizationSettingsUpdate{SellerIdentity: &invalid}); err == nil {
		t.Fatal("invalid seller identity accepted")
	}
	settings, err = s.OrganizationSettings(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if settings.SellerIdentity == nil || settings.SellerIdentity.LegalName != "Primer d.o.o." ||
		!settings.SellerIdentity.VatPayer || settings.SellerIdentity.Email == nil {
		t.Fatalf("reloaded seller identity = %+v", settings.SellerIdentity)
	}
	// The cached copy must not alias what callers receive.
	settings.SellerIdentity.LegalName = "changed"
	if again, _ := s.OrganizationSettings(ctx); again.SellerIdentity.LegalName != "Primer d.o.o." {
		t.Fatal("settings cache returned a shared seller identity")
	}
}

func TestFixtureStoreSellerIdentity(t *testing.T) {
	s := NewFixtureStore(t.TempDir())
	ctx := context.Background()
	identity := validSellerIdentity()
	settings, err := s.UpdateOrganizationSettings(ctx, domain.OrganizationSettingsUpdate{SellerIdentity: &identity})
	if err != nil || settings.SellerIdentity == nil || settings.SellerIdentity.CountryCode != "RS" {
		t.Fatalf("fixture save = %+v, %v", settings.SellerIdentity, err)
	}
	if settings, _ = s.OrganizationSettings(ctx); settings.SellerIdentity == nil || settings.SellerIdentity.Pib != "101234569" {
		t.Fatalf("fixture reload = %+v", settings.SellerIdentity)
	}
}
