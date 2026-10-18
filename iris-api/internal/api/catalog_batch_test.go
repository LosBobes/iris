package api

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

func createCatalogItemFor(t *testing.T, f processFixture, token, code string) string {
	t.Helper()
	body := `{"code":"` + code + `","name":"Stavka ` + code + `","kind":"article","unit":"kom","purchasePrice":null,"salePrice":100,"barcode":null,"taxGroup":"A","description":null,"isActive":true}`
	status, raw := f.do(t, token, http.MethodPost, "/catalog-items", body)
	var item domain.CatalogItem
	if status != http.StatusCreated || json.Unmarshal(raw, &item) != nil {
		t.Fatalf("create %s = %d %s", code, status, raw)
	}
	return item.ID
}

func listCatalogByIDs(t *testing.T, f processFixture, token, ids string) []string {
	t.Helper()
	status, raw := f.do(t, token, http.MethodGet, "/catalog-items?ids="+ids, "")
	var list store.CatalogItemListResult
	if status != http.StatusOK || json.Unmarshal(raw, &list) != nil {
		t.Fatalf("batch lookup = %d %s", status, raw)
	}
	if list.Total != len(list.Items) {
		t.Fatalf("total = %d, items = %d", list.Total, len(list.Items))
	}
	got := make([]string, 0, len(list.Items))
	for _, item := range list.Items {
		got = append(got, item.ID)
	}
	sort.Strings(got)
	return got
}

func TestCatalogItemsBatchLookupByIDs(t *testing.T) {
	f := newModuleFixture(t, false)
	a := createCatalogItemFor(t, f, f.admin, "A-1")
	b := createCatalogItemFor(t, f, f.admin, "A-2")
	createCatalogItemFor(t, f, f.admin, "A-3")
	foreign := createCatalogItemFor(t, f, f.otherAdmin, "X-1")

	want := []string{a, b}
	sort.Strings(want)
	// Duplicates, blanks and an unknown id are ignored; the other tenant's id is
	// never returned.
	got := listCatalogByIDs(t, f, f.operator, strings.Join([]string{a, b, a, "", "missing", foreign}, ","))
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("batch ids = %v, want %v", got, want)
	}
	// The other tenant sees only its own item even when asking for ours.
	if got := listCatalogByIDs(t, f, f.otherAdmin, a+","+foreign); len(got) != 1 || got[0] != foreign {
		t.Fatalf("other tenant batch = %v, want [%s]", got, foreign)
	}
	// Only separators: an empty result, not the full catalog.
	if got := listCatalogByIDs(t, f, f.admin, ",,"); len(got) != 0 {
		t.Fatalf("blank ids = %v, want none", got)
	}

	tooMany := make([]string, maxCatalogBatchIDs+1)
	for i := range tooMany {
		tooMany[i] = "id-" + strconv.Itoa(i)
	}
	if status, _ := f.do(t, f.admin, http.MethodGet, "/catalog-items?ids="+strings.Join(tooMany, ","), ""); status != http.StatusUnprocessableEntity {
		t.Fatalf("too many ids = %d, want 422", status)
	}
}
