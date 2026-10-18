package reports

import (
	"reflect"
	"strings"
	"testing"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

func TestSplitDescriptionEntries(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{
			name: "dash-separated product list",
			in:   "- ČOKO VANILLA 20 KOM - MANGO 20 KOM - SVEĆA DARK AMBER 10 KOM",
			want: []string{"ČOKO VANILLA 20 KOM", "MANGO 20 KOM", "SVEĆA DARK AMBER 10 KOM"},
		},
		{
			name: "sentence with a dash stays whole",
			in:   "Vizit karte - mat plastifikacija",
			want: []string{"Vizit karte - mat plastifikacija"},
		},
		{
			name: "single quantity does not split",
			in:   "Plakat A-2 - 50 kom",
			want: []string{"Plakat A-2 - 50 kom"},
		},
		{
			name: "line breaks, bullets and blank lines",
			in:   "- Mango 20 kom\n\n• Kokos 10 kom\r\nCenovnik",
			want: []string{"Mango 20 kom", "Kokos 10 kom", "Cenovnik"},
		},
		{
			name: "semicolons",
			in:   "Mango 20 kom; Kokos 10 kom",
			want: []string{"Mango 20 kom", "Kokos 10 kom"},
		},
		{
			name: "dash without trailing space and sentence end after a quantity",
			in:   "- Mango 20 kom. -Thermo gel 20 kom. Nalepnice: - Kokos 10 kom.",
			want: []string{"Mango 20 kom", "Thermo gel 20 kom", "Nalepnice:", "Kokos 10 kom"},
		},
		{
			name: "sentence with one quantity stays whole",
			in:   "Vizitkarte 500 kom. Mat plastifikacija",
			want: []string{"Vizitkarte 500 kom. Mat plastifikacija"},
		},
		{name: "empty", in: "  ", want: nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := splitDescriptionEntries(tc.in); !reflect.DeepEqual(got, tc.want) {
				t.Errorf("splitDescriptionEntries(%q) = %#v, want %#v", tc.in, got, tc.want)
			}
		})
	}
}

func TestSplitDescriptionEntriesRealOrientOrder(t *testing.T) {
	entries := splitDescriptionEntries("- Čoko vanilla 20 kom. - Mango 20 kom. - Narandža 20 kom. - Anticelulit 20 kom. - Sport 40 kom. - Grožđe 20 kom. - Bergamot harmoni 20 kom. - Limunska trava 20 kom. Nalepnice za proizvode: - Čoko dream 20 kom. -Thermo gel 20 kom. - Hijaluronski serum 20 kom. - Piling lice 10 kom. - Krema za masažu lica 10 kom. - Krema Grožđe 10 kom. - Krema Kokos 10 kom. - Krema Limunska trava 10 kom. - Avokado buter 20 kom. - Serum good bay cellulit 10 kom. - Serum za strije 10 kom. -Sveća Kokos 10 kom. - Sveća Grožđe 10 kom. - Sveća Narandža 10 kom. - Sveća Dark Amber 10 kom. - Sveća Winter 10 kom.")
	if len(entries) != 25 {
		t.Fatalf("expected 25 entries, got %d: %#v", len(entries), entries)
	}
	if entries[8] != "Nalepnice za proizvode:" || entries[10] != "Thermo gel 20 kom" || entries[24] != "Sveća Winter 10 kom" {
		t.Errorf("unexpected entries: %#v", entries)
	}
}

func TestPrintDescriptionColumns(t *testing.T) {
	for count, want := range map[int]int{1: 1, 5: 1, 6: 2, 11: 2, 12: 3, 30: 3} {
		if got := printDescriptionColumns(count); got != want {
			t.Errorf("printDescriptionColumns(%d) = %d, want %d", count, got, want)
		}
	}
}

func TestBuildPrintDescriptionLinesSplitsProductList(t *testing.T) {
	order := domain.WorkOrder{JobDescription: "mango 20 kom - kokos 10 kom"}
	want := []string{"MANGO 20 KOM", "KOKOS 10 KOM"}
	if got := buildPrintDescriptionLines(order); !reflect.DeepEqual(got, want) {
		t.Errorf("buildPrintDescriptionLines = %#v, want %#v", got, want)
	}
}

func TestRenderWorkOrderHTMLSetsDescriptionColumns(t *testing.T) {
	order := domain.WorkOrder{
		OrderNumber:    "RN-1",
		JobDescription: "a 1 kom - b 1 kom - c 1 kom - d 1 kom - e 1 kom - f 1 kom",
	}
	html, err := RenderWorkOrderHTML(order, PrintContext{}, domain.OrganizationSettings{})
	if err != nil {
		t.Fatalf("RenderWorkOrderHTML: %v", err)
	}
	if !strings.Contains(html, `work-order-print-description-columns" style="column-count: 2"`) {
		t.Errorf("expected a two-column opis posla in the rendered sheet")
	}
}
