package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

func (f processFixture) addArticle(t *testing.T, id, name, unit string, min *float64) {
	t.Helper()
	ctx := store.ContextWithTenant(context.Background(), store.DemoTenantID)
	if _, err := f.sqlite.UpsertCatalogItem(ctx, domain.CatalogItem{
		ID: id, Code: "C-" + id, Name: name, Unit: unit, Kind: domain.CatalogItemKindArticle, IsActive: true, MinStock: min,
	}, ""); err != nil {
		t.Fatal(err)
	}
}

func decodeInto[T any](t *testing.T, code, want int, body []byte) T {
	t.Helper()
	var out T
	if code != want || json.Unmarshal(body, &out) != nil {
		t.Fatalf("response = %d %s, want %d", code, body, want)
	}
	return out
}

func receiptBody(lines ...string) string {
	return `{"documentRef":"OTP-1","note":"dostava","lines":[` + strings.Join(lines, ",") + `]}`
}

func receiptLine(id string, quantity float64) string {
	return fmt.Sprintf(`{"catalogItemId":%q,"quantity":%v}`, id, quantity)
}

func countLine(id string, quantity float64) string {
	return fmt.Sprintf(`{"catalogItemId":%q,"countedQuantity":%v}`, id, quantity)
}

func TestStockRoutesAuthAndGating(t *testing.T) {
	f := newProcessFixture(t)
	f.addArticle(t, "paper", "Papir", "tabak", nil)

	for _, route := range []struct{ method, path, body string }{
		{http.MethodGet, "/stock", ""},
		{http.MethodGet, "/stock/movements", ""},
		{http.MethodPost, "/stock/receipts", receiptBody(receiptLine("paper", 1))},
		{http.MethodPost, "/stock/counts", `{"lines":[` + countLine("paper", 1) + `]}`},
	} {
		if code, _ := f.do(t, "", route.method, route.path, route.body); code != http.StatusUnauthorized {
			t.Errorf("anonymous %s %s = %d, want 401", route.method, route.path, code)
		}
	}

	// Counts are admin-only; receipts and reads are open to operators.
	if code, _ := f.do(t, f.operator, http.MethodPost, "/stock/counts", `{"lines":[`+countLine("paper", 5)+`]}`); code != http.StatusForbidden {
		t.Fatalf("operator count = %d, want 403", code)
	}
	code, body := f.do(t, f.operator, http.MethodPost, "/stock/receipts", receiptBody(receiptLine("paper", 7.5)))
	result := decodeInto[domain.StockPostingResult](t, code, http.StatusCreated, body)
	if len(result.Movements) != 1 || result.Movements[0].Quantity != 7.5 || result.Movements[0].CreatedBy != "operater" ||
		result.Movements[0].Kind != domain.StockMovementReceipt {
		t.Fatalf("receipt = %+v", result)
	}
	code, body = f.do(t, f.admin, http.MethodPost, "/stock/counts", `{"note":"popis","lines":[`+countLine("paper", 10)+`]}`)
	result = decodeInto[domain.StockPostingResult](t, code, http.StatusCreated, body)
	if len(result.Movements) != 1 || result.Movements[0].Kind != domain.StockMovementAdjustment || result.Movements[0].Quantity != 2.5 {
		t.Fatalf("count = %+v", result)
	}
	// An unchanged count is still 201 with an empty list, never null.
	code, body = f.do(t, f.admin, http.MethodPost, "/stock/counts", `{"lines":[`+countLine("paper", 10)+`]}`)
	if code != http.StatusCreated || !strings.Contains(string(body), `"movements":[]`) && !strings.Contains(string(body), `"movements": []`) {
		t.Fatalf("empty count = %d %s", code, body)
	}

	code, body = f.do(t, f.operator, http.MethodGet, "/stock", "")
	levels := decodeInto[domain.StockLevelList](t, code, http.StatusOK, body)
	if levels.Total != 1 || levels.Items[0].OnHand != 10 || levels.Items[0].Available != 10 {
		t.Fatalf("levels = %+v", levels)
	}
}

func TestStockPostingValidationMessages(t *testing.T) {
	f := newProcessFixture(t)
	f.addArticle(t, "paper", "Papir", "tabak", nil)
	ctx := store.ContextWithTenant(context.Background(), store.DemoTenantID)
	if _, err := f.sqlite.UpsertCatalogItem(ctx, domain.CatalogItem{ID: "svc", Code: "svc", Name: "Usluga", Unit: "kom", Kind: domain.CatalogItemKindService, IsActive: true}, ""); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name, path, body, message string
	}{
		{"unknown article", "/stock/receipts", receiptBody(receiptLine("nope", 1)), "Artikal nije pronađen u katalogu."},
		{"service item", "/stock/receipts", receiptBody(receiptLine("svc", 1)), "Artikal nije pronađen u katalogu."},
		{"zero quantity", "/stock/receipts", receiptBody(receiptLine("paper", 0)), "Količina mora biti veća od nule."},
		{"negative quantity", "/stock/receipts", receiptBody(receiptLine("paper", -3)), "Količina mora biti veća od nule."},
		{"duplicate", "/stock/receipts", receiptBody(receiptLine("paper", 1), receiptLine("paper", 2)), "Artikal se ponavlja."},
		{"empty receipt", "/stock/receipts", `{"lines":[]}`, "Prijem mora imati između 1 i 200 stavki."},
		{"negative count", "/stock/counts", `{"lines":[` + countLine("paper", -1) + `]}`, "Prebrojana količina ne može biti negativna."},
		{"count service", "/stock/counts", `{"lines":[` + countLine("svc", 1) + `]}`, "Artikal nije pronađen u katalogu."},
		{"count duplicate", "/stock/counts", `{"lines":[` + countLine("paper", 1) + `,` + countLine("paper", 2) + `]}`, "Artikal se ponavlja."},
		{"empty count", "/stock/counts", `{}`, "Popis mora imati između 1 i 1000 stavki."},
	}
	for _, tc := range cases {
		code, body := f.do(t, f.admin, http.MethodPost, tc.path, tc.body)
		if code != http.StatusUnprocessableEntity {
			t.Errorf("%s = %d %s, want 422", tc.name, code, body)
			continue
		}
		assertErrorResponse(t, body, tc.message)
	}
	if code, _ := f.do(t, f.admin, http.MethodPost, "/stock/receipts", `{not json`); code != http.StatusBadRequest {
		t.Fatalf("invalid JSON = %d, want 400", code)
	}
}

func TestStockListsPaginateFilterAndStayTenantScoped(t *testing.T) {
	f := newProcessFixture(t)
	for i := 0; i < 3; i++ {
		f.addArticle(t, fmt.Sprintf("a%d", i), fmt.Sprintf("Artikal %d", i), "kom", nil)
	}
	f.addArticle(t, "low", "Nizak", "kom", func() *float64 { v := 5.0; return &v }())
	if code, body := f.do(t, f.admin, http.MethodPost, "/stock/counts", `{"lines":[`+countLine("a0", 3)+`,`+countLine("low", 1)+`]}`); code != http.StatusCreated {
		t.Fatalf("count = %d %s", code, body)
	}

	code, body := f.do(t, f.operator, http.MethodGet, "/stock?limit=2&offset=1", "")
	page := decodeInto[domain.StockLevelList](t, code, http.StatusOK, body)
	if len(page.Items) != 2 || page.Total != 4 {
		t.Fatalf("page = %+v", page)
	}
	// Absurd limits are capped, negative ones fall back to the default.
	for _, query := range []string{"?limit=999999", "?limit=-4&offset=-2"} {
		code, body = f.do(t, f.operator, http.MethodGet, "/stock"+query, "")
		if all := decodeInto[domain.StockLevelList](t, code, http.StatusOK, body); all.Total != 4 {
			t.Fatalf("%s = %+v", query, all)
		}
	}
	code, body = f.do(t, f.operator, http.MethodGet, "/stock?lowOnly=true", "")
	if low := decodeInto[domain.StockLevelList](t, code, http.StatusOK, body); low.Total != 1 || low.Items[0].CatalogItemID != "low" || !low.Items[0].Low {
		t.Fatalf("lowOnly = %+v", low)
	}
	code, body = f.do(t, f.operator, http.MethodGet, "/stock?search=nizak", "")
	if found := decodeInto[domain.StockLevelList](t, code, http.StatusOK, body); found.Total != 1 {
		t.Fatalf("search = %+v", found)
	}

	code, body = f.do(t, f.operator, http.MethodGet, "/stock/movements?catalogItemId=low", "")
	moves := decodeInto[domain.StockMovementList](t, code, http.StatusOK, body)
	if moves.Total != 1 || moves.Items[0].Kind != domain.StockMovementOpening || moves.Items[0].ItemName != "Nizak" {
		t.Fatalf("movements = %+v", moves)
	}
	code, body = f.do(t, f.operator, http.MethodGet, "/stock/movements?limit=1", "")
	if first := decodeInto[domain.StockMovementList](t, code, http.StatusOK, body); len(first.Items) != 1 || first.Total != 2 {
		t.Fatalf("limited movements = %+v", first)
	}

	// Another organization sees nothing and cannot post against these articles.
	code, body = f.do(t, f.otherAdmin, http.MethodGet, "/stock", "")
	if other := decodeInto[domain.StockLevelList](t, code, http.StatusOK, body); other.Total != 0 || other.Items == nil {
		t.Fatalf("other tenant levels = %+v", other)
	}
	code, body = f.do(t, f.otherAdmin, http.MethodGet, "/stock/movements", "")
	if other := decodeInto[domain.StockMovementList](t, code, http.StatusOK, body); other.Total != 0 || other.Items == nil {
		t.Fatalf("other tenant movements = %+v", other)
	}
	if code, _ := f.do(t, f.otherAdmin, http.MethodPost, "/stock/receipts", receiptBody(receiptLine("a0", 1))); code != http.StatusUnprocessableEntity {
		t.Fatalf("cross-tenant receipt = %d, want 422", code)
	}
}

const stockTemplateGraph = `{"nodes":[
	{"id":"paper","kind":"input","label":"Papir","x":0,"y":0,"quantity":10,"catalogItemId":"paper"},
	{"id":"print","kind":"step","label":"Štampa","x":200,"y":0},
	{"id":"waste","kind":"byproduct","label":"Makulatura","x":400,"y":0,"quantity":2,"catalogItemId":"waste"}
],"edges":[{"id":"e1","source":"paper","target":"print"},{"id":"e2","source":"print","target":"waste"}]}`

func TestProcessPutPostsStockAutomatically(t *testing.T) {
	f := newProcessFixture(t)
	f.addArticle(t, "paper", "Papir", "tabak", nil)
	f.addArticle(t, "waste", "Makulatura", "tabak", nil)
	if code, body := f.do(t, f.admin, http.MethodPost, "/stock/counts", `{"lines":[`+countLine("paper", 50)+`]}`); code != http.StatusCreated {
		t.Fatalf("count = %d %s", code, body)
	}

	// Link validation on templates: units are filled, bad links are 422.
	code, body := f.do(t, f.admin, http.MethodPost, "/process-templates", templateBody("Stok", false, strings.Replace(stockTemplateGraph, `"catalogItemId":"waste"`, `"catalogItemId":"missing"`, 1)))
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("unknown link = %d %s", code, body)
	}
	assertErrorResponse(t, body, "Artikal nije pronađen u katalogu.")
	code, body = f.do(t, f.admin, http.MethodPost, "/process-templates", templateBody("Stok", false, strings.Replace(stockTemplateGraph, `"quantity":10,`, `"quantity":10,"unit":"kg",`, 1)))
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("unit mismatch = %d %s", code, body)
	}
	assertErrorResponse(t, body, "Jedinica mora odgovarati jedinici artikla „Papir“.")
	code, body = f.do(t, f.admin, http.MethodPost, "/process-templates", templateBody("Stok", false, stockTemplateGraph))
	template := decodeInto[domain.ProcessTemplate](t, code, http.StatusCreated, body)
	if template.Graph.Nodes[0].Unit != "tabak" {
		t.Fatalf("unit not filled: %+v", template.Graph.Nodes[0])
	}

	code, body = f.do(t, f.operator, http.MethodPost, "/work-orders/"+f.orderID+"/process", `{"templateId":"`+template.ID+`"}`)
	process := decodeProcess(t, code, http.StatusCreated, body)
	code, body = f.do(t, f.operator, http.MethodGet, "/stock", "")
	levels := decodeInto[domain.StockLevelList](t, code, http.StatusOK, body)
	for _, level := range levels.Items {
		if level.CatalogItemID == "paper" && (level.Reserved != 10 || level.Available != 40) {
			t.Fatalf("paper level = %+v", level)
		}
	}

	// An operator completing the step posts consumption and production.
	for i := range process.Graph.Nodes {
		if process.Graph.Nodes[i].ID == "print" {
			process.Graph.Nodes[i].Status = domain.ProcessStepDone
		}
	}
	raw, _ := json.Marshal(domain.WorkOrderProcessInput{Graph: process.Graph})
	if code, body := f.do(t, f.operator, http.MethodPut, "/work-orders/"+f.orderID+"/process", string(raw)); code != http.StatusOK {
		t.Fatalf("put = %d %s", code, body)
	}
	code, body = f.do(t, f.operator, http.MethodGet, "/stock/movements?workOrderId="+f.orderID, "")
	moves := decodeInto[domain.StockMovementList](t, code, http.StatusOK, body)
	if moves.Total != 2 {
		t.Fatalf("order movements = %+v", moves)
	}
	for _, m := range moves.Items {
		if m.WorkOrderNumber == nil || m.ProcessNodeID == nil || m.CreatedBy != "operater" {
			t.Fatalf("movement = %+v", m)
		}
	}
	// Same PUT again is idempotent.
	f.do(t, f.operator, http.MethodPut, "/work-orders/"+f.orderID+"/process", string(raw))
	code, body = f.do(t, f.operator, http.MethodGet, "/stock/movements?workOrderId="+f.orderID, "")
	if again := decodeInto[domain.StockMovementList](t, code, http.StatusOK, body); again.Total != 2 {
		t.Fatalf("repeat PUT posted movements: %+v", again)
	}
	code, body = f.do(t, f.operator, http.MethodGet, "/catalog-items/paper", "")
	item := decodeInto[domain.CatalogItem](t, code, http.StatusOK, body)
	if item.StockOnHand == nil || *item.StockOnHand != 40 {
		t.Fatalf("paper stockOnHand = %+v", item.StockOnHand)
	}
}

func TestCatalogStockFields(t *testing.T) {
	f := newProcessFixture(t)
	code, body := f.do(t, f.admin, http.MethodPost, "/catalog-items", `{"code":"P1","name":"Papir","kind":"article","unit":"tabak","isActive":true,"minStock":12}`)
	created := decodeInto[domain.CatalogItem](t, code, http.StatusCreated, body)
	if created.MinStock == nil || *created.MinStock != 12 || created.StockOnHand == nil || *created.StockOnHand != 0 {
		t.Fatalf("created = %+v", created)
	}
	code, body = f.do(t, f.admin, http.MethodPost, "/catalog-items", `{"code":"S1","name":"Usluga","kind":"service","unit":"kom","isActive":true,"minStock":3}`)
	service := decodeInto[domain.CatalogItem](t, code, http.StatusCreated, body)
	if service.MinStock != nil || service.StockOnHand != nil {
		t.Fatalf("service = %+v", service)
	}
	if code, body := f.do(t, f.admin, http.MethodPost, "/catalog-items", `{"code":"P2","name":"Loš","kind":"article","unit":"kom","isActive":true,"minStock":-1}`); code != http.StatusUnprocessableEntity {
		t.Fatalf("negative minStock = %d %s", code, body)
	}

	// Operators can change only the kind; the stored minStock survives it.
	code, body = f.do(t, f.operator, http.MethodPut, "/catalog-items/"+created.ID, `{"name":"Hak","kind":"article","unit":"kom","minStock":999}`)
	updated := decodeInto[domain.CatalogItem](t, code, http.StatusOK, body)
	if updated.MinStock == nil || *updated.MinStock != 12 || updated.Name != "Papir" {
		t.Fatalf("operator update = %+v", updated)
	}

	// Receive stock; the article can no longer be deleted.
	if code, body := f.do(t, f.operator, http.MethodPost, "/stock/receipts", receiptBody(receiptLine(created.ID, 4))); code != http.StatusCreated {
		t.Fatalf("receipt = %d %s", code, body)
	}
	code, body = f.do(t, f.admin, http.MethodGet, "/catalog-items?kind=article", "")
	list := decodeInto[struct {
		Items []domain.CatalogItem `json:"items"`
	}](t, code, http.StatusOK, body)
	if len(list.Items) != 1 || list.Items[0].StockOnHand == nil || *list.Items[0].StockOnHand != 4 {
		t.Fatalf("list = %+v", list)
	}
	code, body = f.do(t, f.admin, http.MethodDelete, "/catalog-items/"+created.ID, "")
	if code != http.StatusConflict {
		t.Fatalf("delete with movements = %d %s, want 409", code, body)
	}
	assertErrorResponse(t, body, "Artikal ima promet u magacinu i ne može se obrisati.")

	// Bulk cleanup leaves articles with movements alone (no prices -> in scope otherwise).
	code, body = f.do(t, f.admin, http.MethodGet, "/catalog-items/cleanup?kind=article&missing=both", "")
	preview := decodeInto[struct {
		Total int `json:"total"`
	}](t, code, http.StatusOK, body)
	if preview.Total != 0 {
		t.Fatalf("cleanup preview = %s", body)
	}
	code, body = f.do(t, f.admin, http.MethodPost, "/catalog-items/cleanup?kind=article&missing=both", "")
	if deleted := decodeInto[map[string]int](t, code, http.StatusOK, body); deleted["deleted"] != 0 {
		t.Fatalf("cleanup deleted = %v", deleted)
	}
}
