import { describe, expect, it } from "vitest";
import {
  isDescriptionHeading,
  looksLikeItemList,
  parseLineItemEntry,
  parseLineItemsFromText,
  printDescriptionColumns,
  splitDescriptionEntries,
} from "./description-items";

// Shape of the real Orient order that prompted this: every product typed into
// the opis posla on one line, separated by " - ".
const ORIENT_DESCRIPTION =
  "- ČOKO VANILLA 20 KOM - MANGO 20 KOM - NARANDŽA 20 KOM - ANTICELULIT 20 KOM - SVEĆA DARK AMBER 10 KOM";

const REAL_ORIENT_DESCRIPTION =
  "- Čoko vanilla 20 kom. - Mango 20 kom. - Narandža 20 kom. - Anticelulit 20 kom. - Sport 40 kom. - Grožđe 20 kom. - Bergamot harmoni 20 kom. - Limunska trava 20 kom. Nalepnice za proizvode: - Čoko dream 20 kom. -Thermo gel 20 kom. - Hijaluronski serum 20 kom. - Piling lice 10 kom. - Krema za masažu lica 10 kom. - Krema Grožđe 10 kom. - Krema Kokos 10 kom. - Krema Limunska trava 10 kom. - Avokado buter 20 kom. - Serum good bay cellulit 10 kom. - Serum za strije 10 kom. -Sveća Kokos 10 kom. - Sveća Grožđe 10 kom. - Sveća Narandža 10 kom. - Sveća Dark Amber 10 kom. - Sveća Winter 10 kom.";

describe("splitDescriptionEntries", () => {
  it("splits a dash-separated product list into entries", () => {
    expect(splitDescriptionEntries(ORIENT_DESCRIPTION)).toEqual([
      "ČOKO VANILLA 20 KOM",
      "MANGO 20 KOM",
      "NARANDŽA 20 KOM",
      "ANTICELULIT 20 KOM",
      "SVEĆA DARK AMBER 10 KOM",
    ]);
  });

  it("splits the real Orient order text, including '-X' and 'kom. Next' boundaries", () => {
    const entries = splitDescriptionEntries(REAL_ORIENT_DESCRIPTION);
    expect(entries).toHaveLength(25);
    expect(entries.slice(6, 11)).toEqual([
      "Bergamot harmoni 20 kom",
      "Limunska trava 20 kom",
      "Nalepnice za proizvode:",
      "Čoko dream 20 kom",
      "Thermo gel 20 kom",
    ]);
    expect(entries[20]).toBe("Sveća Kokos 10 kom");
    expect(entries[24]).toBe("Sveća Winter 10 kom");
  });

  it("keeps a sentence with one quantity whole", () => {
    expect(splitDescriptionEntries("Vizitkarte 500 kom. Mat plastifikacija")).toEqual([
      "Vizitkarte 500 kom. Mat plastifikacija",
    ]);
  });

  it("keeps an ordinary sentence with a dash whole", () => {
    expect(splitDescriptionEntries("Vizit karte - mat plastifikacija")).toEqual([
      "Vizit karte - mat plastifikacija",
    ]);
    expect(splitDescriptionEntries("Plakat A-2 - 50 kom")).toEqual([
      "Plakat A-2 - 50 kom",
    ]);
  });

  it("always splits on line breaks and drops bullets and blank lines", () => {
    expect(splitDescriptionEntries("- Mango 20 kom\n\n• Kokos 10 kom\r\nCenovnik")).toEqual([
      "Mango 20 kom",
      "Kokos 10 kom",
      "Cenovnik",
    ]);
  });

  it("splits on semicolons", () => {
    expect(splitDescriptionEntries("Mango 20 kom; Kokos 10 kom")).toEqual([
      "Mango 20 kom",
      "Kokos 10 kom",
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(splitDescriptionEntries("")).toEqual([]);
    expect(splitDescriptionEntries(null)).toEqual([]);
  });
});

describe("looksLikeItemList", () => {
  it("detects a product list", () => {
    expect(looksLikeItemList(ORIENT_DESCRIPTION)).toBe(true);
  });

  it("ignores a plain description", () => {
    expect(looksLikeItemList("Štampa vizitkarti 500 kom")).toBe(false);
    expect(looksLikeItemList("Izrada kataloga\nA4 format")).toBe(false);
  });
});

describe("printDescriptionColumns", () => {
  it("uses more columns for longer lists", () => {
    expect(printDescriptionColumns(1)).toBe(1);
    expect(printDescriptionColumns(5)).toBe(1);
    expect(printDescriptionColumns(6)).toBe(2);
    expect(printDescriptionColumns(12)).toBe(3);
    expect(printDescriptionColumns(30)).toBe(3);
  });
});

describe("parseLineItemEntry", () => {
  it("reads a trailing quantity with a unit", () => {
    expect(parseLineItemEntry("ČOKO VANILLA 20 KOM")).toEqual({
      description: "ČOKO VANILLA",
      quantity: 20,
      unit: "kom",
    });
    expect(parseLineItemEntry("Baner: 6 m2")).toEqual({
      description: "Baner",
      quantity: 6,
      unit: "m2",
    });
    expect(parseLineItemEntry("Pozivnice 1.000 komada")).toEqual({
      description: "Pozivnice",
      quantity: 1000,
      unit: "kom",
    });
    expect(parseLineItemEntry("Folija 1,5 m²")).toEqual({
      description: "Folija",
      quantity: 1.5,
      unit: "m2",
    });
    expect(parseLineItemEntry("Poklon paket 3 kpl")).toEqual({
      description: "Poklon paket",
      quantity: 3,
      unit: "set",
    });
  });

  it("reads an explicit x marker without a unit", () => {
    expect(parseLineItemEntry("Mango x 20")).toEqual({
      description: "Mango",
      quantity: 20,
      unit: "kom",
    });
  });

  it("reads a leading quantity", () => {
    expect(parseLineItemEntry("20 kom Mango")).toEqual({
      description: "Mango",
      quantity: 20,
      unit: "kom",
    });
  });

  it("does not mistake a bare number in the name for a quantity", () => {
    expect(parseLineItemEntry("Kalendar 2027")).toEqual({
      description: "Kalendar 2027",
      quantity: 1,
      unit: "kom",
    });
    expect(parseLineItemEntry("Plakat A2")).toEqual({
      description: "Plakat A2",
      quantity: 1,
      unit: "kom",
    });
  });
});

describe("isDescriptionHeading", () => {
  it("recognises a label ending in a colon", () => {
    expect(isDescriptionHeading("Nalepnice za proizvode:")).toBe(true);
    expect(isDescriptionHeading("Mango 20 kom")).toBe(false);
    expect(isDescriptionHeading("Baner: 6 m2")).toBe(false);
  });
});

describe("parseLineItemsFromText", () => {
  it("skips heading entries when importing", () => {
    const items = parseLineItemsFromText(REAL_ORIENT_DESCRIPTION);
    expect(items).toHaveLength(24);
    expect(items[8]).toEqual({ description: "Čoko dream", quantity: 20, unit: "kom" });
  });

  it("turns a typed product list into line items", () => {
    expect(parseLineItemsFromText(ORIENT_DESCRIPTION)).toHaveLength(5);
    expect(parseLineItemsFromText(ORIENT_DESCRIPTION)[4]).toEqual({
      description: "SVEĆA DARK AMBER",
      quantity: 10,
      unit: "kom",
    });
  });
});
