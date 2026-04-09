import { useState } from "react";
import { format, parse } from "date-fns";
import { CalendarBlank } from "@phosphor-icons/react";
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
  const [open, setOpen] = useState(false);

  const selected = value ? parseIso(value) : undefined;

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
          selected={selected}
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : null);
            setOpen(false);
          }}
          locale={calendarLocale}
          startMonth={fromDate}
          endMonth={toDate}
          disabled={[
            ...(fromDate ? [{ before: fromDate }] : []),
            ...(toDate ? [{ after: toDate }] : []),
          ]}
        />
      </PopoverContent>
    </Popover>
  );
}
