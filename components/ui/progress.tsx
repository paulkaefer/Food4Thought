import * as React from "react";
import { cn } from "@/lib/utils";

export function Progress({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-foreground/10", className)}>
      <div className="h-full bg-foreground transition-all" style={{ width: `${clamped}%` }} />
    </div>
  );
}
