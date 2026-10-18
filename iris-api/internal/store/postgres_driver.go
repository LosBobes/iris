package store

import (
	"context"
	"database/sql"
	"database/sql/driver"

	"github.com/jackc/pgx/v5/stdlib"
)

// postgresDriverName is the database/sql driver the Postgres store opens. It is
// pgx wrapped in a thin layer that runs every statement through
// translateToPostgres on its way down.
//
// Translating in the driver rather than at the ~97 call sites is what keeps a
// single set of queries serving both engines: store code, helper functions and
// migrations all keep their SQLite-dialect SQL and stay unaware of the port.
// Rows, statements and transactions are handed back from pgx untouched, so
// column type information (and therefore NUMERIC -> float64 scanning) behaves
// exactly as it would on plain pgx.
const postgresDriverName = "iris-postgres"

func init() {
	sql.Register(postgresDriverName, translatingDriver{base: stdlib.GetDefaultDriver()})
}

type translatingDriver struct {
	base driver.Driver
}

func (d translatingDriver) Open(name string) (driver.Conn, error) {
	conn, err := d.base.Open(name)
	if err != nil {
		return nil, err
	}
	return translatingConn{base: conn}, nil
}

// translatingConn delegates everything to the pgx connection, rewriting the
// statement text first. Each optional database/sql interface is implemented by
// asserting on the wrapped connection, so a pgx release that adds or drops one
// degrades to the standard fallback path instead of breaking the build.
type translatingConn struct {
	base driver.Conn
}

var (
	_ driver.Conn               = translatingConn{}
	_ driver.ConnPrepareContext = translatingConn{}
	_ driver.ConnBeginTx        = translatingConn{}
	_ driver.QueryerContext     = translatingConn{}
	_ driver.ExecerContext      = translatingConn{}
	_ driver.Pinger             = translatingConn{}
	_ driver.SessionResetter    = translatingConn{}
	_ driver.Validator          = translatingConn{}
	_ driver.NamedValueChecker  = translatingConn{}
)

func (c translatingConn) Prepare(query string) (driver.Stmt, error) {
	return c.base.Prepare(translateToPostgres(query))
}

func (c translatingConn) Close() error { return c.base.Close() }

func (c translatingConn) Begin() (driver.Tx, error) { return c.base.Begin() }

func (c translatingConn) PrepareContext(ctx context.Context, query string) (driver.Stmt, error) {
	preparer, ok := c.base.(driver.ConnPrepareContext)
	if !ok {
		return c.Prepare(query)
	}
	return preparer.PrepareContext(ctx, translateToPostgres(query))
}

func (c translatingConn) BeginTx(ctx context.Context, opts driver.TxOptions) (driver.Tx, error) {
	beginner, ok := c.base.(driver.ConnBeginTx)
	if !ok {
		return c.base.Begin()
	}
	return beginner.BeginTx(ctx, opts)
}

func (c translatingConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	queryer, ok := c.base.(driver.QueryerContext)
	if !ok {
		// database/sql falls back to PrepareContext, which translates too.
		return nil, driver.ErrSkip
	}
	return queryer.QueryContext(ctx, translateToPostgres(query), args)
}

func (c translatingConn) ExecContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	execer, ok := c.base.(driver.ExecerContext)
	if !ok {
		return nil, driver.ErrSkip
	}
	return execer.ExecContext(ctx, translateToPostgres(query), args)
}

func (c translatingConn) Ping(ctx context.Context) error {
	pinger, ok := c.base.(driver.Pinger)
	if !ok {
		return nil
	}
	return pinger.Ping(ctx)
}

func (c translatingConn) ResetSession(ctx context.Context) error {
	resetter, ok := c.base.(driver.SessionResetter)
	if !ok {
		return nil
	}
	return resetter.ResetSession(ctx)
}

func (c translatingConn) IsValid() bool {
	validator, ok := c.base.(driver.Validator)
	if !ok {
		return true
	}
	return validator.IsValid()
}

// CheckNamedValue delegates to pgx so its argument conversion (in particular
// for NUMERIC money columns) keeps working through the wrapper. Without this,
// database/sql would apply its own default conversion instead.
func (c translatingConn) CheckNamedValue(value *driver.NamedValue) error {
	checker, ok := c.base.(driver.NamedValueChecker)
	if !ok {
		return driver.ErrSkip
	}
	return checker.CheckNamedValue(value)
}
