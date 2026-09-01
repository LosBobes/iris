package store

import (
	"fmt"
	"regexp"
	"strings"
)

// This file holds the SQLite -> PostgreSQL statement translator.
//
// The store keeps ONE set of SQL statements, written in the SQLite dialect that
// predates Postgres support. Rather than fork ~3200 lines of query code into a
// second implementation (which would drift the moment anyone touched a query),
// every statement is rewritten on its way to the Postgres driver. The rewrite is
// deliberately narrow: it only covers constructs the store actually uses, and
// each rule below names the call sites it exists for. Anything it does not
// recognise is passed through untouched, so an unportable construct fails loudly
// against Postgres in tests instead of being silently mistranslated.
//
// The rules, in the order they are applied:
//
//   - String literals are masked first, so no rule can corrupt data (a '?' or
//     the word LIKE inside a quoted string must survive verbatim).
//   - INSERT OR IGNORE -> INSERT ... ON CONFLICT DO NOTHING.
//   - GLOB / NOT GLOB -> ~ / !~, converting the glob pattern to a regex.
//   - LIKE -> ILIKE. SQLite's LIKE is case-insensitive for ASCII; Postgres' is
//     case-sensitive, so ILIKE is the faithful mapping, not an embellishment.
//   - COLLATE NOCASE is dropped next to ILIKE (redundant, and Postgres rejects
//     LIKE against a non-deterministic collation) and otherwise becomes the
//     "nocase" collation that postgresSchema creates.
//   - ? placeholders become $1..$N.

var (
	reInsertOrIgnore = regexp.MustCompile(`(?i)\bINSERT\s+OR\s+IGNORE\s+INTO\b`)
	reNotGlob        = regexp.MustCompile(`(?i)\bNOT\s+GLOB\s+` + literalSentinelPattern)
	reGlob           = regexp.MustCompile(`(?i)\bGLOB\s+` + literalSentinelPattern)
	reLike           = regexp.MustCompile(`(?i)\bLIKE\b`)
	reILikeCollate   = regexp.MustCompile(`(?i)\bILIKE(\s+\?)\s+COLLATE\s+NOCASE\b`)
	reCollateNocase  = regexp.MustCompile(`(?i)\bCOLLATE\s+NOCASE\b`)
)

// literalSentinel wraps a masked string literal. NUL cannot appear in the SQL
// the store builds, so it is unambiguous as a marker.
const (
	literalSentinelPattern = "\x00lit([0-9]+)\x00"
)

func literalSentinel(index int) string {
	return fmt.Sprintf("\x00lit%d\x00", index)
}

// translateToPostgres rewrites one canonical (SQLite-dialect) statement into
// PostgreSQL. It is safe to call on DDL and DML alike, and is a no-op for
// statements that use no SQLite-specific construct.
func translateToPostgres(query string) string {
	masked, literals := maskLiterals(query)

	appendOnConflict := false
	if reInsertOrIgnore.MatchString(masked) {
		masked = reInsertOrIgnore.ReplaceAllString(masked, "INSERT INTO")
		appendOnConflict = true
	}

	masked = replaceGlob(masked, literals, reNotGlob, "!~")
	masked = replaceGlob(masked, literals, reGlob, "~")

	masked = reLike.ReplaceAllString(masked, "ILIKE")
	masked = reILikeCollate.ReplaceAllString(masked, "ILIKE$1")
	masked = reCollateNocase.ReplaceAllString(masked, `COLLATE "nocase"`)

	masked = numberPlaceholders(masked)

	if appendOnConflict {
		masked = strings.TrimRight(masked, " \t\r\n;")
		masked += " ON CONFLICT DO NOTHING"
	}

	return unmaskLiterals(masked, literals)
}

// replaceGlob swaps a GLOB operator for its Postgres regex equivalent and
// rewrites the pattern literal it applies to. The pattern is a masked literal,
// so it is converted in place in the literals table.
func replaceGlob(masked string, literals []string, re *regexp.Regexp, operator string) string {
	return re.ReplaceAllStringFunc(masked, func(match string) string {
		groups := re.FindStringSubmatch(match)
		if len(groups) != 2 {
			return match
		}
		var index int
		if _, err := fmt.Sscanf(groups[1], "%d", &index); err != nil || index >= len(literals) {
			return match
		}
		literals[index] = globToRegex(literals[index])
		return operator + " " + literalSentinel(index)
	})
}

// globToRegex converts a SQLite GLOB pattern to a POSIX regular expression.
// GLOB is anchored (it matches the whole string), so the result is anchored too.
// Character classes pass through: GLOB and POSIX regex spell them the same way.
func globToRegex(literal string) string {
	pattern := strings.TrimSuffix(strings.TrimPrefix(literal, "'"), "'")
	pattern = strings.ReplaceAll(pattern, "''", "'")

	var out strings.Builder
	out.WriteString("^")
	for i := 0; i < len(pattern); i++ {
		switch char := pattern[i]; char {
		case '*':
			out.WriteString(".*")
		case '?':
			out.WriteString(".")
		case '[':
			end := strings.IndexByte(pattern[i:], ']')
			if end < 0 {
				out.WriteString(`\[`)
				continue
			}
			out.WriteString(pattern[i : i+end+1])
			i += end
		default:
			if strings.IndexByte(`\.+()|{}^$`, char) >= 0 {
				out.WriteByte('\\')
			}
			out.WriteByte(char)
		}
	}
	out.WriteString("$")

	return "'" + strings.ReplaceAll(out.String(), "'", "''") + "'"
}

// numberPlaceholders converts SQLite's positional '?' into Postgres' $1..$N.
func numberPlaceholders(masked string) string {
	var out strings.Builder
	next := 1
	for i := 0; i < len(masked); i++ {
		if masked[i] == '?' {
			out.WriteString(fmt.Sprintf("$%d", next))
			next++
			continue
		}
		out.WriteByte(masked[i])
	}
	return out.String()
}

// maskLiterals replaces every single-quoted string literal with a sentinel so
// the rewrite rules only ever see SQL syntax, never data. A doubled single
// quote is the shared SQLite/Postgres escape, so it stays inside the literal.
// Double-quoted identifiers are left alone: they are not data, and no rule
// matches inside them.
func maskLiterals(query string) (string, []string) {
	var out strings.Builder
	var literals []string

	for i := 0; i < len(query); i++ {
		if query[i] != '\'' {
			out.WriteByte(query[i])
			continue
		}

		start := i
		i++
		for i < len(query) {
			if query[i] == '\'' {
				if i+1 < len(query) && query[i+1] == '\'' {
					i += 2
					continue
				}
				break
			}
			i++
		}
		if i >= len(query) {
			// Unterminated literal: emit the remainder verbatim rather than
			// inventing a closing quote.
			out.WriteString(query[start:])
			return out.String(), literals
		}

		out.WriteString(literalSentinel(len(literals)))
		literals = append(literals, query[start:i+1])
	}

	return out.String(), literals
}

func unmaskLiterals(masked string, literals []string) string {
	for index, literal := range literals {
		masked = strings.ReplaceAll(masked, literalSentinel(index), literal)
	}
	return masked
}
