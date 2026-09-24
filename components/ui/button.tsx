import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 transition-colors disabled:opacity-50 disabled:pointer-events-none",
        variant === "default" && "bg-foreground text-background hover:opacity-90",
        variant === "outline" && "border border-border bg-background hover:bg-foreground/5",
        variant === "ghost" && "hover:bg-foreground/5",
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
