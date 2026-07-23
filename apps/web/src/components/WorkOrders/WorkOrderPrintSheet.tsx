import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type {
  BillingDocumentType,
  Location,
  Shipping,
  WorkOrder,
} from "@/types/work-order";
import type { BillingDefaults } from "@/types/settings";
import { formatWorkOrderDate } from "@/shared/utils/work-orders";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { cn } from "@/lib/utils";
import i18n from "@/i18n";

interface PrintCheckRow {
  label: string;
  checked: boolean;
}

const PRINT_BILLING_ROWS: Array<{
  labelKey: string;
  billingDocumentType: BillingDocumentType;
}> = [
  { labelKey: "workOrders.print.billing.invoice", billingDocumentType: "invoice" },
  {
    labelKey: "workOrders.print.billing.cashCollection",
    billingDocumentType: "cashCollection",
  },
  { labelKey: "workOrders.print.billing.proforma", billingDocumentType: "proforma" },
];

function uppercaseLine(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.toLocaleUpperCase("sr-Latn-RS");
}

// Thousands-grouped amount with up to two decimals, no currency suffix:
// 15000 -> "15.000". Used both for the grand total and per-line prices.
function formatPrintAmount(value: number): string {
  return new Intl.NumberFormat("sr-Latn-RS", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPrintPrice(price: number | null): string | null {
  if (price === null) return null;
  return i18n.t("workOrders.print.price", { value: formatPrintAmount(price) });
}

function formatOptionalDate(value: string | null | undefined): string {
  return value ? `${formatWorkOrderDate(value)}.` : "/";
}

// The bottom-right delivery address is the order's explicit shipping address
// only; it deliberately does not fall back to the client's location address,
// which is shown separately at the top of the nalog (under the client name).
export function resolvePrintShippingAddress(order: WorkOrder): string | null {
  return uppercaseLine(order.shipping.shippingAddress);
}

// The client's own (registry/location) address, printed in subscript under the
// client name at the top of the nalog.
export function resolvePrintClientAddress(
  order: WorkOrder,
  locations: Location[] = [],
): string | null {
  if (!order.locationId) return null;
  const location = locations.find((entry) => entry.id === order.locationId);
  return uppercaseLine(location?.address);
}

export function getPrintDeliveryRows(shipping: Shipping): PrintCheckRow[] {
  const method = shipping.deliveryMethod;
  const postage = shipping.postagePaymentType;

  return [
    { label: i18n.t("workOrders.print.delivery.drivesOut"), checked: shipping.drivesOut },
    { label: i18n.t("workOrders.print.delivery.pickup"), checked: method === "pickup" },
    {
      label: i18n.t("workOrders.print.delivery.postExpress"),
      checked: method === "postExpress",
    },
    {
      label: i18n.t("workOrders.print.delivery.cityExpress"),
      checked: method === "cityExpress",
    },
    { label: i18n.t("workOrders.print.delivery.cod"), checked: postage === "cod" },
    {
      label: i18n.t("workOrders.print.delivery.ourAccount"),
      checked: postage === "ourAccount",
    },
    {
      label: i18n.t("workOrders.print.delivery.advance"),
      checked: postage === "advance",
    },
    {
      label: i18n.t("workOrders.print.delivery.viaInvoice"),
      checked: postage === "viaInvoice",
    },
    {
      label: i18n.t("workOrders.print.delivery.waitForPayment"),
      checked: shipping.waitForPayment,
    },
    {
      label: i18n.t("workOrders.print.delivery.fieldVisit"),
      checked: method === "fieldVisit",
    },
  ];
}

// resolveBillingDocumentType returns the document type (tip dokumenta) to tick on
// the printout. When the shop does not allow per-order override, the type is
// entirely shop-controlled, so the shop default is authoritative regardless of
// what the order stored (this keeps legacy/imported orders in sync with the
// configured default). When override is allowed, the order's own choice wins.
export function resolveBillingDocumentType(
  order: WorkOrder,
  billingDefaults: BillingDefaults,
): BillingDocumentType | null {
  if (billingDefaults.allowOverride) {
    return order.billingDocumentType;
  }
  return billingDefaults.documentType;
}

export function getPrintBillingRows(
  billingDocumentType: BillingDocumentType | null,
): PrintCheckRow[] {
  return PRINT_BILLING_ROWS.map((row) => ({
    label: i18n.t(row.labelKey),
    checked: row.billingDocumentType === billingDocumentType,
  }));
}

function jobDetailsHasContent(
  details: WorkOrder["jobDetails"],
): boolean {
  if (!details) return false;
  return Boolean(
    details.productCode?.trim() ||
      details.paperWeightGsm != null ||
      details.dimensions?.trim() ||
      details.quantity != null ||
      details.finishingNote?.trim(),
  );
}

// The "opis posla" (job description) lines only: the structured job details when
// present, otherwise the free-text description. Line items (stavke) are rendered
// separately by buildPrintItemLines so the two occupy distinct panels.
export function buildPrintDescriptionLines(order: WorkOrder): string[] {
  const details = order.jobDetails;
  const detailLines = jobDetailsHasContent(details)
    ? [
        uppercaseLine(details?.productCode),
        details?.paperWeightGsm
          ? i18n.t("workOrders.print.gsmSuffix", { value: details.paperWeightGsm })
          : null,
        uppercaseLine(details?.dimensions),
        details?.quantity
          ? i18n.t("workOrders.print.pcsSuffix", { value: details.quantity })
          : null,
        uppercaseLine(details?.finishingNote),
      ].filter((line): line is string => Boolean(line))
    : [];

  return detailLines.length > 0
    ? detailLines
    : [uppercaseLine(order.jobDescription)].filter((line): line is string =>
        Boolean(line),
      );
}

// A single "stavka" (line item) rendered as a table row: name plus the selling
// price, quantity, and line total columns. The numeric columns are pre-formatted
// strings and are left blank when there is nothing to show (zero price, or an
// operator/money-hidden printout), so the table never leaks a bogus "0".
export interface PrintItemRow {
  name: string;
  unitPrice: string;
  quantity: string;
  total: string;
}

// The "stavke" (line items) as table rows. Operators never see money, so their
// printout leaves the price and total columns empty (includePrice = false). The
// grand total is rendered separately (as "UKUPNA CENA", pinned to the bottom of
// the job panel), not mixed into the per-line rows here.
export function buildPrintItemRows(
  order: WorkOrder,
  includePrice = true,
): PrintItemRow[] {
  const rows: PrintItemRow[] = [];
  for (const item of order.invoiceDraft.lineItems) {
    const name = uppercaseLine(item.description);
    if (!name) continue;
    const unit = uppercaseLine(item.unit);
    const quantity =
      item.quantity > 0
        ? unit
          ? `${item.quantity} ${unit}`
          : `${item.quantity}`
        : "";
    const hasPrice = includePrice && item.unitPrice > 0;
    const unitPrice = hasPrice ? formatPrintAmount(item.unitPrice) : "";
    const total =
      hasPrice && item.quantity > 0
        ? formatPrintAmount(item.quantity * item.unitPrice)
        : "";
    rows.push({ name, unitPrice, quantity, total });
  }
  return rows;
}

function buildPrintNoteLines(order: WorkOrder): string[] {
  return [
    uppercaseLine(order.note),
    ...order.customerNotes.map((note) => uppercaseLine(note.body)),
    order.billingDocumentNumber
      ? i18n.t("workOrders.print.documentNumber", {
          number: order.billingDocumentNumber,
        })
      : null,
  ].filter((line): line is string => Boolean(line));
}

// Shrinks a panel's content font-size until it no longer overflows its fixed
// height. The panel keeps its CSS font-size as the ceiling (short content stays
// large) and never drops below MIN_PRINT_FONT_PX (legibility floor); extreme
// cases may still clip past the floor. Mirrors the inline auto-fit script in the
// Go PDF template (internal/reports/work_order_pdf.go).
const MIN_PRINT_FONT_PX = 9;

function fitPanelFont(
  panel: HTMLElement | null,
  content: HTMLElement | null,
): void {
  if (!panel || !content) return;
  // Reset to the CSS-defined size so this recomputes from the ceiling each run.
  content.style.fontSize = "";
  let size = parseFloat(getComputedStyle(content).fontSize);
  while (size > MIN_PRINT_FONT_PX && panel.scrollHeight > panel.clientHeight) {
    size -= 0.5;
    content.style.fontSize = `${size}px`;
  }
}

// Shrinks each numeric stavke cell's font until its (nowrap) value fits the
// fixed column width, so a large figure scales down instead of overflowing its
// column. Only the offending cell shrinks; the name column and the rest of the
// row keep the panel font, so row heights and separators stay aligned. Mirrors
// the per-cell pass in the Go PDF template's auto-fit script.
function fitCellWidths(container: HTMLElement | null): void {
  if (!container) return;
  const cells = container.querySelectorAll<HTMLElement>(
    ".work-order-print-col-num",
  );
  cells.forEach((cell) => {
    // Reset so the cell re-inherits the (possibly panel-shrunk) font each run.
    cell.style.fontSize = "";
    let size = parseFloat(getComputedStyle(cell).fontSize);
    while (size > MIN_PRINT_FONT_PX && cell.scrollWidth > cell.clientWidth) {
      size -= 0.5;
      cell.style.fontSize = `${size}px`;
    }
  });
}

function PrintCheckBox({ checked }: { checked: boolean }): React.JSX.Element {
  return (
    <span className="work-order-print-checkbox" aria-hidden="true">
      {checked ? "X" : ""}
    </span>
  );
}

export function WorkOrderPrintSheet({
  order,
  locations = [],
}: {
  order: WorkOrder;
  locations?: Location[];
}): React.JSX.Element {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { pdfSections, billingDefaults } = useOrganization();
  const isAdmin = currentUser.role === "admin";
  const descriptionLines = buildPrintDescriptionLines(order);
  // Operators never see money: price and total columns stay blank for them.
  const itemRows = buildPrintItemRows(order, isAdmin);
  // Operators never see money: the total is omitted from their printout.
  const totalPrice = isAdmin ? formatPrintPrice(order.price) : null;
  const deliveryRows = getPrintDeliveryRows(order.shipping);
  const billingRows = getPrintBillingRows(
    resolveBillingDocumentType(order, billingDefaults),
  );
  const noteLines = buildPrintNoteLines(order);
  const shippingAddress = resolvePrintShippingAddress(order);
  const clientAddress = resolvePrintClientAddress(order, locations);
  const plannedDate = order.dueDate ?? order.completionDate;

  // Auto-fit the opis posla and stavke text so it never overflows its panel.
  const descPanelRef = useRef<HTMLDivElement>(null);
  const descLinesRef = useRef<HTMLDivElement>(null);
  const itemsPanelRef = useRef<HTMLDivElement>(null);
  const itemLinesRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    fitPanelFont(descPanelRef.current, descLinesRef.current);
    fitPanelFont(itemsPanelRef.current, itemLinesRef.current);
    // After the panel-level vertical fit, shrink any numeric cell whose value is
    // too wide for its fixed column.
    fitCellWidths(itemLinesRef.current);
  });
  return (
    <section
      aria-label={t("workOrders.print.ariaLabel", { order: order.orderNumber })}
      className="work-order-print-sheet"
    >
      <h1 className="work-order-print-title">
        {t("workOrders.print.title")}
        {order.orderNumber && (
          <span className="work-order-print-number">{order.orderNumber}</span>
        )}
      </h1>

      {/* KLIJENT + dates and OPIS POSLA span the full sheet width, above the
          two-column lower area (stavke/billing/notes beside the checklist). */}
      <div className="work-order-print-top-grid">
        <div className="work-order-print-client-box">
          <div className="work-order-print-label">
            {t("workOrders.print.client")}
          </div>
          <div className="work-order-print-client-name">
            {uppercaseLine(order.clientName)}
          </div>
          {clientAddress && (
            <div className="work-order-print-client-address">
              {clientAddress}
            </div>
          )}
        </div>
        <div className="work-order-print-issue-box">
          <div className="work-order-print-issue-cell">
            <div className="work-order-print-date">
              {formatOptionalDate(order.issueDate)}
            </div>
            <div className="work-order-print-label">
              {t("workOrders.print.issueDate")}
            </div>
          </div>
          <div className="work-order-print-issue-cell">
            <div className="work-order-print-date">
              {formatOptionalDate(plannedDate)}
            </div>
            <div className="work-order-print-label">
              {t("workOrders.print.plannedDate")}
            </div>
          </div>
        </div>
      </div>

      <div className="work-order-print-job-description" ref={descPanelRef}>
        <div className="work-order-print-panel-header work-order-print-panel-header-left">
          <span className="work-order-print-panel-label">
            {t("workOrders.print.jobDescription")}
          </span>
        </div>
        <div className="work-order-print-description-lines" ref={descLinesRef}>
          {descriptionLines.length > 0
            ? descriptionLines.map((line) => <div key={line}>{line}</div>)
            : <div>{t("workOrders.print.noDescription")}</div>}
        </div>
      </div>

      <div
        className={cn(
          "work-order-print-body",
          !pdfSections.delivery && "work-order-print-body-solo",
        )}
      >
        <div className="work-order-print-left-stack">
          <div className="work-order-print-job-items" ref={itemsPanelRef}>
            <div className="work-order-print-panel-header work-order-print-panel-header-left">
              <span className="work-order-print-panel-label">
                {t("workOrders.print.items")}
              </span>
            </div>
            <div className="work-order-print-job-lines" ref={itemLinesRef}>
              <table className="work-order-print-items-table">
                <thead>
                  <tr>
                    <th className="work-order-print-col-name">
                      {t("workOrders.print.itemsTable.name")}
                    </th>
                    <th className="work-order-print-col-num">
                      {t("workOrders.print.itemsTable.price")}
                    </th>
                    <th className="work-order-print-col-num">
                      {t("workOrders.print.itemsTable.quantity")}
                    </th>
                    <th className="work-order-print-col-num">
                      {t("workOrders.print.itemsTable.total")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {itemRows.map((row, index) => (
                    <tr key={`${index}-${row.name}`}>
                      <td className="work-order-print-col-name">
                        <span className="work-order-print-item-number">
                          {index + 1}.
                        </span>
                        <span className="work-order-print-item-text">
                          {row.name}
                        </span>
                      </td>
                      <td className="work-order-print-col-num">
                        {row.unitPrice}
                      </td>
                      <td className="work-order-print-col-num">
                        {row.quantity}
                      </td>
                      <td className="work-order-print-col-num">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="work-order-print-job-footer">
              {order.contactPerson && (
                <div className="work-order-print-contact">
                  {uppercaseLine(order.contactPerson)}
                </div>
              )}
              {totalPrice && (
                <div className="work-order-print-total">{totalPrice}</div>
              )}
            </div>
          </div>

          {pdfSections.billing && (
            <div className="work-order-print-billing-box">
              {billingRows.map((row) => (
                <div className="work-order-print-billing-row" key={row.label}>
                  <span>{row.label}</span>
                  <span className="work-order-print-mark">
                    {row.checked ? "X" : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          {(pdfSections.notes || pdfSections.shippingAddress) && (
            <div
              className={
                pdfSections.notes
                  ? "work-order-print-notes-row"
                  : "work-order-print-notes-row work-order-print-notes-row-solo"
              }
            >
              {pdfSections.notes && (
                <div className="work-order-print-note-box">
                  <div className="work-order-print-label">
                    {t("workOrders.print.note")}
                  </div>
                  <div className="work-order-print-note-lines">
                    {noteLines.length > 0
                      ? noteLines.map((line) => <div key={line}>{line}</div>)
                      : null}
                  </div>
                </div>
              )}
              {pdfSections.shippingAddress && (
                <div className="work-order-print-address-box">
                  <div className="work-order-print-label">
                    {t("workOrders.print.shipTo")}
                  </div>
                  {shippingAddress && (
                    <div className="work-order-print-address">
                      {shippingAddress}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {pdfSections.delivery && (
          <div className="work-order-print-delivery-box">
            {deliveryRows.map((row) => (
              <div className="work-order-print-check-row" key={row.label}>
                <span>{row.label}</span>
                <PrintCheckBox checked={row.checked} />
              </div>
            ))}
          </div>
        )}
      </div>

      {pdfSections.signatures && (
        <div className="work-order-print-signatures">
          <div>
            <div className="work-order-print-label work-order-print-align-right">
              {t("workOrders.print.signatory")}
            </div>
            <div className="work-order-print-signature-value">
              {order.executedBy ?? ""}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
