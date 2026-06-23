package domain

import "strings"

// Serbian firm identifiers.
//
// PIB (poreski identifikacioni broj) is a 9-digit tax ID whose final digit is an
// ISO 7064 MOD 11,10 control digit. This was verified against the migrated
// Čobanović data set (the shop's own PIB and 2544/2556 client PIBs validate).
//
// MB (matični broj) for a legal entity is 8 digits. The migrated data does NOT
// follow any single mod-11 control scheme (the shop's own MB and ~90% of client
// MBs fail every variant), so MB is validated as format only — exactly 8 digits.
// Revisit if the registrar's exact algorithm is ever supplied.

// IsBlank reports whether a trimmed pointer string is empty or nil.
func isBlankPtr(value *string) bool {
	return value == nil || strings.TrimSpace(*value) == ""
}

// ValidatePIB reports whether pib is a syntactically valid 9-digit Serbian tax
// ID with a correct ISO 7064 MOD 11,10 control digit.
func ValidatePIB(pib string) bool {
	pib = strings.TrimSpace(pib)
	if len(pib) != 9 || !isAllDigits(pib) {
		return false
	}
	return mod1110ControlOK(pib)
}

// ValidateMB reports whether mb is exactly 8 digits (Serbian legal-entity
// matični broj). No checksum is enforced — see the package note above.
func ValidateMB(mb string) bool {
	mb = strings.TrimSpace(mb)
	return len(mb) == 8 && isAllDigits(mb)
}

// ValidateCustomerIdentifiers returns a Serbian-language error message when a
// non-empty PIB or MB is malformed, or an empty string when both are valid (or
// absent). Callers decide whether the fields are required.
func ValidateCustomerIdentifiers(pib *string, mb *string) string {
	if !isBlankPtr(pib) && !ValidatePIB(strings.TrimSpace(*pib)) {
		return "PIB mora imati 9 cifara sa ispravnom kontrolnom cifrom."
	}
	if !isBlankPtr(mb) && !ValidateMB(strings.TrimSpace(*mb)) {
		return "Matični broj mora imati tačno 8 cifara."
	}
	return ""
}

func isAllDigits(value string) bool {
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return len(value) > 0
}

// mod1110ControlOK validates the trailing ISO 7064 MOD 11,10 control digit over
// all leading digits of value.
func mod1110ControlOK(value string) bool {
	p := 10
	for i := 0; i < len(value)-1; i++ {
		s := (int(value[i]-'0') + p) % 10
		if s == 0 {
			s = 10
		}
		p = (s * 2) % 11
	}
	control := (11 - p) % 10
	return control == int(value[len(value)-1]-'0')
}
