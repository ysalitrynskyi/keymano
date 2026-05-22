// Right-click menu for a key (. Positioned at the cursor.

import * as React from "react";
import { useTranslation } from "react-i18next";

import { useEditor } from "@/store/editor";

export function KeyContextMenu({
  code,
  x,
  y,
  onEdit,
  onClose,
}: {
  code: number;
  x: number;
  y: number;
  onEdit: (code: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("editor");
  const clearKey = useEditor((s) => s.clearKey);
  const unlinkKey = useEditor((s) => s.unlinkKey);
  const relinkKey = useEditor((s) => s.relinkKey);
  const copyKeyOutput = useEditor((s) => s.copyKeyOutput);
  const pasteKeyOutput = useEditor((s) => s.pasteKeyOutput);
  const setMode = useEditor((s) => s.setMode);
  const selectKey = useEditor((s) => s.selectKey);
  const hasClip = useEditor((s) => s.keyClipboard) != null;
  // relink only matters when this key carries a local (non-inherited) override
  const view = useEditor((s) => s.snapshot)?.keys.find((k) => k.code === code);
  const canRelink = view != null && !view.inherited;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const items: Array<[string, () => void, boolean?]> = [
    [t("ctx.edit"), () => onEdit(code)],
    [t("ctx.copy"), () => copyKeyOutput(code)],
    [t("ctx.paste"), () => void pasteKeyOutput(code), !hasClip],
    [t("ctx.clear"), () => void clearKey(code)],
    [t("ctx.unlink"), () => void unlinkKey(code)],
    [t("ctx.relink"), () => void relinkKey(code), !canRelink],
    [t("ctx.makeDead"), () => { selectKey(code); setMode("createDeadKey"); onEdit(code); }],
  ];

  // clamp to the viewport so the menu never opens partly off-screen near an edge
  const MENU_W = 176; // min-w-40 (10rem) + slack
  const MENU_H = items.length * 34 + 8;
  const left = Math.min(x, window.innerWidth - MENU_W - 8);
  const top = Math.min(y, window.innerHeight - MENU_H - 8);

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed z-[61] min-w-40 rounded-lg border border-[var(--border)] bg-[var(--panel)] py-1 shadow-lg"
        style={{ left: Math.max(8, left), top: Math.max(8, top), boxShadow: "var(--shadow-panel)" }}
        role="menu"
      >
        {items.map(([label, fn, disabled]) => (
          <button
            key={label}
            role="menuitem"
            disabled={disabled}
            onClick={() => {
              fn();
              onClose();
            }}
            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--panel-2)] disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
