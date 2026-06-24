package domain

// EnumField identifies a work-order picklist whose values can be extended by an
// administrator. The built-in values stay defined in code (and remain valid for
// existing data); admins may only add, edit, or delete their own custom values.
type EnumField string

const (
	EnumFieldDeliveryMethod      EnumField = "deliveryMethod"
	EnumFieldPostagePaymentType  EnumField = "postagePaymentType"
	EnumFieldBillingDocumentType EnumField = "billingDocumentType"
	EnumFieldPriority            EnumField = "priority"
	EnumFieldInvoiceUnit         EnumField = "invoiceUnit"
)

// ManagedEnumFields lists every field that exposes admin-managed values.
var ManagedEnumFields = []EnumField{
	EnumFieldDeliveryMethod,
	EnumFieldPostagePaymentType,
	EnumFieldBillingDocumentType,
	EnumFieldPriority,
	EnumFieldInvoiceUnit,
}

// IsManagedEnumField reports whether the field supports custom values.
func IsManagedEnumField(field EnumField) bool {
	for _, candidate := range ManagedEnumFields {
		if candidate == field {
			return true
		}
	}
	return false
}

// EnumValue is one selectable option for a managed field. Built-in options are
// flagged with IsBuiltin and cannot be edited or deleted.
type EnumValue struct {
	ID        string    `json:"id"`
	Field     EnumField `json:"field"`
	Value     string    `json:"value"`
	Label     string    `json:"label"`
	SortOrder int       `json:"sortOrder"`
	IsBuiltin bool      `json:"isBuiltin"`
	CreatedAt string    `json:"createdAt,omitempty"`
	UpdatedAt string    `json:"updatedAt,omitempty"`
}

// EnumValueInput is the payload an admin submits when creating or updating a
// custom enum value.
type EnumValueInput struct {
	Field     EnumField `json:"field"`
	Value     string    `json:"value"`
	Label     string    `json:"label"`
	SortOrder int       `json:"sortOrder"`
}

// builtinEnumValues holds the read-only options shipped with the application.
// Labels mirror the Serbian labels rendered by the web client.
var builtinEnumValues = map[EnumField][]EnumValue{
	EnumFieldDeliveryMethod: {
		{Value: "pickup", Label: "Lično preuzimanje"},
		{Value: "postExpress", Label: "Post Express"},
		{Value: "cityExpress", Label: "City Express"},
		{Value: "fieldVisit", Label: "Terenski obilazak"},
	},
	EnumFieldPostagePaymentType: {
		{Value: "cod", Label: "Poštarina pouzećem"},
		{Value: "ourAccount", Label: "Poštarina na naš račun"},
		{Value: "advance", Label: "Avans poštarina"},
		{Value: "viaInvoice", Label: "Poštarina preko fakture"},
	},
	EnumFieldBillingDocumentType: {
		{Value: "invoice", Label: "Faktura"},
		{Value: "cashCollection", Label: "Gotovinski račun"},
		{Value: "proforma", Label: "Profaktura"},
	},
	EnumFieldPriority: {
		{Value: "low", Label: "Nizak"},
		{Value: "normal", Label: "Normalan"},
		{Value: "high", Label: "Visok"},
		{Value: "urgent", Label: "Hitno"},
	},
	EnumFieldInvoiceUnit: {
		{Value: "kom", Label: "Kom"},
		{Value: "m2", Label: "m²"},
		{Value: "set", Label: "Set"},
	},
}

// BuiltinEnumValues returns the read-only options for every managed field, with
// IsBuiltin and a stable sort order populated.
func BuiltinEnumValues() []EnumValue {
	out := make([]EnumValue, 0, 16)
	for _, field := range ManagedEnumFields {
		for index, value := range builtinEnumValues[field] {
			out = append(out, EnumValue{
				ID:        "builtin:" + string(field) + ":" + value.Value,
				Field:     field,
				Value:     value.Value,
				Label:     value.Label,
				SortOrder: index,
				IsBuiltin: true,
			})
		}
	}
	return out
}

// IsBuiltinEnumValue reports whether value is one of the locked defaults for the
// given field.
func IsBuiltinEnumValue(field EnumField, value string) bool {
	for _, candidate := range builtinEnumValues[field] {
		if candidate.Value == value {
			return true
		}
	}
	return false
}
