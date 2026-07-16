// Compatibility barrel for hand-rolled Tailwind UI primitives.

import type * as React from "react";

import { cn } from "./ui/utils";

export { cn } from "./ui/utils";
export { Button, type ButtonProps } from "./ui/button";
export { Card, ActionCard } from "./ui/card";
export { Input, Label } from "./ui/forms";
export { Badge } from "./ui/badge";
export { Segmented } from "./ui/segmented";
export { Dropdown, MenuItem } from "./ui/menu";
export { Dialog } from "./ui/dialog";

export function Chip({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "h-8 rounded-full px-3 text-sm font-medium border transition-colors",
        active
          ? "bg-[var(--accent)] text-[var(--accent-fg)] border-transparent"
          : "bg-[var(--panel-2)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--border)]",
        className,
      )}
      {...props}
    />
  );
}
