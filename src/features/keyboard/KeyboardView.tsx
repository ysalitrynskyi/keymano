import type { Geometry, KeyView } from "@/lib/types";
import type { InteractionMode } from "@/store/editor";

import { KeyCap } from "./KeyCap";
import { MODIFIER_BIT } from "./keyLabels";

export function KeyboardView({
  kbType,
  geo,
  unit,
  width,
  height,
  viewByCode,
  selectedCode,
  modMask,
  mode,
  swapFirst,
  onSelect,
  onEditKey,
  onContextKey,
}: {
  kbType: string;
  geo: Geometry;
  unit: number;
  width: number;
  height: number;
  viewByCode: Map<number, KeyView>;
  selectedCode: number | null;
  modMask: number;
  mode: InteractionMode;
  swapFirst: number | null;
  onSelect: (code: number) => void;
  onEditKey: (code: number) => void;
  onContextKey?: (code: number, x: number, y: number) => void;
}) {
  return (
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
              (MODIFIER_BIT[key.code] !== undefined && (modMask & MODIFIER_BIT[key.code]) !== 0)
            }
            dragTarget={mode === "swapKeys" && swapFirst != null && selectedCode !== key.code}
            onSelect={() => onSelect(key.code)}
            onEdit={() => onEditKey(key.code)}
            onContext={(e) => {
              e.preventDefault();
              onSelect(key.code);
              onContextKey?.(key.code, e.clientX, e.clientY);
            }}
          />
        )),
      )}
    </svg>
  );
}
