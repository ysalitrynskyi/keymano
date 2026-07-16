import type * as React from "react";

import { cn } from "./utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--panel)]",
        className,
      )}
      style={{ boxShadow: "var(--shadow-panel)" }}
      {...props}
    />
  );
}

export function ActionCard({
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--panel)] text-left transition-colors hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        className,
      )}
      style={{ boxShadow: "var(--shadow-panel)" }}
      {...props}
    />
  );
}
