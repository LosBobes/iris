import { describe, expect, it } from "vitest";
import { en } from "@/i18n/locales/en";
import { sr } from "@/i18n/locales/sr";
import {
  getTourCardPosition,
  INTERACTIVE_TOUR_STEPS,
  isRectVisible,
  type ViewportRect,
} from "@/lib/interactive-tour";

function valueAtPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (typeof value !== "object" || value === null) return undefined;
    return (value as Record<string, unknown>)[key];
  }, source);
}

const TARGET: ViewportRect = {
  top: 100,
  right: 300,
  bottom: 200,
  left: 100,
  width: 200,
  height: 100,
};

describe("interactive tour configuration", () => {
  it("uses unique steps and only routes available to every authenticated role", () => {
    expect(new Set(INTERACTIVE_TOUR_STEPS.map((step) => step.id)).size).toBe(
      INTERACTIVE_TOUR_STEPS.length,
    );
    expect(new Set(INTERACTIVE_TOUR_STEPS.map((step) => step.target)).size).toBe(
      INTERACTIVE_TOUR_STEPS.length,
    );
    expect(
      INTERACTIVE_TOUR_STEPS.every((step) =>
        ["/", "/help", "/work-orders", "/work-orders/new"].includes(step.path),
      ),
    ).toBe(true);
  });

  it("has Serbian and English copy for every step", () => {
    for (const step of INTERACTIVE_TOUR_STEPS) {
      expect(valueAtPath(sr, step.titleKey)).toEqual(expect.any(String));
      expect(valueAtPath(sr, step.bodyKey)).toEqual(expect.any(String));
      expect(valueAtPath(en, step.titleKey)).toEqual(expect.any(String));
      expect(valueAtPath(en, step.bodyKey)).toEqual(expect.any(String));
    }
  });
});

describe("interactive tour geometry", () => {
  it("recognizes rectangles that intersect the viewport", () => {
    expect(isRectVisible(TARGET, 1200, 800)).toBe(true);
    expect(
      isRectVisible({ ...TARGET, left: -300, right: -100 }, 1200, 800),
    ).toBe(false);
    expect(isRectVisible({ ...TARGET, width: 0 }, 1200, 800)).toBe(false);
  });

  it("places the card to the right when space is available", () => {
    expect(getTourCardPosition(TARGET, 1200, 800, 360, 250)).toEqual({
      top: 100,
      left: 316,
    });
  });

  it("keeps a centered fallback card within the viewport", () => {
    expect(getTourCardPosition(null, 320, 500, 288, 240)).toEqual({
      top: 130,
      left: 16,
    });
  });
});
