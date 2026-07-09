import { afterEach, describe, expect, it, vi } from "vitest";
import { openWorkOrderPdf, printWorkOrder } from "./WorkOrderDetailPage";
import type { WorkOrder } from "@/types/work-order";

const sampleOrder = { id: "wo-42", orderNumber: "RN-2026-00042" } as unknown as WorkOrder;

describe("work-order document actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the canonical print HTML in a hidden iframe", async () => {
    const getWorkOrderPreviewHtml = vi.fn().mockResolvedValue("<html>nalog</html>");
    const appendChild = vi.fn();
    const iframe = {
      style: {} as Record<string, string>,
      setAttribute: vi.fn(),
      srcdoc: "",
      onload: null as null | (() => void),
    };

    vi.stubGlobal("window", {
      api: { getWorkOrderPreviewHtml },
      setTimeout: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => iframe),
      body: { appendChild },
    });

    await printWorkOrder(sampleOrder);

    expect(getWorkOrderPreviewHtml).toHaveBeenCalledWith(sampleOrder);
    expect(iframe.srcdoc).toBe("<html>nalog</html>");
    expect(appendChild).toHaveBeenCalledWith(iframe);
  });

  it("falls back to opening the PDF report when rendering fails", async () => {
    const getWorkOrderPreviewHtml = vi.fn().mockRejectedValue(new Error("boom"));
    const getWorkOrderReportUrl = vi.fn((id: string) => `/work-orders/${id}/report`);
    const open = vi.fn();

    vi.stubGlobal("window", {
      api: { getWorkOrderPreviewHtml, getWorkOrderReportUrl },
      open,
    });

    await printWorkOrder(sampleOrder);

    expect(open).toHaveBeenCalledWith(
      "/work-orders/wo-42/report",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("opens the backend PDF report URL for the PDF action", () => {
    const open = vi.fn();
    const getWorkOrderReportUrl = vi.fn((id: string) => `/work-orders/${id}/report`);

    vi.stubGlobal("window", {
      api: {
        getWorkOrderReportUrl,
      },
      open,
    });

    openWorkOrderPdf("wo-42");

    expect(getWorkOrderReportUrl).toHaveBeenCalledWith("wo-42");
    expect(open).toHaveBeenCalledWith(
      "/work-orders/wo-42/report",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
