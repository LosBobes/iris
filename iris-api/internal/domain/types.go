package domain

type UserRole string

const (
	RoleAdmin UserRole = "admin"
	RoleUser  UserRole = "user"
)

type User struct {
	ID       string   `json:"id"`
	Username string   `json:"username"`
	Role     UserRole `json:"role"`
}

type FixtureUser struct {
	User
	Password string `json:"password"`
}

type WorkOrder struct {
	ID             string  `json:"id"`
	ClientName     string  `json:"clientName"`
	DocumentType   string  `json:"documentType"`
	DeliveryMethod string  `json:"deliveryMethod"`
	IssuedBy       string  `json:"issuedBy"`
	CreatedAt      string  `json:"createdAt"`
	CompletedAt    *string `json:"completedAt"`
	Price          *int    `json:"price"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
	User    *User  `json:"user,omitempty"`
}