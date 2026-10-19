package domain

// Material needs by week ("Potrebe materijala", D-028): the input material the
// published plans' kept horizon will consume, week by week, against the
// warehouse stock. A read-only report; purchase orders and suppliers are out of
// scope.

const (
	// MaxMaterialNeedsWeeks caps the report window (calendar weeks touched).
	MaxMaterialNeedsWeeks = 8
	// DefaultMaterialNeedsDays is the default window when no published plan
	// projects past the start: four weeks from the start date.
	DefaultMaterialNeedsDays = 28
)

// MaterialNeedsWeek is one column of the report: a calendar week (Monday to
// Sunday) clipped to the requested window, both dates inclusive.
type MaterialNeedsWeek struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// MaterialNeedsItem is one material: a catalog article (CatalogItemID set,
// with its stock figures) or an unlinked input listed by name and unit (no
// stock figures). Weeks[i] is the quantity the steps planned in week i
// consume (an input counts in the week of its consuming step's first planned
// block), Cumulative the running total. Unplanned is the quantity of open
// steps with no block in the horizon. ShortFromWeek is the first week whose
// cumulative need exceeds the stock on hand (nil when it never does, or
// without stock figures).
type MaterialNeedsItem struct {
	CatalogItemID *string   `json:"catalogItemId"`
	Name          string    `json:"name"`
	Unit          string    `json:"unit"`
	OnHand        *float64  `json:"onHand"`
	Reserved      *float64  `json:"reserved"`
	Available     *float64  `json:"available"`
	Weeks         []float64 `json:"weeks"`
	Cumulative    []float64 `json:"cumulative"`
	Unplanned     float64   `json:"unplanned"`
	ShortFromWeek *int      `json:"shortFromWeek"`
}

// MaterialNeeds is the answer of GET /planning/material-needs: the resolved
// window, its weeks, and the materials (shortages first, then by name).
type MaterialNeeds struct {
	From  string              `json:"from"`
	To    string              `json:"to"`
	Weeks []MaterialNeedsWeek `json:"weeks"`
	Items []MaterialNeedsItem `json:"items"`
}
