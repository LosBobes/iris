package store

// planningMigration (v31, D-026) adds the Planiranje module's tables. v28 is
// intentionally absent from the sequence (it was never released).
//
//   - machine_types / machines: what can be scheduled. Names are unique per
//     organization, case-insensitively. A type with machines cannot be deleted
//     (the store checks); deleting a user or a type removes its qualifications.
//   - worker_qualifications: who may lead a step on a machine type.
//   - attendance_overrides: an admin's explicit present/absent for a user on a
//     local date ("YYYY-MM-DD"); without one, presence follows login_events.
//   - production_plans: at most one draft and one published plan per date; the
//     blocks, issues and late orders are one JSON document (data).
const planningMigration = `
CREATE TABLE IF NOT EXISTS machine_types (
	id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	name TEXT NOT NULL COLLATE NOCASE,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS machines (
	id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	machine_type_id TEXT NOT NULL REFERENCES machine_types(id),
	name TEXT NOT NULL COLLATE NOCASE,
	in_service INTEGER NOT NULL DEFAULT 1,
	note TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_machines_type ON machines(machine_type_id);

CREATE TABLE IF NOT EXISTS worker_qualifications (
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	machine_type_id TEXT NOT NULL REFERENCES machine_types(id) ON DELETE CASCADE,
	PRIMARY KEY (user_id, machine_type_id)
);

CREATE INDEX IF NOT EXISTS idx_worker_qualifications_tenant ON worker_qualifications(tenant_id);

CREATE TABLE IF NOT EXISTS attendance_overrides (
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	date TEXT NOT NULL,
	present INTEGER NOT NULL,
	PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_overrides_tenant_date ON attendance_overrides(tenant_id, date);

CREATE TABLE IF NOT EXISTS production_plans (
	id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
	date TEXT NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
	generated_at TEXT NOT NULL,
	generated_by TEXT NOT NULL DEFAULT '',
	updated_at TEXT NOT NULL,
	updated_by TEXT NOT NULL DEFAULT '',
	published_at TEXT,
	published_by TEXT,
	data TEXT NOT NULL,
	UNIQUE (tenant_id, date, status)
);
`
