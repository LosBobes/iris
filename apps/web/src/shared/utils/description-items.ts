import type { BuiltinInvoiceUnit } from "@/types/work-order";

// Operators often type a whole product list into the free-text "opis posla"
// ("ČOKO VANILLA 20 KOM - MANGO 20 KOM - ...") instead of adding stavke. These
// helpers recognise that shape so the printout can lay it out as a list and the
// form can offer to turn it into real line items.
//
// The segmentation rules are mirrored in the Go PDF renderer
// (iris-api/internal/reports/description_items.go); keep the two in sync.

// " - ", " – ", " — ", ";" and "•" separate entries on one line. A bare hyphen
// without surrounding spaces ("A-4", "2-strano") never splits.
const ENTRY_SEPARATOR = /\s+[-–—]\s+|\s*;\s*|\s*•\s*/;
const LEADING_BULLET = /^[-–—•*]+\s*/;

// Unit words recognised after a number. Order matters for the alternation:
// longer spellings first so "komada" is not cut to "kom".
const UNIT_PATTERN = "komada|kom|kpl|kompleta|kompl|paketa|pak|seta|set|m2|m²";
const QUANTITY_WITH_UNIT = new RegExp(
  `\\d+(?:[.,]\\d+)?\\s*(?:${UNIT_PATTERN})\\.?(?:[^\\p{L}\\d]|$)`,
  "iu",
);

function stripBullet(value: string): string {
  return value.replace(LEADING_BULLET, "").trim();
}

/**
 * Splits a free-text description into its entries. Line breaks always
 * separate entries; within a line, " - " / ";" / "•" only split when at least
 * two of the resulting pieces carry a quantity with a unit ("20 KOM"), so an
 * ordinary sentence like "Vizit karte - mat plastifikacija" stays whole.
 */
export function splitDescriptionEntries(text: string | null | undefined): string[] {
  const entries: string[] = [];
  for (const rawLine of (text ?? "").split(/\r?\n/)) {
    const line = stripBullet(rawLine);
    if (!line) continue;
    const pieces = line
      .split(ENTRY_SEPARATOR)
      .map(stripBullet)
      .filter(Boolean);
    const quantified = pieces.filter((piece) => QUANTITY_WITH_UNIT.test(piece));
    if (pieces.length >= 2 && quantified.length >= 2) {
      entries.push(...pieces);
    } else {
      entries.push(line);
    }
  }
  return entries;
}

/**
 * True when the description reads as a list of products with quantities —
 * the case where the operator should be nudged to use stavke instead.
 */
export function looksLikeItemList(text: string | null | undefined): boolean {
  const entries = splitDescriptionEntries(text);
  return (
    entries.length >= 2 &&
    entries.filter((entry) => QUANTITY_WITH_UNIT.test(entry)).length >= 2
  );
}

/**
 * Column count for the printed opis posla: a long product list is set in
 * columns so it fits the fixed-height panel at a legible size.
 */
export function printDescriptionColumns(entryCount: number): number {
  if (entryCount >= 12) return 3;
  if (entryCount >= 6) return 2;
  return 1;
}

export interface ParsedLineItem {
  description: string;
  quantity: number;
  unit: BuiltinInvoiceUnit;
}

function unitFromWord(word: string | undefined): BuiltinInvoiceUnit {
  const normalized = (word ?? "").toLocaleLowerCase("sr-Latn-RS");
  if (normalized === "m2" || normalized === "m²") return "m2";
  if (/^(set|seta|kpl|kompl|kompleta)$/.test(normalized)) return "set";
  return "kom";
}

// "1.000" is a thousands-grouped integer; "1,5" / "1.5" are decimals.
function parseQuantity(raw: string): number {
  const value = /^\d{1,3}(\.\d{3})+$/.test(raw)
    ? Number(raw.replace(/\./g, ""))
    : Number(raw.replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

// "Mango 20 kom", "Mango: 20 kom", "Mango x 20", "Mango 20kom."
const TRAILING_QUANTITY = new RegExp(
  `^(.+?)[\\s:,]+(?:[x×]\\s*)?(\\d+(?:[.,]\\d+)*)\\s*(${UNIT_PATTERN})?\\.?$`,
  "iu",
);
// "20 kom Mango", "20 x Mango"
const LEADING_QUANTITY = new RegExp(
  `^(\\d+(?:[.,]\\d+)*)\\s*(?:(${UNIT_PATTERN})\\.?|[x×])\\s+(.+)$`,
  "iu",
);

/**
 * Parses one description entry into a line item. A trailing number only
 * counts as the quantity when it has a unit or an explicit "x"/":" marker, so
 * "Kalendar 2027" keeps quantity 1 instead of ordering 2027 pieces.
 */
export function parseLineItemEntry(entry: string): ParsedLineItem | null {
  const text = stripBullet(entry);
  if (!text) return null;

  const trailing = TRAILING_QUANTITY.exec(text);
  if (trailing) {
    const [, name, qty, unit] = trailing;
    const marker = text.slice(name.length).trimStart();
    const hasMarker = /^[:x×]/i.test(marker);
    if (unit || hasMarker) {
      const description = name.replace(/[\s:,]+$/, "").trim();
      if (description) {
        return {
          description,
          quantity: parseQuantity(qty),
          unit: unitFromWord(unit),
        };
      }
    }
  }

  const leading = LEADING_QUANTITY.exec(text);
  if (leading) {
    const [, qty, unit, name] = leading;
    return {
      description: name.trim(),
      quantity: parseQuantity(qty),
      unit: unitFromWord(unit),
    };
  }

  return { description: text, quantity: 1, unit: "kom" };
}

/** Parses free text (a pasted list or the opis posla) into line items. */
export function parseLineItemsFromText(
  text: string | null | undefined,
): ParsedLineItem[] {
  return splitDescriptionEntries(text)
    .map(parseLineItemEntry)
    .filter((item): item is ParsedLineItem => item !== null);
}
