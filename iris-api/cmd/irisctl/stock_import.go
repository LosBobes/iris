package main

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"strconv"
	"strings"

	"github.com/LosBobes/iris/iris-api/internal/domain"
	"github.com/LosBobes/iris/iris-api/internal/store"
)

// stockImportUser is the author recorded on movements posted by import-stock.
const stockImportUser = "irisctl"

// stockCSVLine is one parsed row of a stock CSV (code, quantity[, note]).
type stockCSVLine struct {
	Row      int // 1-based file row, header included
	Code     string
	Quantity float64
	Note     string
}

// readStockCSV reads a stock file from disk.
func readStockCSV(path string) ([]stockCSVLine, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("otvaranje %s: %w", path, err)
	}
	lines, err := parseStockCSV(raw)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return lines, nil
}

// parseStockCSV parses "code,quantity[,note]" content. The delimiter is a
// semicolon when the header line contains one, else a comma; quantities accept
// a decimal comma ("1,5") and thousands separators ("1.250,5").
func parseStockCSV(raw []byte) ([]stockCSVLine, error) {
	raw = bytes.TrimPrefix(raw, []byte("\xef\xbb\xbf"))
	firstLine := raw
	if i := bytes.IndexByte(raw, '\n'); i >= 0 {
		firstLine = raw[:i]
	}
	reader := csv.NewReader(bytes.NewReader(raw))
	reader.Comma = ','
	if bytes.IndexByte(firstLine, ';') >= 0 {
		reader.Comma = ';'
	}
	reader.TrimLeadingSpace = true
	reader.FieldsPerRecord = -1
	var records [][]string
	var rowNumbers []int // 1-based file line of each record (blank lines are skipped by the reader)
	for {
		record, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("čitanje CSV: %w", err)
		}
		line, _ := reader.FieldPos(0)
		records = append(records, record)
		rowNumbers = append(rowNumbers, line)
	}
	if len(records) == 0 {
		return nil, fmt.Errorf("CSV nema header red")
	}
	header := map[string]int{}
	for index, name := range records[0] {
		header[strings.ToLower(strings.TrimSpace(name))] = index
	}
	codeCol, hasCode := header["code"]
	quantityCol, hasQuantity := header["quantity"]
	if !hasCode || !hasQuantity {
		return nil, fmt.Errorf("CSV mora imati kolone code i quantity")
	}
	noteCol, hasNote := header["note"]

	cell := func(record []string, column int) string {
		if column < len(record) {
			return strings.TrimSpace(record[column])
		}
		return ""
	}
	lines := make([]stockCSVLine, 0, len(records)-1)
	seen := map[string]int{}
	for index, record := range records[1:] {
		row := rowNumbers[index+1]
		code := cell(record, codeCol)
		if code == "" && cell(record, quantityCol) == "" {
			continue // blank line
		}
		if code == "" {
			return nil, fmt.Errorf("red %d: code je obavezan", row)
		}
		quantity, err := parseStockQuantity(cell(record, quantityCol))
		if err != nil {
			return nil, fmt.Errorf("red %d: %w", row, err)
		}
		key := strings.ToLower(code)
		if first, dup := seen[key]; dup {
			return nil, fmt.Errorf("red %d: šifra %q se ponavlja (red %d)", row, code, first)
		}
		seen[key] = row
		line := stockCSVLine{Row: row, Code: code, Quantity: quantity}
		if hasNote {
			line.Note = cell(record, noteCol)
		}
		lines = append(lines, line)
	}
	return lines, nil
}

// parseStockQuantity parses a non-negative quantity with either decimal
// separator. When both "." and "," appear, the right-most one is the decimal
// separator and the other groups thousands.
func parseStockQuantity(value string) (float64, error) {
	value = strings.ReplaceAll(strings.TrimSpace(value), " ", "")
	if value == "" {
		return 0, fmt.Errorf("quantity je obavezan")
	}
	lastDot, lastComma := strings.LastIndex(value, "."), strings.LastIndex(value, ",")
	switch {
	case lastDot >= 0 && lastComma >= 0:
		if lastComma > lastDot {
			value = strings.ReplaceAll(value, ".", "")
			value = strings.Replace(value, ",", ".", 1)
		} else {
			value = strings.ReplaceAll(value, ",", "")
		}
	case lastComma >= 0:
		if strings.Count(value, ",") > 1 {
			return 0, fmt.Errorf("quantity %q nije broj", value)
		}
		value = strings.Replace(value, ",", ".", 1)
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
		return 0, fmt.Errorf("quantity %q nije broj", value)
	}
	if parsed < 0 {
		return 0, fmt.Errorf("quantity ne može biti negativan")
	}
	return parsed, nil
}

// stockImportRow is one CSV row matched against the catalog.
type stockImportRow struct {
	Line    stockCSVLine
	Article domain.CatalogItem
}

// matchStockImport splits CSV lines into rows with a known article (matched by
// code, case-insensitive) and the codes the catalog does not have.
func matchStockImport(lines []stockCSVLine, articles []domain.CatalogItem) (known []stockImportRow, unknown []string) {
	byCode := make(map[string]domain.CatalogItem, len(articles))
	for _, article := range articles {
		if article.Kind == domain.CatalogItemKindArticle {
			byCode[strings.ToLower(strings.TrimSpace(article.Code))] = article
		}
	}
	for _, line := range lines {
		article, ok := byCode[strings.ToLower(line.Code)]
		if !ok {
			unknown = append(unknown, line.Code)
			continue
		}
		known = append(known, stockImportRow{Line: line, Article: article})
	}
	return known, unknown
}

// importStock reads the CSV and either prints what a count would post
// (apply=false, nothing is written) or posts it as a stock count by "irisctl".
func importStock(ctx context.Context, sqliteStore *store.SQLStore, path string, apply bool) (string, error) {
	lines, err := readStockCSV(path)
	if err != nil {
		return "", err
	}
	catalog, err := sqliteStore.CatalogItems(ctx, store.CatalogItemQuery{Kind: domain.CatalogItemKindArticle})
	if err != nil {
		return "", err
	}
	known, unknown := matchStockImport(lines, catalog.Items)

	var report strings.Builder
	fmt.Fprintf(&report, "CSV: %d redova, %d poznatih artikala, %d nepoznatih šifara.\n", len(lines), len(known), len(unknown))
	countLines := make([]domain.StockCountLine, 0, len(known))
	notes := make([]string, 0)
	for _, row := range known {
		countLines = append(countLines, domain.StockCountLine{CatalogItemID: row.Article.ID, CountedQuantity: row.Line.Quantity})
		onHand := 0.0
		if row.Article.StockOnHand != nil {
			onHand = *row.Article.StockOnHand
		}
		delta := row.Line.Quantity - onHand
		if math.Abs(delta) < domain.StockEpsilon {
			fmt.Fprintf(&report, "  %s (%s): %g %s, bez promene\n", row.Article.Code, row.Article.Name, onHand, row.Article.Unit)
			continue
		}
		fmt.Fprintf(&report, "  %s (%s): %g -> %g %s (%+g)\n", row.Article.Code, row.Article.Name, onHand, row.Line.Quantity, row.Article.Unit, delta)
		if row.Line.Note != "" {
			notes = append(notes, fmt.Sprintf("%s: %s", row.Article.Code, row.Line.Note))
		}
	}
	for _, code := range unknown {
		fmt.Fprintf(&report, "  NEPOZNATA ŠIFRA: %s\n", code)
	}
	if !apply {
		report.WriteString("Dry-run završen. Baza nije promenjena.\n")
		return report.String(), nil
	}
	if len(countLines) == 0 {
		report.WriteString("Nema artikala za upis.\n")
		return report.String(), nil
	}
	note := "Uvoz stanja (irisctl)"
	if len(notes) > 0 {
		note = truncateRunes(note+"; "+strings.Join(notes, "; "), domain.MaxStockText)
	}
	for start := 0; start < len(countLines); start += domain.MaxStockCountLines {
		end := min(start+domain.MaxStockCountLines, len(countLines))
		result, err := sqliteStore.PostStockCount(ctx, domain.StockCountInput{Note: note, Lines: countLines[start:end]}, stockImportUser)
		if err != nil {
			return "", err
		}
		fmt.Fprintf(&report, "Upisano kretanja: %d.\n", len(result.Movements))
	}
	if len(unknown) > 0 {
		fmt.Fprintf(&report, "Upozorenje: %d šifara nije pronađeno u katalogu i nisu uvezene.\n", len(unknown))
	}
	return report.String(), nil
}

func truncateRunes(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}
