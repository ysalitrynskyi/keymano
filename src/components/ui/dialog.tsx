import * as React from "react";

import { Card } from "./card";
import { cn } from "./utils";

export function Dialog({
  title,
  children,
  onClose,
  role = "dialog",
  z = 80,
  className,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  role?: "dialog" | "alertdialog";
  z?: number;
  className?: string;
}) {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 p-4"
      style={{ zIndex: z }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      role={role}
      aria-modal="true"
      aria-label={title}
    >
      <Card className={cn("max-w-[calc(100vw-2rem)]", className)} onClick={(e) => e.stopPropagation()}>
        {children}
      </Card>
    </div>
  );
}
