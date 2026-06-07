import { afterEach, describe, expect, it, vi } from "vitest";
import { openWorkOrderPdf, printWorkOrder } from "./WorkOrderDetailPage";

describe("work-order document actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the browser print flow for the print action", () => {
    const print = vi.fn();
    const addEventListener = vi.fn();

    vi.stubGlobal("document", {
      title: "Iris",
    });
    vi.stubGlobal("window", {
      print,
      addEventListener,
    });

    printWorkOrder("RN-2026-0042");

    expect(document.title).toBe("RN-2026-0042");
    expect(print).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledWith(
      "afterprint",
      expect.any(Function),
      { once: true },
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
