// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkOrderPreviewPane } from "@/components/WorkOrders/WorkOrderPdfPreview";
import { installFlowStubs } from "@/test/flow-stubs";
import { makeWorkOrder } from "@/test/work-order-factory";

const PAGE_HEIGHT_PX = 1123;

// Gives the frame's document a body of the given rendered height and fires load.
function loadFrameWithHeight(frame: HTMLIFrameElement, height: number): void {
  const body = frame.contentDocument?.body;
  if (!body) throw new Error("frame has no document");
  Object.defineProperty(body, "scrollHeight", { configurable: true, value: height });
  fireEvent.load(frame);
}

describe("WorkOrderPreviewPane", () => {
  beforeEach(() => {
    installFlowStubs();
    vi.useFakeTimers();
    vi.stubGlobal("api", {
      getWorkOrderPreviewHtml: vi.fn().mockResolvedValue("<p>nalog</p>"),
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("grows the frame to show a continuation page and shrinks back to one page", async () => {
    render(<WorkOrderPreviewPane order={makeWorkOrder()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    const frame = screen.getByTitle(/./, { selector: "iframe" }) as HTMLIFrameElement;
    expect(frame.style.height).toBe(`${PAGE_HEIGHT_PX}px`);

    // A long item list continues on a second page: the whole document shows.
    loadFrameWithHeight(frame, 2200);
    expect(frame.style.height).toBe("2200px");

    // Back to a short order: never smaller than one A4 page.
    loadFrameWithHeight(frame, 1039);
    expect(frame.style.height).toBe(`${PAGE_HEIGHT_PX}px`);
  });
});
