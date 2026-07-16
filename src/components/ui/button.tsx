import type * as React from "react";

import { cn } from "./utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "accent";
  size?: "sm" | "md" | "icon";
};

export function Button({
  variant = "outline",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50 disabled:pointer-events-none select-none";
  const sizes = {
    sm: "h-8 px-2.5 text-xs",
    md: "h-9 px-3.5 text-sm",
    icon: "h-9 w-9",
  }[size];
  const variants = {
    default:
      "bg-[var(--panel-2)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--border)]",
    outline:
      "bg-transparent text-[var(--text)] border border-[var(--border)] hover:bg-[var(--panel-2)]",
    ghost: "bg-transparent text-[var(--text)] hover:bg-[var(--panel-2)]",
    accent:
      "bg-[var(--accent)] text-[var(--accent-fg)] border border-transparent hover:opacity-90",
  }[variant];
  return <button className={cn(base, sizes, variants, className)} {...props} />;
}
