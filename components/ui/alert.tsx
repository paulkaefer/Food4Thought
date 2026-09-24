import * as React from "react";
import { cn } from "@/lib/utils";

export type AlertVariant = "default" | "destructive" | "success" | "warning";

export const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: AlertVariant }
>(({ className, variant = "default", ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(
      "rounded-md border p-4 text-sm",
      variant === "default" && "border-border bg-background",
      variant === "destructive" && "border-red-300 bg-red-50 text-red-900",
      variant === "success" && "border-emerald-300 bg-emerald-50 text-emerald-900",
      variant === "warning" && "border-amber-300 bg-amber-50 text-amber-900",
      className,
    )}
    {...props}
  />
));
Alert.displayName = "Alert";

export const AlertTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => <h5 ref={ref} className={cn("font-semibold mb-1", className)} {...props} />,
);
AlertTitle.displayName = "AlertTitle";

export const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => <p ref={ref} className={cn("text-sm opacity-90", className)} {...props} />,
);
AlertDescription.displayName = "AlertDescription";
