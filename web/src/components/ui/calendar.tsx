"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, ...props }: CalendarProps) {
  return (
    <DayPicker
      className={cn("p-3", className)}
      components={{
        Chevron: ({ orientation, className: iconClass, size }) => {
          const c = cn("h-4 w-4", iconClass);
          switch (orientation) {
            case "left":
              return <ChevronLeft className={c} size={size} />;
            case "right":
              return <ChevronRight className={c} size={size} />;
            case "up":
              return <ChevronUp className={c} size={size} />;
            case "down":
              return <ChevronDown className={c} size={size} />;
            default:
              return <ChevronLeft className={c} size={size} />;
          }
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
