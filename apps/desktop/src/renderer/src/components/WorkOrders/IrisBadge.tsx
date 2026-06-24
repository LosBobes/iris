import { useTranslation } from "react-i18next";
import type { WorkOrderStatus } from "@/types/work-order";
import { getWorkOrderStatusLabel } from "@/shared/utils/work-orders";

const STATUS_CSS_VAR: Record<WorkOrderStatus, string> = {
  completed: "var(--iris-status-done)",
  active: "var(--iris-status-active)",
  draft: "var(--iris-status-draft)",
  cancelled: "var(--iris-status-cancelled)",
};

interface IrisBadgeProps {
  status: WorkOrderStatus;
}

export function IrisBadge({ status }: IrisBadgeProps): React.JSX.Element {
  useTranslation();
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
