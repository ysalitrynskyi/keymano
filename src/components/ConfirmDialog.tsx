// Small confirm modal used for destructive/irreversible prompts.

import * as React from "react";
import { useTranslation } from "react-i18next";

import { Button, Card } from "@/components/ui";

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const cancelText = cancelLabel ?? t("action.cancel");
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm]);

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 p-4"
      onClick={onCancel}
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
    >
      <Card className="w-[360px] max-w-[calc(100vw-2rem)] p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} autoFocus>
            {cancelText}
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={onConfirm}
            style={{ background: "#c0392b", borderColor: "transparent", color: "#fff" }}
          >
            {confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}
