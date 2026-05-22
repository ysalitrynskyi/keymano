// The interactive keyboard (docs/09). Renders geometry zipped with snapshot.

import * as React from "react";
import { useTranslation } from "react-i18next";

import type { KeyView } from "@/lib/types";
import { Mod } from "@/lib/types";
import { useEditor } from "@/store/editor";
import { geometryFor, geometryExtent } from "./geometry";
import { KeyCap } from "./KeyCap";

// On-screen modifier keycap → the ModMask bit it latches when clicked.
const MODIFIER_BIT: Record<number, number> = {
  56: Mod.ShiftL,
  60: Mod.ShiftR,
  58: Mod.OptionL,
  61: Mod.OptionR,
  59: Mod.ControlL,
  62: Mod.ControlR,
  55: Mod.Command,
  54: Mod.Command,
  57: Mod.Caps,
};

export function Keyboard({
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

  const handleSelect = (code: number) => {
    // Clicking a modifier keycap latches that layer (sticky modifiers).
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

  // key centres (in key units) for arrow-key navigation
  const centers = React.useMemo(
    () =>
      geo.rows.flatMap((row) =>
        row.keys.map((k) => {
          const r = k.rects?.[0] ?? { x: k.x, y: k.y ?? row.y, w: k.w ?? 1, h: k.h ?? 1 };
          return {
            code: k.code,
            cx: r.x + (r.w ?? 1) / 2,
            cy: (k.y ?? row.y) + (r.h ?? 1) / 2,
          };
        }),
      ),
    [geo],
  );

  const moveSelection = (dir: "left" | "right" | "up" | "down") => {
    const cur = centers.find((c) => c.code === selectedCode) ?? centers[0];
    if (!cur) return;
    let best: number | null = null;
    let bestScore = Infinity;
    for (const c of centers) {
      if (c.code === cur.code) continue;
      const dx = c.cx - cur.cx;
      const dy = c.cy - cur.cy;
      let primary: number;
      let cross: number;
      if (dir === "left") {
        if (dx >= -0.1) continue;
        primary = -dx;
        cross = Math.abs(dy);
      } else if (dir === "right") {
        if (dx <= 0.1) continue;
        primary = dx;
        cross = Math.abs(dy);
      } else if (dir === "up") {
        if (dy >= -0.1) continue;
        primary = -dy;
        cross = Math.abs(dx);
      } else {
        if (dy <= 0.1) continue;
        primary = dy;
        cross = Math.abs(dx);
      }
      const score = primary + cross * 2;
      if (score < bestScore) {
        bestScore = score;
        best = c.code;
      }
    }
    if (best !== null) selectKey(best);
  };

  // ordinary keys in visual order, for Quick Entry auto-advance
  const ordinaryOrder = React.useMemo(
    () =>
      geo.rows.flatMap((row) =>
        row.keys.filter((k) => (k.kind ?? "ordinary") === "ordinary").map((k) => k.code),
      ),
    [geo],
  );

  const advance = () => {
    if (selectedCode == null) return;
    const i = ordinaryOrder.indexOf(selectedCode);
    if (i >= 0 && i + 1 < ordinaryOrder.length) selectKey(ordinaryOrder[i + 1]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Quick Entry: a printable key fills the selected key's output + advances
    if (
      quickEntry &&
      selectedCode != null &&
      e.key.length === 1 &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey
    ) {
      e.preventDefault();
      void setKeyOutput(selectedCode, e.key);
      advance();
      return;
    }
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
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label={`keyboard ${kbType}`}
        data-testid="keyboard-svg"
      >
        <defs>
          <linearGradient id="kc-ordinary" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--key-fill-top)" />
            <stop offset="100%" stopColor="var(--key-fill-bot)" />
          </linearGradient>
          <linearGradient id="kc-active" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--key-fill-active-top)" />
            <stop offset="100%" stopColor="var(--key-fill-active-bot)" />
          </linearGradient>
          <linearGradient id="kc-modifier" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--key-modifier-top)" />
            <stop offset="100%" stopColor="var(--key-modifier-bot)" />
          </linearGradient>
          <linearGradient id="kc-special" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--key-special-top)" />
            <stop offset="100%" stopColor="var(--key-special-bot)" />
          </linearGradient>
          <filter id="kc-shadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow
              dx="0"
              dy="1"
              stdDeviation="1.1"
              floodColor="var(--key-shadow)"
            />
          </filter>
        </defs>
        {geo.rows.flatMap((row) =>
          row.keys.map((key) => (
            <KeyCap
              key={`${row.y}-${key.code}-${key.x}`}
              geo={key}
              rowY={row.y}
              view={viewByCode.get(key.code)}
              unit={unit}
              selected={
                selectedCode === key.code ||
                (MODIFIER_BIT[key.code] !== undefined &&
                  (modMask & MODIFIER_BIT[key.code]) !== 0)
              }
              dragTarget={mode === "swapKeys" && swapFirst != null && selectedCode !== key.code}
              onSelect={() => handleSelect(key.code)}
              onEdit={() => onEditKey(key.code)}
              onContext={(e) => {
                e.preventDefault();
                selectKey(key.code);
                onContextKey?.(key.code, e.clientX, e.clientY);
              }}
            />
          )),
        )}
      </svg>
    </div>
  );
}
