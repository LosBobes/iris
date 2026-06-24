import { useState } from "react";
import { format, isAfter, isBefore, parse, startOfDay } from "date-fns";
import { CalendarBlank } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { calendarLocale, dateLocale } from "@/lib/i18n-date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  /** ISO date string (YYYY-MM-DD) or null */
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  /** Earliest selectable date (dates before this are disabled) */
  fromDate?: Date;
  /** Latest selectable date (dates after this are disabled) */
  toDate?: Date;
}

/** Converts YYYY-MM-DD to a Date at local midnight */
function parseIso(dateStr: string): Date {
  return parse(dateStr, "yyyy-MM-dd", new Date());
}

// Default span for the year dropdown when no explicit bounds are given:
// 10 years back through 5 years forward covers historical and scheduled
// work orders.
const DEFAULT_START_MONTH = new Date(new Date().getFullYear() - 10, 0, 1);
const DEFAULT_END_MONTH = new Date(new Date().getFullYear() + 5, 11, 31);

export function DatePicker({
  value,
  onChange,
  placeholder = "Izaberi datum",
  className,
  id,
  disabled,
  fromDate,
  toDate,
}: DatePickerProps): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const selected = value ? parseIso(value) : undefined;

  const today = startOfDay(new Date());
  // "Today" is only offered when it falls inside any configured bounds.
  const todayDisabled =
    (fromDate ? isBefore(today, startOfDay(fromDate)) : false) ||
    (toDate ? isAfter(today, startOfDay(toDate)) : false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-8 justify-start px-2 text-xs font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarBlank className="mr-1.5 size-3.5" />
          {selected
            ? format(selected, "PPP", { locale: dateLocale })
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          // Month + year dropdowns so users can jump across years/months
          // without clicking through one month at a time.
          captionLayout="dropdown"
          defaultMonth={selected ?? fromDate ?? toDate}
          selected={selected}
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : null);
            setOpen(false);
          }}
          locale={calendarLocale}
          // Bound the year dropdown: respect explicit from/to when given,
          // otherwise span a wide window around today so every realistic
          // work-order date is reachable.
          startMonth={fromDate ?? DEFAULT_START_MONTH}
          endMonth={toDate ?? DEFAULT_END_MONTH}
          disabled={[
            ...(fromDate ? [{ before: fromDate }] : []),
            ...(toDate ? [{ after: toDate }] : []),
          ]}
        />
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={todayDisabled}
            onClick={() => {
              onChange(format(today, "yyyy-MM-dd"));
              setOpen(false);
            }}
            className="h-7 px-2 text-xs font-normal"
          >
            <CalendarBlank className="mr-1.5 size-3.5" />
            {t("common.today")}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="h-7 px-2 text-xs font-normal text-muted-foreground"
            >
              {t("common.clear")}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
