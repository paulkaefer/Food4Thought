import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant = "default" | "warning" | "destructive" | "success" | "fun";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border",
        variant === "default" && "bg-foreground/5 border-border text-foreground",
        variant === "warning" && "bg-amber-100 border-amber-300 text-amber-900",
        variant === "destructive" && "bg-red-100 border-red-300 text-red-900",
        variant === "success" && "bg-emerald-100 border-emerald-300 text-emerald-900",
        variant === "fun" && "bg-fuchsia-100 border-fuchsia-300 text-fuchsia-900",
        className,
      )}
      {...props}
    />
  );
}
