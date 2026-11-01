import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import data from "./pricing.json";
import stamp from "./price-list.stamp.json";
import { PRICING } from "./pricing";

describe("price list PDF", () => {
  it("was regenerated after the last change to pricing.json", () => {
    // public/cenovnik-iris.pdf is generated from pricing.json; on a mismatch run
    // `node scripts/generate-price-list.mjs` from apps/web/ and commit the PDF.
    const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
    expect(stamp.pricingSha256).toBe(hash);
  });

  it("lists every plan once with its annual price at ten months", () => {
    expect(PRICING.plans.map((plan) => plan.name)).toEqual(["Osnovni", "Proizvodnja", "Pro"]);
    for (const plan of PRICING.plans) expect(plan.annual).toBe(plan.monthly * 10);
  });
});
