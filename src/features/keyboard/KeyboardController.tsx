import * as React from "react";
import { useTranslation } from "react-i18next";

import type { KeyView } from "@/lib/types";
import { useEditor } from "@/store/editor";

import { geometryExtent, geometryFor } from "./geometry";
import { MODIFIER_BIT } from "./keyLabels";
import { KeyboardView } from "./KeyboardView";
import { useKeyboardNavigation } from "./useKeyboardNavigation";
import { useQuickEntry } from "./useQuickEntry";

export function KeyboardController({
  onEditKey,
  onContextKey,
}: {
  onEditKey: (code: number) => void;
  onContextKey?: (code: number, x: number, y: number) => void;
}) {
  const { t } = useTranslation();
  const kbType = useEditor((s) => s.kbType);
  const snapshot = useEditor((s) => s.snapshot);
  const zoom = useEditor((s) => s.zoom);
  const selectedCode = useEditor((s) => s.selectedCode);
  const modMask = useEditor((s) => s.modMask);
  const mode = useEditor((s) => s.interactionMode);
  const swapFirst = useEditor((s) => s.swapFirst);
  const selectKey = useEditor((s) => s.selectKey);
  const swapKeys = useEditor((s) => s.swapKeys);
  const unlinkKey = useEditor((s) => s.unlinkKey);
  const relinkKey = useEditor((s) => s.relinkKey);
  const toggleMod = useEditor((s) => s.toggleMod);
  const quickEntry = useEditor((s) => s.quickEntry);
  const setKeyOutput = useEditor((s) => s.setKeyOutput);

  const geo = geometryFor(kbType);
  const unit = geo.unit * zoom;
  const extent = geometryExtent(geo);
  const width = extent.w * unit + 8;
  const height = extent.h * unit + 8;

  const viewByCode = React.useMemo(() => {
    const m = new Map<number, KeyView>();
    snapshot?.keys.forEach((k) => m.set(k.code, k));
    return m;
  }, [snapshot]);

  const moveSelection = useKeyboardNavigation(geo, selectedCode, selectKey);
  const handleQuickEntry = useQuickEntry({ geo, selectedCode, selectKey, setKeyOutput });

  const handleSelect = (code: number) => {
    const bit = MODIFIER_BIT[code];
    if (bit !== undefined && mode !== "swapKeys") {
      void toggleMod(bit);
      selectKey(code);
      return;
    }
    if (mode === "swapKeys") {
      if (swapFirst == null) {
        useEditor.setState({ swapFirst: code });
        selectKey(code);
      } else {
        void swapKeys(swapFirst, code);
      }
      return;
    }
    if (mode === "unlinkKey") {
      void unlinkKey(code);
      selectKey(code);
      return;
    }
    if (mode === "relinkKey") {
      void relinkKey(code);
      selectKey(code);
      return;
    }
    selectKey(code);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (handleQuickEntry(e, quickEntry)) return;
    const dirs: Record<string, "left" | "right" | "up" | "down"> = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
    };
    if (dirs[e.key]) {
      e.preventDefault();
      moveSelection(dirs[e.key]);
    } else if ((e.key === "Enter" || e.key === " ") && selectedCode != null) {
      e.preventDefault();
      onEditKey(selectedCode);
    } else if ((e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) && selectedCode != null) {
      e.preventDefault();
      const keyEl = e.currentTarget.querySelector<SVGElement>(
        `[data-key-code="${selectedCode}"]`,
      );
      const rect = keyEl?.getBoundingClientRect() ?? e.currentTarget.getBoundingClientRect();
      onContextKey?.(selectedCode, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
  };

  return (
    <div
      className="overflow-auto rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--panel)] p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      style={{ boxShadow: "inset 0 0 0 1px var(--border), var(--shadow-panel)" }}
      role="application"
      aria-label={t("a11y.keyboard", { kbType })}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => e.currentTarget.focus()}
    >
      <KeyboardView
        kbType={kbType}
        geo={geo}
        unit={unit}
        width={width}
        height={height}
        viewByCode={viewByCode}
        selectedCode={selectedCode}
        modMask={modMask}
        mode={mode}
        swapFirst={swapFirst}
        onSelect={handleSelect}
        onEditKey={onEditKey}
        onContextKey={onContextKey}
      />
    </div>
  );
}
