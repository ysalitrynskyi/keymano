// Small confirm modal used for destructive/irreversible prompts.

import { useTranslation } from "react-i18next";

import { Button, Dialog } from "@/components/ui";

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

  return (
    <Dialog title={title} onClose={onCancel} role="alertdialog" z={95} className="w-[360px] p-5">
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
          className="border-transparent bg-[var(--danger,#c0392b)] text-[var(--danger-fg,#fff)] hover:opacity-90"
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
