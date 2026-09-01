package store

import "testing"

// The cases below are the statement shapes the store actually issues. Each one
// names the call site it guards so a future query in a new shape is a visible
// gap here rather than a runtime failure against Postgres.
func TestTranslateToPostgres(t *testing.T) {
	tests := []struct {
		name  string
		query string
		want  string
	}{
		{
			name:  "placeholders are numbered left to right",
			query: `SELECT id FROM users WHERE tenant_id = ? AND username = ?`,
			want:  `SELECT id FROM users WHERE tenant_id = $1 AND username = $2`,
		},
		{
			// users_sqlite.go ListUsers, sqlite.go Operators.
			name:  "order by collate nocase uses the nocase collation",
			query: `SELECT id FROM users WHERE tenant_id = ? ORDER BY username COLLATE NOCASE`,
			want:  `SELECT id FROM users WHERE tenant_id = $1 ORDER BY username COLLATE "nocase"`,
		},
		{
			// sqlite.go TenantBySlug: case-insensitive equality, not a pattern match.
			name:  "equality collate nocase uses the nocase collation",
			query: `SELECT id, slug, name FROM tenants WHERE slug = ? COLLATE NOCASE`,
			want:  `SELECT id, slug, name FROM tenants WHERE slug = $1 COLLATE "nocase"`,
		},
		{
			// sqlite.go Customers search. COLLATE NOCASE is dropped because
			// Postgres rejects a pattern match against a non-deterministic
			// collation; ILIKE already carries the case-insensitivity.
			name:  "like with collate nocase becomes a bare ilike",
			query: `SELECT id FROM customers WHERE (name LIKE ? COLLATE NOCASE OR pib LIKE ? OR mb LIKE ?)`,
			want:  `SELECT id FROM customers WHERE (name ILIKE $1 OR pib ILIKE $2 OR mb ILIKE $3)`,
		},
		{
			// sqlite.go buildWorkOrderWhere: bare LIKE must still become ILIKE,
			// because SQLite's LIKE is case-insensitive and Postgres' is not.
			name:  "bare like becomes ilike",
			query: `SELECT payload FROM work_orders WHERE (LOWER(order_number) LIKE ?)`,
			want:  `SELECT payload FROM work_orders WHERE (LOWER(order_number) ILIKE $1)`,
		},
		{
			// sqlite.go EnsureTenant.
			name:  "insert or ignore becomes on conflict do nothing",
			query: `INSERT OR IGNORE INTO tenants(id, slug, name) VALUES (?, ?, ?)`,
			want:  `INSERT INTO tenants(id, slug, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		},
		{
			// migrations.go records each applied version this way.
			name:  "insert or ignore tolerates a trailing semicolon",
			query: `INSERT OR IGNORE INTO schema_migrations(version) VALUES (?);`,
			want:  `INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT DO NOTHING`,
		},
		{
			// sqlite.go nextSequence.
			name:  "not glob becomes a negated regex match",
			query: `SELECT id FROM work_orders WHERE id <> '' AND id NOT GLOB '*[^0-9]*'`,
			want:  `SELECT id FROM work_orders WHERE id <> '' AND id !~ '^.*[^0-9].*$'`,
		},
		{
			name:  "glob becomes a regex match",
			query: `SELECT id FROM work_orders WHERE id GLOB '[0-9]*'`,
			want:  `SELECT id FROM work_orders WHERE id ~ '^[0-9].*$'`,
		},
		{
			// migrations.go idx_catalog_items_name.
			name:  "collate nocase in an index definition is translated",
			query: `CREATE INDEX idx_catalog_items_name ON catalog_items(name COLLATE NOCASE)`,
			want:  `CREATE INDEX idx_catalog_items_name ON catalog_items(name COLLATE "nocase")`,
		},
		{
			// sqlite.go UpsertCustomer and friends already use standard syntax.
			name:  "existing on conflict upserts are untouched apart from placeholders",
			query: `INSERT INTO customers(id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
			want:  `INSERT INTO customers(id, name) VALUES ($1, $2) ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := translateToPostgres(test.query); got != test.want {
				t.Errorf("translateToPostgres()\n got: %s\nwant: %s", got, test.want)
			}
		})
	}
}

// A rewrite rule must never reach inside string data. These are the cases where
// a naive regex would corrupt a value.
func TestTranslateToPostgresLeavesStringLiteralsAlone(t *testing.T) {
	tests := []struct {
		name  string
		query string
		want  string
	}{
		{
			name:  "question mark inside a literal is not a placeholder",
			query: `INSERT INTO app_settings(key, value) VALUES ('prompt', 'Da li ste sigurni?')`,
			want:  `INSERT INTO app_settings(key, value) VALUES ('prompt', 'Da li ste sigurni?')`,
		},
		{
			name:  "sql keywords inside a literal are not rewritten",
			query: `INSERT INTO app_settings(key, value) VALUES ('note', 'LIKE and COLLATE NOCASE')`,
			want:  `INSERT INTO app_settings(key, value) VALUES ('note', 'LIKE and COLLATE NOCASE')`,
		},
		{
			name:  "escaped quotes keep the literal intact",
			query: `INSERT INTO app_settings(key, value) VALUES ('firm', 'O''Brien ? LIKE') , (?, ?)`,
			want:  `INSERT INTO app_settings(key, value) VALUES ('firm', 'O''Brien ? LIKE') , ($1, $2)`,
		},
		{
			// migrations.go seeds the firm name; non-ASCII must survive byte-wise.
			name:  "non-ascii literals survive masking",
			query: `INSERT OR IGNORE INTO app_settings(key, value) VALUES ('firm_name', 'Grafika Čobanović')`,
			want:  `INSERT INTO app_settings(key, value) VALUES ('firm_name', 'Grafika Čobanović') ON CONFLICT DO NOTHING`,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := translateToPostgres(test.query); got != test.want {
				t.Errorf("translateToPostgres()\n got: %s\nwant: %s", got, test.want)
			}
		})
	}
}

func TestGlobToRegex(t *testing.T) {
	tests := []struct {
		glob string
		want string
	}{
		{glob: `'[0-9]*'`, want: `'^[0-9].*$'`},
		{glob: `'*[^0-9]*'`, want: `'^.*[^0-9].*$'`},
		{glob: `'RN-?'`, want: `'^RN-.$'`},
		{glob: `'a.b'`, want: `'^a\.b$'`},
	}

	for _, test := range tests {
		t.Run(test.glob, func(t *testing.T) {
			if got := globToRegex(test.glob); got != test.want {
				t.Errorf("globToRegex(%s) = %s, want %s", test.glob, got, test.want)
			}
		})
	}
}
