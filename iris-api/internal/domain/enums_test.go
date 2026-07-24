package domain

import "testing"

func TestIsManagedEnumField(t *testing.T) {
	for _, field := range ManagedEnumFields {
		if !IsManagedEnumField(field) {
			t.Errorf("expected %q to be a managed enum field", field)
		}
	}
	if IsManagedEnumField(EnumField("notAField")) {
		t.Error("expected unknown field to be unmanaged")
	}
}

func TestBuiltinEnumValues(t *testing.T) {
	values := BuiltinEnumValues()
	if len(values) == 0 {
		t.Fatal("expected built-in enum values")
	}

	seen := make(map[string]bool)
	for _, v := range values {
		if !v.IsBuiltin {
			t.Errorf("built-in value %q not flagged IsBuiltin", v.Value)
		}
		if v.ID == "" || v.Field == "" || v.Value == "" || v.Label == "" {
			t.Errorf("built-in value has empty required field: %+v", v)
		}
		if seen[v.ID] {
			t.Errorf("duplicate built-in ID %q", v.ID)
		}
		seen[v.ID] = true
		if !IsManagedEnumField(v.Field) {
			t.Errorf("built-in value references unmanaged field %q", v.Field)
		}
	}
}

func TestIsBuiltinEnumValue(t *testing.T) {
	if !IsBuiltinEnumValue(EnumFieldPriority, "urgent") {
		t.Error("expected 'urgent' to be a built-in priority")
	}
	if IsBuiltinEnumValue(EnumFieldPriority, "customValueAddedByAdmin") {
		t.Error("expected a custom value not to be reported as built-in")
	}
	if IsBuiltinEnumValue(EnumField("notAField"), "pickup") {
		t.Error("expected unknown field to have no built-in values")
	}
}
