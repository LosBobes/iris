import { afterEach, describe, expect, it, vi } from "vitest";
import { openWorkOrderPdf, printWorkOrder } from "./WorkOrderDetailPage";

describe("work-order document actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the browser print flow for the print action", () => {
    const print = vi.fn();

    vi.stubGlobal("window", {
      print,
    });

    printWorkOrder();

    expect(print).toHaveBeenCalledTimes(1);
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
