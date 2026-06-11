import type { WorkOrderStatus } from "@/types/work-order";
import { getWorkOrderStatusLabel } from "@/shared/utils/work-orders";

const STATUS_CSS_VAR: Record<WorkOrderStatus, string> = {
  new: "var(--iris-status-draft)",
  assigned: "var(--iris-status-active)",
  inProgress: "var(--iris-status-active)",
  waitingForCustomer: "var(--iris-accent)",
  waitingForMaterials: "var(--iris-accent)",
  completed: "var(--iris-status-done)",
  cancelled: "var(--iris-status-cancelled)",
  invoiced: "var(--iris-status-done)",
};

interface IrisBadgeProps {
  status: WorkOrderStatus;
}

export function IrisBadge({ status }: IrisBadgeProps): React.JSX.Element {
  const color = STATUS_CSS_VAR[status];
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full border px-2 py-[2px] text-[11px] font-medium tracking-[0.1px]"
      style={{
        color,
        borderColor: `color-mix(in oklch, ${color} 30%, transparent)`,
        background: `color-mix(in oklch, ${color} 12%, transparent)`,
      }}
    >
      {getWorkOrderStatusLabel(status)}
    </span>
  );
}
