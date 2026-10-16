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
