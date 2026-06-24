package store

import (
	"sort"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
)

// customEnumSet is a fast lookup of admin-created values keyed by field. It is
// used during work-order validation so custom picklist values are accepted
// alongside the built-in defaults.
type customEnumSet map[domain.EnumField]map[string]struct{}

func (c customEnumSet) has(field domain.EnumField, value string) bool {
	if c == nil {
		return false
	}
	values, ok := c[field]
	if !ok {
		return false
	}
	_, ok = values[value]
	return ok
}

// customEnumSetFromValues builds a lookup set from the stored custom values.
func customEnumSetFromValues(values []domain.EnumValue) customEnumSet {
	set := make(customEnumSet)
	for _, value := range values {
		if value.IsBuiltin {
			continue
		}
		if set[value.Field] == nil {
			set[value.Field] = make(map[string]struct{})
		}
		set[value.Field][value.Value] = struct{}{}
	}
	return set
}

// mergeEnumValues returns the built-in defaults followed by the supplied custom
// values, sorted for stable presentation.
func mergeEnumValues(custom []domain.EnumValue) []domain.EnumValue {
	merged := domain.BuiltinEnumValues()
	merged = append(merged, custom...)
	sortEnumValues(merged)
	return merged
}

// sortEnumValues orders values by field (in managed-field order), then built-ins
// before custom values, then by sort order and label.
func sortEnumValues(values []domain.EnumValue) {
	fieldRank := make(map[domain.EnumField]int, len(domain.ManagedEnumFields))
	for index, field := range domain.ManagedEnumFields {
		fieldRank[field] = index
	}
	sort.SliceStable(values, func(i, j int) bool {
		a, b := values[i], values[j]
		if fieldRank[a.Field] != fieldRank[b.Field] {
			return fieldRank[a.Field] < fieldRank[b.Field]
		}
		if a.IsBuiltin != b.IsBuiltin {
			return a.IsBuiltin
		}
		if a.SortOrder != b.SortOrder {
			return a.SortOrder < b.SortOrder
		}
		return a.Label < b.Label
	})
}

// validateEnumValueInput checks an admin-supplied custom value before it is
// stored. Built-in field values are reserved and cannot be redefined.
func validateEnumValueInput(input domain.EnumValueInput) error {
	value := strings.TrimSpace(input.Value)
	label := strings.TrimSpace(input.Label)
	if !domain.IsManagedEnumField(input.Field) || value == "" || label == "" {
		return newValidationError(invalidWorkOrderMessage)
	}
	if domain.IsBuiltinEnumValue(input.Field, value) {
		return newValidationError("Ova vrednost je već ugrađena i ne može se menjati.")
	}
	return nil
}

func normalizeEnumValueInput(input domain.EnumValueInput) domain.EnumValueInput {
	input.Value = strings.TrimSpace(input.Value)
	input.Label = strings.TrimSpace(input.Label)
	return input
}
