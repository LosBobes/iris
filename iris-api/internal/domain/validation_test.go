package domain

import "testing"

func TestValidatePIB(t *testing.T) {
	// Valid PIBs taken from the migrated Čobanović data set (the shop's own PIB
	// plus real client PIBs) — all pass the ISO 7064 MOD 11,10 control digit.
	valid := []string{"100197914", "104791823", "100395235", "101952672"}
	for _, pib := range valid {
		if !ValidatePIB(pib) {
			t.Errorf("ValidatePIB(%q) = false, want true", pib)
		}
	}

	invalid := []string{
		"",           // empty
		"12345678",   // 8 digits
		"1234567890", // 10 digits
		"123456789",  // 9 digits, wrong control digit
		"10019791a",  // non-digit
		"100197915",  // off-by-one control digit
	}
	for _, pib := range invalid {
		if ValidatePIB(pib) {
			t.Errorf("ValidatePIB(%q) = true, want false", pib)
		}
	}
}

func TestValidateMB(t *testing.T) {
	// MB is validated as format only (8 digits) — the shop's own MB does not
	// satisfy any mod-11 control scheme, so a checksum would reject real data.
	valid := []string{"53671888", "20240873", "00000000"}
	for _, mb := range valid {
		if !ValidateMB(mb) {
			t.Errorf("ValidateMB(%q) = false, want true", mb)
		}
	}

	invalid := []string{"", "1234567", "123456789", "5367188a"}
	for _, mb := range invalid {
		if ValidateMB(mb) {
			t.Errorf("ValidateMB(%q) = true, want false", mb)
		}
	}
}

func TestValidateCustomerIdentifiers(t *testing.T) {
	pib := "100197914"
	mb := "53671888"
	bad := "123456789"
	short := "1234567"

	cases := []struct {
		name    string
		pib     *string
		mb      *string
		wantErr bool
	}{
		{"both nil", nil, nil, false},
		{"both valid", &pib, &mb, false},
		{"empty strings", strptr(""), strptr("  "), false},
		{"bad pib", &bad, &mb, true},
		{"short mb", &pib, &short, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			msg := ValidateCustomerIdentifiers(tc.pib, tc.mb)
			if (msg != "") != tc.wantErr {
				t.Errorf("ValidateCustomerIdentifiers() = %q, wantErr=%v", msg, tc.wantErr)
			}
		})
	}
}

func strptr(s string) *string { return &s }
