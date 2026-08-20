import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type {
  BillingDocumentType,
  Customer,
  EnumField,
  EnumValue,
  Location,
  Shipping,
  WorkOrder,
} from "@/types/work-order";
import {
  normalizePrintItemColumns,
  type BillingDefaults,
  type PrintItemColumn,
} from "@/types/settings";
import { formatWorkOrderDate } from "@/shared/utils/work-orders";
import { useOrganization } from "@/hooks/useOrganization";
import { useEnumValues } from "@/hooks/useEnumValues";
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

// The admin-added (non built-in) values of one managed field, as printable
// rows ticked when they match the order's stored value. Built-ins are skipped:
// they already have hand-placed rows on the nalog, so customs are appended
// after them and the familiar sheet layout stays put.
function customEnumRows(
  enumValues: EnumValue[],
  field: EnumField,
  selected: string | null | undefined,
): PrintCheckRow[] {
  return enumValues
    .filter((entry) => entry.field === field && !entry.isBuiltin)
    .map((entry) => ({
      label: (entry.label.trim() || entry.value).toLocaleUpperCase("sr-Latn-RS"),
      checked: entry.value === selected,
    }));
}

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

// Quantities may be fractional for area/length-based services (e.g. 1.5 m²).
// Whole numbers print without a decimal part; fractions use the Serbian comma
// separator with trailing zeros dropped.
function formatPrintQuantity(value: number): string {
  return new Intl.NumberFormat("sr-Latn-RS", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
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

export function getPrintDeliveryRows(
  shipping: Shipping,
  enumValues: EnumValue[] = [],
): PrintCheckRow[] {
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
    // Admin-added delivery and postage options print after the built-in rows.
    ...customEnumRows(enumValues, "deliveryMethod", method),
    ...customEnumRows(enumValues, "postagePaymentType", postage),
  ];
}

// resolveBillingDocumentType returns the document type (tip dokumenta) to tick on
// the printout: the order's own choice, falling back to the shop default for
// legacy/imported orders that never stored one.
export function resolveBillingDocumentType(
  order: WorkOrder,
  billingDefaults: BillingDefaults,
): BillingDocumentType | null {
  return order.billingDocumentType ?? billingDefaults.documentType;
}

// Builds the document box: the three built-in document-type rows in their
// established order, then any document type the shop added in Settings, and
// finally PLAĆENO. The paid row is deliberately last and independent — it ticks
// alongside whichever document type is selected, since a proforma or otkup can
// be paid just as an invoice can.
export function getPrintBillingRows(
  billingDocumentType: BillingDocumentType | null,
  enumValues: EnumValue[] = [],
  isPaid = false,
): PrintCheckRow[] {
  return [
    ...PRINT_BILLING_ROWS.map((row) => ({
      label: i18n.t(row.labelKey),
      checked: row.billingDocumentType === billingDocumentType,
    })),
    ...customEnumRows(enumValues, "billingDocumentType", billingDocumentType),
    { label: i18n.t("workOrders.print.billing.paid"), checked: isPaid },
  ];
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
// strings and are left blank when there is nothing to show (a zero price), so
// the table never leaks a bogus "0".
export interface PrintItemRow {
  name: string;
  unitPrice: string;
  quantity: string;
  total: string;
}

// The "stavke" (line items) as table rows. The selling price is on every
// printout, operators included — the shop floor has to know what the customer is
// charged. Only cost/margin is admin-only, and it never reaches this sheet. The
// grand total is rendered separately (as "UKUPNA CENA", pinned to the bottom of
// the job panel), not mixed into the per-line rows here.
export function buildPrintItemRows(order: WorkOrder): PrintItemRow[] {
  const rows: PrintItemRow[] = [];
  for (const item of order.invoiceDraft.lineItems) {
    const name = uppercaseLine(item.description);
    if (!name) continue;
    const unit = uppercaseLine(item.unit);
    const quantity =
      item.quantity > 0
        ? unit
          ? `${formatPrintQuantity(item.quantity)} ${unit}`
          : formatPrintQuantity(item.quantity)
        : "";
    const hasPrice = item.unitPrice > 0;
    const unitPrice = hasPrice ? formatPrintAmount(item.unitPrice) : "";
    const total =
      hasPrice && item.quantity > 0
        ? formatPrintAmount(item.quantity * item.unitPrice)
        : "";
    rows.push({ name, unitPrice, quantity, total });
  }
  return rows;
}

/** i18n key under `workOrders.print.itemsTable` for a reorderable column. */
const PRINT_ITEM_COLUMN_LABEL_KEYS: Record<PrintItemColumn, string> = {
  quantity: "workOrders.print.itemsTable.quantity",
  unitPrice: "workOrders.print.itemsTable.price",
  total: "workOrders.print.itemsTable.total",
};

/** Resolves a printout column's heading in the active language. */
export function printItemColumnLabel(column: PrintItemColumn): string {
  return i18n.t(PRINT_ITEM_COLUMN_LABEL_KEYS[column]);
}

/**
 * Picks a row's cell for one column, so the table body follows the same
 * configured order as its headers.
 */
export function printItemCell(
  row: PrintItemRow,
  column: PrintItemColumn,
): string {
  return row[column];
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
  customer = null,
}: {
  order: WorkOrder;
  locations?: Location[];
  /** Registry client behind the order, for the PIB / matični broj line. */
  customer?: Customer | null;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { pdfSections, billingDefaults, printItemColumns } = useOrganization();
  const { values: enumValues } = useEnumValues();
  const descriptionLines = buildPrintDescriptionLines(order);
  const itemRows = buildPrintItemRows(order);
  // Guard the shop's configured order so a stale/partial value can never drop a
  // column from the printed nalog.
  const itemColumns = normalizePrintItemColumns(printItemColumns);
  const totalPrice = formatPrintPrice(order.price);
  const deliveryRows = getPrintDeliveryRows(order.shipping, enumValues);
  const billingRows = getPrintBillingRows(
    resolveBillingDocumentType(order, billingDefaults),
    enumValues,
    order.isPaid,
  );
  const noteLines = buildPrintNoteLines(order);
  const shippingAddress = resolvePrintShippingAddress(order);
  const clientAddress = resolvePrintClientAddress(order, locations);
  // Firm identifiers only print for the registry client this order points at,
  // so a stale/mismatched customer prop never leaks onto the sheet.
  const printedCustomer =
    customer && order.customerId && customer.id === order.customerId ? customer : null;
  const clientPib = printedCustomer?.pib?.trim() || null;
  const clientMb = printedCustomer?.mb?.trim() || null;
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
          {(clientPib || clientMb) && (
            <div className="work-order-print-client-ids">
              {clientPib && (
                <span>{t("workOrders.print.pib", { value: clientPib })}</span>
              )}
              {clientMb && (
                <span>{t("workOrders.print.mb", { value: clientMb })}</span>
              )}
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
                    {itemColumns.map((column) => (
                      <th key={column} className="work-order-print-col-num">
                        {printItemColumnLabel(column)}
                      </th>
                    ))}
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
                      {itemColumns.map((column) => (
                        <td key={column} className="work-order-print-col-num">
                          {printItemCell(row, column)}
                        </td>
                      ))}
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

          {/* The napomena box is not one of the section toggles: it is the only
              destination for the order's free-text note, so it always renders
              and the form always offers the field. */}
          <div
            className={cn(
              "work-order-print-notes-row",
              !pdfSections.shippingAddress && "work-order-print-notes-row-solo",
            )}
          >
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
