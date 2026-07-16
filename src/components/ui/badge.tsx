import type * as React from "react";

import { cn } from "./utils";

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "error" | "warning" | "success";
}) {
  const tones = {
    neutral: "bg-[var(--panel-2)] text-[var(--text-muted)] border-[var(--border)]",
    error: "bg-red-500/15 text-red-400 border-red-500/30",
    warning: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        tones,
        className,
      )}
      {...props}
    />
  );
}
