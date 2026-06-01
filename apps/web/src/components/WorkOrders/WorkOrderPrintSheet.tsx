import type {
  BillingDocumentType,
  DeliveryMethod,
  WorkOrder,
} from "@/types/work-order";
import { formatWorkOrderDate } from "@/shared/utils/work-orders";

interface PrintCheckRow {
  label: string;
  checked: boolean;
}

const PRINT_DELIVERY_ROWS: Array<{
  label: string;
  deliveryMethod?: DeliveryMethod;
}> = [
  { label: "VOZI SE" },
  { label: "LIČNO", deliveryMethod: "pickup" },
  { label: "POST EXPRES", deliveryMethod: "postExpress" },
  { label: "CITY EXPRES", deliveryMethod: "cityExpress" },
  { label: "POŠTARINA POUZEĆEM" },
  { label: "POŠTARINA NA NAŠ RAČUN" },
  { label: "AVANS POŠTARINA" },
  { label: "POŠTARINA SE NAPLAĆUJE PREKO FAKTURE" },
  { label: "ČEKA SE UPLATA" },
  { label: "IZLAZAK NA TEREN", deliveryMethod: "fieldVisit" },
];

const PRINT_BILLING_ROWS: Array<{
  label: string;
  billingDocumentType: BillingDocumentType;
}> = [
  { label: "FAKTURA", billingDocumentType: "invoice" },
  { label: "OTKUP", billingDocumentType: "cashCollection" },
  { label: "PROFAKTURA", billingDocumentType: "proforma" },
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

  return `${value} DINARA`;
}

function formatOptionalDate(value: string | null | undefined): string {
  return value ? `${formatWorkOrderDate(value)}.` : "/";
}

export function getPrintDeliveryRows(
  deliveryMethod: DeliveryMethod | null,
): PrintCheckRow[] {
  return PRINT_DELIVERY_ROWS.map((row) => ({
    label: row.label,
    checked: row.deliveryMethod === deliveryMethod,
  }));
}

export function getPrintBillingRows(
  billingDocumentType: BillingDocumentType | null,
): PrintCheckRow[] {
  return PRINT_BILLING_ROWS.map((row) => ({
    label: row.label,
    checked: row.billingDocumentType === billingDocumentType,
  }));
}

export function buildPrintJobLines(order: WorkOrder): string[] {
  const details = order.jobDetails;
  const detailLines = details
    ? [
        uppercaseLine(details.productCode),
        details.paperWeightGsm ? `${details.paperWeightGsm}G` : null,
        uppercaseLine(details.dimensions),
        details.quantity ? `${details.quantity}KOM` : null,
        uppercaseLine(details.finishingNote),
      ]
    : [];

  const lines = (detailLines.length > 0 ? detailLines : [
    uppercaseLine(order.jobDescription),
  ]).filter((line): line is string => Boolean(line));

  const price = formatPrintPrice(order.price);
  if (price) lines.push(`CENA: ${price}`);

  return lines.length > 0 ? lines : ["OPIS POSLA NIJE UNET"];
}

function buildPrintNoteLines(order: WorkOrder): string[] {
  return [
    uppercaseLine(order.note),
    ...order.customerNotes.map((note) => uppercaseLine(note.body)),
    order.billingDocumentNumber
      ? `BROJ DOKUMENTA: ${order.billingDocumentNumber}`
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
}: {
  order: WorkOrder;
}): React.JSX.Element {
  const jobLines = buildPrintJobLines(order);
  const deliveryRows = getPrintDeliveryRows(order.shipping.deliveryMethod);
  const billingRows = getPrintBillingRows(order.billingDocumentType);
  const noteLines = buildPrintNoteLines(order);
  const plannedDate =
    order.dueDate ?? order.assignment.scheduledDate ?? order.completionDate;
  const completed = order.isCompleted || order.status === "invoiced";

  return (
    <section
      aria-label={`Radni nalog ${order.orderNumber} za štampu`}
      className="work-order-print-sheet"
    >
      <h1 className="work-order-print-title">RADNI NALOG</h1>

      <div className="work-order-print-hero">
        <div className="work-order-print-main-panel">
          <div className="work-order-print-top-grid">
            <div className="work-order-print-client-box">
              <div className="work-order-print-label">KLIJENT</div>
              <div className="work-order-print-client-name">
                {uppercaseLine(order.clientName)}
              </div>
              <div className="work-order-print-subline">OPIS POSLA</div>
            </div>
            <div className="work-order-print-issue-box">
              <div className="work-order-print-date">
                {formatOptionalDate(order.issueDate)}
              </div>
              <div className="work-order-print-label">DATUM IZDAVANJA</div>
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

        <div className="work-order-print-delivery-box">
          {deliveryRows.map((row) => (
            <div className="work-order-print-check-row" key={row.label}>
              <span>{row.label}</span>
              <PrintCheckBox checked={row.checked} />
            </div>
          ))}
          <div className="work-order-print-empty-field">/</div>
        </div>
      </div>

      <div className="work-order-print-document-row">
        <div className="work-order-print-planned-date">
          {formatOptionalDate(plannedDate)}
        </div>
        <div className="work-order-print-billing-box">
          {billingRows.map((row) => (
            <div className="work-order-print-billing-row" key={row.label}>
              <span>{row.label}</span>
              <span className="work-order-print-mark">
                {row.checked ? "X /" : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="work-order-print-notes-row">
        <div className="work-order-print-note-box">
          <div className="work-order-print-label">NAPOMENA</div>
          <div className="work-order-print-note-lines">
            {noteLines.length > 0
              ? noteLines.map((line) => <div key={line}>{line}</div>)
              : null}
          </div>
        </div>
        <div className="work-order-print-address-box">
          <div className="work-order-print-label">ADRESA ZA SLANJE:</div>
          {order.shipping.shippingAddress && (
            <div className="work-order-print-address">
              {uppercaseLine(order.shipping.shippingAddress)}
            </div>
          )}
        </div>
      </div>

      <div className="work-order-print-completion-row">
        <div className="work-order-print-completion-state">
          <span>RADNI NALOG ZAVRŠEN</span>
          <PrintCheckBox checked={completed} />
        </div>
        <div className="work-order-print-completion-date">
          <span>DATUM IZVRŠENJA POSLA</span>
          <span className="work-order-print-date-line">
            {formatOptionalDate(order.completionDate)}
          </span>
        </div>
      </div>

      <div className="work-order-print-signatures">
        <div>
          <div className="work-order-print-label">RN IZDAO</div>
          <div className="work-order-print-signature-value">
            {order.issuedBy}
          </div>
        </div>
        <div>
          <div className="work-order-print-label work-order-print-align-right">
            IZVRŠILAC POSLA
          </div>
          <div className="work-order-print-signature-value">
            {order.executedBy ?? ""}
          </div>
        </div>
      </div>
    </section>
  );
}
