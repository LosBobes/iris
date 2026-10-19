package store

import (
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// Seller identity (D-030): the organization's own legal data for government
// e-invoices and e-dispatch notes. It lives in app_settings under
// sellerIdentitySettingKey as JSON (no migration) and is saved whole.

const (
	sellerLegalNameRequiredMessage = "Poslovno ime firme je obavezno."
	sellerPibMessage               = "PIB firme mora imati 9 cifara sa ispravnom kontrolnom cifrom."
	sellerMbMessage                = "Matični broj firme mora imati tačno 8 cifara."
	sellerAddressRequiredMessage   = "Ulica i broj, mesto i poštanski broj firme su obavezni."
	sellerPostalCodeMessage        = "Poštanski broj mora imati 5 cifara."
	sellerCountryCodeMessage       = "Oznaka države mora imati dva slova (npr. RS)."
	sellerBankAccountMessage       = "Tekući račun mora biti u obliku 123-1234567890123-12."
	sellerEmailMessage             = "E-adresa firme nije ispravna."
	sellerFieldTooLongMessage      = "Podatak o firmi je predugačak."
	sellerFieldMaxLength           = 200
)

// normalizeSellerIdentity trims every field, upper-cases the country code
// (default "RS"), formats the bank account canonically and validates the
// result. A Serbian address needs a 5-digit postal code; a foreign one only a
// non-empty code.
func normalizeSellerIdentity(identity domain.SellerIdentity) (domain.SellerIdentity, error) {
	identity.LegalName = strings.TrimSpace(identity.LegalName)
	identity.Pib = strings.TrimSpace(identity.Pib)
	identity.Mb = strings.TrimSpace(identity.Mb)
	identity.Street = strings.TrimSpace(identity.Street)
	identity.City = strings.TrimSpace(identity.City)
	identity.PostalCode = strings.TrimSpace(identity.PostalCode)
	identity.CountryCode = strings.ToUpper(strings.TrimSpace(identity.CountryCode))
	if identity.CountryCode == "" {
		identity.CountryCode = "RS"
	}
	if identity.Email != nil {
		email := strings.TrimSpace(*identity.Email)
		if email == "" {
			identity.Email = nil
		} else {
			identity.Email = &email
		}
	}

	for _, value := range []string{identity.LegalName, identity.Street, identity.City, identity.PostalCode} {
		if len([]rune(value)) > sellerFieldMaxLength {
			return domain.SellerIdentity{}, newValidationError(sellerFieldTooLongMessage)
		}
	}
	if identity.LegalName == "" {
		return domain.SellerIdentity{}, newValidationError(sellerLegalNameRequiredMessage)
	}
	if !domain.ValidatePIB(identity.Pib) {
		return domain.SellerIdentity{}, newValidationError(sellerPibMessage)
	}
	if !domain.ValidateMB(identity.Mb) {
		return domain.SellerIdentity{}, newValidationError(sellerMbMessage)
	}
	if identity.Street == "" || identity.City == "" || identity.PostalCode == "" {
		return domain.SellerIdentity{}, newValidationError(sellerAddressRequiredMessage)
	}
	if len(identity.CountryCode) != 2 || !isASCIIUpper(identity.CountryCode) {
		return domain.SellerIdentity{}, newValidationError(sellerCountryCodeMessage)
	}
	if identity.CountryCode == "RS" && (len(identity.PostalCode) != 5 || !isDigits(identity.PostalCode)) {
		return domain.SellerIdentity{}, newValidationError(sellerPostalCodeMessage)
	}
	account, ok := normalizeBankAccount(identity.BankAccount)
	if !ok {
		return domain.SellerIdentity{}, newValidationError(sellerBankAccountMessage)
	}
	identity.BankAccount = account
	if identity.Email != nil {
		email := *identity.Email
		at := strings.Index(email, "@")
		if at <= 0 || at != strings.LastIndex(email, "@") || !strings.Contains(email[at+1:], ".") ||
			strings.ContainsAny(email, " \t") || len(email) > sellerFieldMaxLength {
			return domain.SellerIdentity{}, newValidationError(sellerEmailMessage)
		}
	}
	return identity, nil
}

// normalizeBankAccount formats a Serbian current account as
// "BBB-AAAAAAAAAAAAA-CC" (3-digit bank, 13-digit account, 2 control digits).
// Input may use the dashed short form ("160-12345-67", the middle part padded
// with leading zeros) or the 18 digits without separators. Only the format is
// checked; the control digits are not recomputed.
func normalizeBankAccount(raw string) (string, bool) {
	raw = strings.ReplaceAll(strings.TrimSpace(raw), " ", "")
	parts := strings.Split(raw, "-")
	var bank, account, control string
	switch len(parts) {
	case 1:
		if len(raw) != 18 {
			return "", false
		}
		bank, account, control = raw[:3], raw[3:16], raw[16:]
	case 3:
		bank, account, control = parts[0], parts[1], parts[2]
		if len(account) == 0 || len(account) > 13 {
			return "", false
		}
		account = strings.Repeat("0", 13-len(account)) + account
	default:
		return "", false
	}
	if len(bank) != 3 || len(control) != 2 || !isDigits(bank) || !isDigits(account) || !isDigits(control) {
		return "", false
	}
	return bank + "-" + account + "-" + control, true
}

func cloneSellerIdentity(identity *domain.SellerIdentity) *domain.SellerIdentity {
	if identity == nil {
		return nil
	}
	clone := *identity
	if identity.Email != nil {
		email := *identity.Email
		clone.Email = &email
	}
	return &clone
}

func isDigits(value string) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func isASCIIUpper(value string) bool {
	for _, r := range value {
		if r < 'A' || r > 'Z' {
			return false
		}
	}
	return true
}
