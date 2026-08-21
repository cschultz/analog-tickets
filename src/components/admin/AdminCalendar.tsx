/**
 * Admin Calendar Component
 * 
 * A styled calendar component that follows the admin design system.
 * Uses admin tokens for all colors and styling.
 * 
 * @module AdminCalendar
 */

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

export type AdminCalendarProps = React.ComponentProps<typeof DayPicker>;

function AdminCalendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: AdminCalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium text-[hsl(var(--admin-text))]",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
          "inline-flex items-center justify-center rounded-md border border-[hsl(var(--admin-border))]",
          "text-[hsl(var(--admin-text))] hover:bg-[hsl(var(--admin-hover))]",
          "transition-colors"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-[hsl(var(--admin-text-muted))] rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: cn(
          "h-9 w-9 text-center text-sm p-0 relative",
          "[&:has([aria-selected].day-range-end)]:rounded-r-md",
          "[&:has([aria-selected].day-outside)]:bg-[hsl(var(--admin-accent)/0.5)]",
          "[&:has([aria-selected])]:bg-[hsl(var(--admin-accent))]",
          "first:[&:has([aria-selected])]:rounded-l-md",
          "last:[&:has([aria-selected])]:rounded-r-md",
          "focus-within:relative focus-within:z-20"
        ),
        day: cn(
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
          "inline-flex items-center justify-center rounded-md",
          "text-[hsl(var(--admin-text))]",
          "hover:bg-[hsl(var(--admin-hover))]",
          "transition-colors cursor-pointer"
        ),
        day_range_end: "day-range-end",
        day_selected: cn(
          "bg-[hsl(var(--admin-accent))] text-[hsl(var(--admin-accent-foreground))]",
          "hover:bg-[hsl(var(--admin-accent))] hover:text-[hsl(var(--admin-accent-foreground))]",
          "focus:bg-[hsl(var(--admin-accent))] focus:text-[hsl(var(--admin-accent-foreground))]"
        ),
        day_today: "bg-[hsl(var(--admin-hover))] text-[hsl(var(--admin-text))] font-semibold",
        day_outside: cn(
          "day-outside text-[hsl(var(--admin-text-muted))] opacity-50",
          "aria-selected:bg-[hsl(var(--admin-accent)/0.5)]",
          "aria-selected:text-[hsl(var(--admin-text-muted))]",
          "aria-selected:opacity-30"
        ),
        day_disabled: "text-[hsl(var(--admin-text-muted))] opacity-50",
        day_range_middle: cn(
          "aria-selected:bg-[hsl(var(--admin-accent))]",
          "aria-selected:text-[hsl(var(--admin-accent-foreground))]"
        ),
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
AdminCalendar.displayName = "AdminCalendar";

export { AdminCalendar };
