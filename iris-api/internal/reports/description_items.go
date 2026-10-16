package reports

import (
	"regexp"
	"strings"
)

// Operators often type a whole product list into the free-text "opis posla"
// ("ČOKO VANILLA 20 KOM - MANGO 20 KOM - ...") instead of adding stavke. The
// printout lays such a description out one entry per line, in columns.
//
// Mirrors apps/web/src/shared/utils/description-items.ts; keep the two in sync.

var (
	// " - ", " – ", " — ", ";" and "•" separate entries on one line. A bare
	// hyphen without surrounding spaces ("A-4") never splits.
	descriptionEntrySeparator = regexp.MustCompile(`\s+[-–—]\s+|\s*;\s*|\s*•\s*`)
	descriptionLeadingBullet  = regexp.MustCompile(`^[-–—•*]+\s*`)
	// A quantity followed by a unit word ("20 KOM", "6 m2").
	descriptionQuantityWithUnit = regexp.MustCompile(
		`(?i)\d+(?:[.,]\d+)?\s*(?:komada|kom|kpl|kompleta|kompl|paketa|pak|seta|set|m2|m²)\.?(?:[^\p{L}\d]|$)`,
	)
)

func stripDescriptionBullet(value string) string {
	return strings.TrimSpace(descriptionLeadingBullet.ReplaceAllString(value, ""))
}

// splitDescriptionEntries splits a free-text description into its entries.
// Line breaks always separate entries; within a line, " - " / ";" / "•" only
// split when at least two of the resulting pieces carry a quantity with a unit,
// so an ordinary sentence like "Vizit karte - mat plastifikacija" stays whole.
func splitDescriptionEntries(text string) []string {
	var entries []string
	for _, rawLine := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		line := stripDescriptionBullet(rawLine)
		if line == "" {
			continue
		}
		var pieces []string
		quantified := 0
		for _, piece := range descriptionEntrySeparator.Split(line, -1) {
			piece = stripDescriptionBullet(piece)
			if piece == "" {
				continue
			}
			pieces = append(pieces, piece)
			if descriptionQuantityWithUnit.MatchString(piece) {
				quantified++
			}
		}
		if len(pieces) >= 2 && quantified >= 2 {
			entries = append(entries, pieces...)
		} else {
			entries = append(entries, line)
		}
	}
	return entries
}

// printDescriptionColumns is the column count for the printed opis posla: a
// long product list is set in columns so it fits the fixed-height panel at a
// legible size.
func printDescriptionColumns(entryCount int) int {
	switch {
	case entryCount >= 12:
		return 3
	case entryCount >= 6:
		return 2
	default:
		return 1
	}
}
