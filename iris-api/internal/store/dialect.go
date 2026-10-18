package store

// dialect names the SQL engine a SQLStore is talking to.
//
// The store deliberately keeps this distinction tiny. Statement-level
// differences are handled by translateToPostgres inside the driver (see
// postgres_driver.go), so query code never branches on the dialect. What is left
// here are the few behaviours that are genuinely engine-specific rather than
// dialect-specific: connection setup, and how a backup is taken.
type dialect int

const (
	dialectSQLite dialect = iota
	dialectPostgres
)

// DatabaseEngine names the storage engine this store runs on: "sqlite" or
// "postgres" (shown on the Backoffice's system panel).
func (s *SQLStore) DatabaseEngine() string {
	return s.dialect.String()
}

func (d dialect) String() string {
	if d == dialectPostgres {
		return "postgres"
	}
	return "sqlite"
}
