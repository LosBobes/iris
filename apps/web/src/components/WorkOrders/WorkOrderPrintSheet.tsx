import { useTranslation } from "react-i18next";
import type {
  BillingDocumentType,
  Location,
  Shipping,
  WorkOrder,
} from "@/types/work-order";
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

function formatPrintPrice(price: number | null): string | null {
  if (price === null) return null;

  const value = new Intl.NumberFormat("sr-Latn-RS", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);

  return i18n.t("workOrders.print.price", { value });
}

function formatOptionalDate(value: string | null | undefined): string {
  return value ? `${formatWorkOrderDate(value)}.` : "/";
}

export function resolvePrintShippingAddress(
  order: WorkOrder,
  locations: Location[] = [],
): string | null {
  const explicit = uppercaseLine(order.shipping.shippingAddress);
  if (explicit) return explicit;
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

export function buildPrintJobLines(order: WorkOrder, includePrice = true): string[] {
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

  const lines =
    detailLines.length > 0
      ? detailLines
      : [uppercaseLine(order.jobDescription)].filter((line): line is string =>
          Boolean(line),
        );

  // Operators never see money: skip the price line on their printout. (The
  // server-rendered PDF/HTML strips it too; this covers a browser Ctrl+P of the
  // client-rendered sheet.)
  const price = includePrice ? formatPrintPrice(order.price) : null;
  if (price) lines.push(price);

  return lines.length > 0
    ? lines
    : [i18n.t("workOrders.print.noDescription")];
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
  const { pdfSections } = useOrganization();
  const jobLines = buildPrintJobLines(order, currentUser.role === "admin");
  const deliveryRows = getPrintDeliveryRows(order.shipping);
  const billingRows = getPrintBillingRows(order.billingDocumentType);
  const noteLines = buildPrintNoteLines(order);
  const shippingAddress = resolvePrintShippingAddress(order, locations);
  const plannedDate =
    order.dueDate ?? order.assignment.scheduledDate ?? order.completionDate;
  const completed = order.isCompleted || order.status === "invoiced";

  return (
    <section
      aria-label={t("workOrders.print.ariaLabel", { order: order.orderNumber })}
      className="work-order-print-sheet"
    >
      <h1 className="work-order-print-title">{t("workOrders.print.title")}</h1>

      <div
        className={cn(
          "work-order-print-hero",
          !pdfSections.delivery && "work-order-print-hero-solo",
        )}
      >
        <div className="work-order-print-main-panel">
          <div className="work-order-print-top-grid">
            <div className="work-order-print-client-box">
              <div className="work-order-print-label">
                {t("workOrders.print.client")}
              </div>
              <div className="work-order-print-client-name">
                {uppercaseLine(order.clientName)}
              </div>
              <div className="work-order-print-subline">
                {t("workOrders.print.jobDescription")}
              </div>
            </div>
            <div className="work-order-print-issue-box">
              <div className="work-order-print-date">
                {formatOptionalDate(order.issueDate)}
              </div>
              <div className="work-order-print-label">
                {t("workOrders.print.issueDate")}
              </div>
            </div>
          </div>

          <div className="work-order-print-job-box">
            <div className="work-order-print-job-lines">
              {jobLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
            {order.contactPerson && (
              <div className="work-order-print-contact">
                {uppercaseLine(order.contactPerson)}
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
            <div className="work-order-print-empty-field" />
          </div>
        )}
      </div>

      <div className="work-order-print-document-row">
        <div className="work-order-print-planned-date">
          {formatOptionalDate(plannedDate)}
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
      </div>

      {(pdfSections.notes || pdfSections.shippingAddress) && (
        <div className="work-order-print-notes-row">
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
                <div className="work-order-print-address">{shippingAddress}</div>
              )}
            </div>
          )}
        </div>
      )}

      {pdfSections.completion && (
        <div className="work-order-print-completion-row">
          <div className="work-order-print-completion-state">
            <span>{t("workOrders.print.completed")}</span>
            <PrintCheckBox checked={completed} />
          </div>
          <div className="work-order-print-completion-date">
            <span>{t("workOrders.print.completionDate")}</span>
            <span className="work-order-print-date-line">
              {formatOptionalDate(order.completionDate)}
            </span>
          </div>
        </div>
      )}

      {pdfSections.signatures && (
        <div className="work-order-print-signatures">
          <div>
            <div className="work-order-print-label">
              {t("workOrders.print.issuedBy")}
            </div>
            <div className="work-order-print-signature-value">
              {order.issuedBy}
            </div>
          </div>
          <div>
            <div className="work-order-print-label work-order-print-align-right">
              {t("workOrders.print.executor")}
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
