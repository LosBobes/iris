package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"testing"
)

// The cleanup endpoint filters on two axes: which kinds are in scope, and which
// price is missing. These tests seed every kind × price-state combination and
// pin down exactly what each filter selects, end to end over HTTP.

// cleanupSeed is one seeded catalog item. Prices are raw JSON so a missing price
// is a real null rather than a zero.
type cleanupSeed struct {
	code     string
	kind     string
	purchase string
	sale     string
}

func cleanupSeeds() []cleanupSeed {
	seeds := make([]cleanupSeed, 0, 8)
	for _, kind := range []string{"service", "article"} {
		prefix := "S"
		if kind == "article" {
			prefix = "A"
		}
		seeds = append(seeds,
			cleanupSeed{code: prefix + "-none", kind: kind, purchase: "null", sale: "null"},
			cleanupSeed{code: prefix + "-purchase-only", kind: kind, purchase: "400", sale: "null"},
			cleanupSeed{code: prefix + "-sale-only", kind: kind, purchase: "null", sale: "1400"},
			cleanupSeed{code: prefix + "-both", kind: kind, purchase: "400", sale: "1400"},
		)
	}
	return seeds
}

// seedCleanupCatalog creates the full matrix through the public create endpoint,
// so the tests exercise the same write path the app uses.
func seedCleanupCatalog(t *testing.T, server *Server, adminToken string) {
	t.Helper()
	for _, seed := range cleanupSeeds() {
		body := fmt.Sprintf(
			`{"code":%q,"name":%q,"kind":%q,"unit":"kom","purchasePrice":%s,"salePrice":%s,"barcode":null,"taxGroup":null,"description":null,"isActive":true}`,
			seed.code, "Stavka "+seed.code, seed.kind, seed.purchase, seed.sale)
		if rec := roleRequest(t, server, adminToken, http.MethodPost, "/catalog-items", body); rec.Code != http.StatusCreated {
			t.Fatalf("create %s = %d (%s)", seed.code, rec.Code, rec.Body.String())
		}
	}
}

// catalogCodes lists the codes currently in the catalog, sorted.
func catalogCodes(t *testing.T, server *Server, adminToken string) []string {
	t.Helper()
	rec := roleRequest(t, server, adminToken, http.MethodGet, "/catalog-items", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("list catalog items = %d (%s)", rec.Code, rec.Body.String())
	}
	var list struct {
		Items []struct {
			Code string `json:"code"`
		} `json:"items"`
		Total int `json:"total"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatalf("decode catalog list: %v", err)
	}
	if list.Total != len(list.Items) {
		t.Fatalf("total = %d but got %d items", list.Total, len(list.Items))
	}
	codes := make([]string, 0, len(list.Items))
	for _, item := range list.Items {
		codes = append(codes, item.Code)
	}
	sort.Strings(codes)
	return codes
}

// survivors returns every seeded code except the deleted ones, sorted.
func survivors(deleted []string) []string {
	gone := map[string]bool{}
	for _, code := range deleted {
		gone[code] = true
	}
	remaining := make([]string, 0, len(cleanupSeeds()))
	for _, seed := range cleanupSeeds() {
		if !gone[seed.code] {
			remaining = append(remaining, seed.code)
		}
	}
	sort.Strings(remaining)
	return remaining
}

func sameCodes(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}

// TestCatalogCleanupFilterMatrix walks every (kinds, missing) combination the UI
// can produce and checks that the preview lists exactly the right items, the
// delete removes exactly those, and nothing else is touched.
func TestCatalogCleanupFilterMatrix(t *testing.T) {
	cases := []struct {
		name  string
		query string
		want  []string
	}{
		{
			name:  "services missing purchase price",
			query: "?kind=service&missing=purchase",
			want:  []string{"S-none", "S-sale-only"},
		},
		{
			name:  "services missing sale price",
			query: "?kind=service&missing=sale",
			want:  []string{"S-none", "S-purchase-only"},
		},
		{
			name:  "services missing both prices",
			query: "?kind=service&missing=both",
			want:  []string{"S-none"},
		},
		{
			name:  "articles missing purchase price",
			query: "?kind=article&missing=purchase",
			want:  []string{"A-none", "A-sale-only"},
		},
		{
			name:  "articles missing sale price",
			query: "?kind=article&missing=sale",
			want:  []string{"A-none", "A-purchase-only"},
		},
		{
			name:  "articles missing both prices",
			query: "?kind=article&missing=both",
			want:  []string{"A-none"},
		},
		{
			name:  "both kinds missing purchase price",
			query: "?kind=service&kind=article&missing=purchase",
			want:  []string{"A-none", "A-sale-only", "S-none", "S-sale-only"},
		},
		{
			name:  "both kinds missing sale price",
			query: "?kind=service&kind=article&missing=sale",
			want:  []string{"A-none", "A-purchase-only", "S-none", "S-purchase-only"},
		},
		{
			name:  "both kinds missing both prices",
			query: "?kind=service&kind=article&missing=both",
			want:  []string{"A-none", "S-none"},
		},
		{
			name:  "a repeated kind is not counted twice",
			query: "?kind=service&kind=service&missing=both",
			want:  []string{"S-none"},
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			server, adminToken, _ := newServerWithRoles(t)
			seedCleanupCatalog(t, server, adminToken)

			// Preview: exactly the items that are about to be deleted.
			previewRec := roleRequest(t, server, adminToken, http.MethodGet, "/catalog-items/cleanup"+testCase.query, "")
			if previewRec.Code != http.StatusOK {
				t.Fatalf("preview = %d (%s)", previewRec.Code, previewRec.Body.String())
			}
			var preview struct {
				Items []struct {
					Code string `json:"code"`
				} `json:"items"`
				Total int `json:"total"`
			}
			if err := json.Unmarshal(previewRec.Body.Bytes(), &preview); err != nil {
				t.Fatalf("decode preview: %v", err)
			}
			previewCodes := make([]string, 0, len(preview.Items))
			for _, item := range preview.Items {
				previewCodes = append(previewCodes, item.Code)
			}
			sort.Strings(previewCodes)
			if !sameCodes(previewCodes, testCase.want) {
				t.Fatalf("preview = %v, want %v", previewCodes, testCase.want)
			}
			if preview.Total != len(testCase.want) {
				t.Fatalf("preview total = %d, want %d", preview.Total, len(testCase.want))
			}

			// Delete: the same set, and the count matches the preview.
			deleteRec := roleRequest(t, server, adminToken, http.MethodPost, "/catalog-items/cleanup"+testCase.query, "")
			if deleteRec.Code != http.StatusOK {
				t.Fatalf("cleanup = %d (%s)", deleteRec.Code, deleteRec.Body.String())
			}
			var result struct {
				Deleted int `json:"deleted"`
			}
			if err := json.Unmarshal(deleteRec.Body.Bytes(), &result); err != nil {
				t.Fatalf("decode cleanup response: %v", err)
			}
			if result.Deleted != len(testCase.want) {
				t.Fatalf("deleted = %d, want %d (%v)", result.Deleted, len(testCase.want), testCase.want)
			}
			if got, want := catalogCodes(t, server, adminToken), survivors(testCase.want); !sameCodes(got, want) {
				t.Fatalf("remaining catalog = %v, want %v", got, want)
			}

			// The preview is now empty and a repeat cleanup deletes nothing.
			repeatRec := roleRequest(t, server, adminToken, http.MethodGet, "/catalog-items/cleanup"+testCase.query, "")
			var repeat struct {
				Total int `json:"total"`
			}
			if err := json.Unmarshal(repeatRec.Body.Bytes(), &repeat); err != nil {
				t.Fatalf("decode repeat preview: %v", err)
			}
			if repeat.Total != 0 {
				t.Fatalf("preview after cleanup = %d, want 0", repeat.Total)
			}
		})
	}
}

// TestCatalogCleanupRejectsInvalidFilters proves a malformed or incomplete
// filter is refused outright rather than falling back to some wider default —
// and that nothing is deleted when it is.
func TestCatalogCleanupRejectsInvalidFilters(t *testing.T) {
	badQueries := []string{
		"",                                     // no parameters at all
		"?missing=both",                        // no kind
		"?kind=service",                        // no missing
		"?kind=everything&missing=both",        // unknown kind
		"?kind=service&missing=anything",       // unknown missing mode
		"?kind=service&kind=nope&missing=both", // one good kind, one bad
		"?kind=&missing=both",                  // blank kind
		"?kind=service&missing=",               // blank missing
	}

	for _, query := range badQueries {
		t.Run("query="+query, func(t *testing.T) {
			server, adminToken, _ := newServerWithRoles(t)
			seedCleanupCatalog(t, server, adminToken)
			before := catalogCodes(t, server, adminToken)

			previewRec := roleRequest(t, server, adminToken, http.MethodGet, "/catalog-items/cleanup"+query, "")
			if previewRec.Code != http.StatusBadRequest {
				t.Errorf("GET preview%s = %d, want %d", query, previewRec.Code, http.StatusBadRequest)
			}
			deleteRec := roleRequest(t, server, adminToken, http.MethodPost, "/catalog-items/cleanup"+query, "")
			if deleteRec.Code != http.StatusBadRequest {
				t.Errorf("POST cleanup%s = %d, want %d", query, deleteRec.Code, http.StatusBadRequest)
			}
			if after := catalogCodes(t, server, adminToken); !sameCodes(after, before) {
				t.Fatalf("catalog changed after a rejected cleanup: %v, want %v", after, before)
			}
		})
	}
}

// TestCatalogCleanupPreviewDoesNotDelete proves the preview is read-only: an
// admin can inspect what a cleanup would remove without removing it.
func TestCatalogCleanupPreviewDoesNotDelete(t *testing.T) {
	server, adminToken, _ := newServerWithRoles(t)
	seedCleanupCatalog(t, server, adminToken)
	before := catalogCodes(t, server, adminToken)

	for range 3 {
		if rec := roleRequest(t, server, adminToken, http.MethodGet,
			"/catalog-items/cleanup?kind=service&kind=article&missing=purchase", ""); rec.Code != http.StatusOK {
			t.Fatalf("preview = %d (%s)", rec.Code, rec.Body.String())
		}
	}
	if after := catalogCodes(t, server, adminToken); !sameCodes(after, before) {
		t.Fatalf("catalog changed after previews: %v, want %v", after, before)
	}
}

// TestCatalogCleanupRejectsNonAdminBeforeDeleting proves the operator gate holds
// on both verbs and that a rejected request leaves the catalog untouched.
func TestCatalogCleanupRejectsNonAdminBeforeDeleting(t *testing.T) {
	server, adminToken, userToken := newServerWithRoles(t)
	seedCleanupCatalog(t, server, adminToken)
	before := catalogCodes(t, server, adminToken)

	query := "?kind=service&kind=article&missing=both"
	for _, method := range []string{http.MethodGet, http.MethodPost} {
		if rec := roleRequest(t, server, userToken, method, "/catalog-items/cleanup"+query, ""); rec.Code != http.StatusForbidden {
			t.Errorf("%s as operator = %d, want %d", method, rec.Code, http.StatusForbidden)
		}
	}
	// Anonymous requests are rejected too.
	for _, method := range []string{http.MethodGet, http.MethodPost} {
		if rec := roleRequest(t, server, "", method, "/catalog-items/cleanup"+query, ""); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s as anonymous = %d, want %d", method, rec.Code, http.StatusUnauthorized)
		}
	}
	if after := catalogCodes(t, server, adminToken); !sameCodes(after, before) {
		t.Fatalf("catalog changed after forbidden requests: %v, want %v", after, before)
	}
}
