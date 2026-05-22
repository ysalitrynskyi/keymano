// One key cap (docs/09). SVG group: shape (rect or L-polygon) + legend + badges.

import * as React from "react";

import { SPECIAL_GLYPHS, codePointChip, isControl } from "@/lib/glyphs";
import type { GeoKey, KeyView } from "@/lib/types";

interface Props {
  geo: GeoKey;
  rowY: number;
  view?: KeyView;
  unit: number;
  selected: boolean;
  dragTarget: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onContext: (e: React.MouseEvent) => void;
}

function lPolygonPoints(rects: NonNullable<GeoKey["rects"]>, unit: number): string {
  // Two-rect union → simple L polygon. Assumes top rect above bottom rect.
  const [a, b] = rects;
  const ax = a.x * unit;
  const ay = a.y * unit;
  const aw = (a.w ?? 1) * unit;
  const bx = b.x * unit;
  const by = b.y * unit;
  const bh = (b.h ?? 1) * unit;
  const pad = 1.5;
  return [
    [ax + pad, ay + pad],
    [ax + aw - pad, ay + pad],
    [ax + aw - pad, by + bh - pad],
    [bx + pad, by + bh - pad],
    [bx + pad, by + pad],
    [ax + pad, by + pad],
  ]
    .map((p) => p.join(","))
    .join(" ");
}

export const KeyCap = React.memo(function KeyCap({
  geo,
  rowY,
  view,
  unit,
  selected,
  dragTarget,
  onSelect,
  onEdit,
  onContext,
}: Props) {
  const kind = geo.kind ?? "ordinary";
  const editable = kind === "ordinary" || kind === "special";

  const x = geo.x * unit;
  const y = (geo.y ?? rowY) * unit;
  const w = (geo.w ?? 1) * unit;
  const h = (geo.h ?? 1) * unit;
  const pad = 1.5;

  // Legend
  let main = "";
  let chip: string | null = null;
  let faint = false;
  if (kind === "ordinary") {
    // Ordinary keys derive their legend from the resolved output.
    const display = view?.display ?? "";
    if (display === "") {
      faint = true;
    } else if (isControl(display)) {
      chip = codePointChip(display.codePointAt(0)!);
    } else {
      main = display;
    }
  } else {
    // Special/modifier keys show their glyph or descriptive label.
    main = SPECIAL_GLYPHS[geo.code] ?? geo.label ?? "";
  }

  let grad = "url(#kc-ordinary)";
  if (kind === "modifier" || kind === "protected") grad = "url(#kc-modifier)";
  else if (kind === "special") grad = "url(#kc-special)";
  if (selected || dragTarget) grad = "url(#kc-active)";

  const stroke = selected ? "var(--accent)" : "var(--key-stroke)";
  const strokeW = selected ? 2.5 : 1;
  const isDead = view?.is_dead ?? false;
  // Only surface inheritance on editable ordinary keys (special keys inherit
  // wholesale in modifier layers and would be noisy).
  const inherited = (view?.inherited ?? false) && kind === "ordinary";

  const handleClick = () => onSelect();
  const handleDouble = () => editable && onEdit();

  const fontSize = main.length > 2 ? unit * 0.26 : unit * 0.38;

  const cx = geo.shape === "l-enter" ? (geo.rects![1].x + (geo.rects![1].w ?? 1) / 2) * unit : x + w / 2;
  const cy = geo.shape === "l-enter" ? (geo.rects![0].y + (geo.rects![1].y + 1)) / 2 * unit : y + h / 2;

  return (
    <g
      role="button"
      aria-label={`key ${geo.code}: ${main || (chip ?? "empty")}`}
      tabIndex={-1}
      data-keycap={editable ? "1" : undefined}
      onClick={handleClick}
      onDoubleClick={handleDouble}
      onContextMenu={onContext}
      style={{
        cursor: editable ? "pointer" : "default",
        opacity: inherited ? 0.8 : 1,
        outline: "none",
      }}
    >
      {geo.shape === "l-enter" ? (
        <polygon
          points={lPolygonPoints(geo.rects!, unit)}
          fill={grad}
          stroke={stroke}
          strokeWidth={strokeW}
          filter="url(#kc-shadow)"
        />
      ) : (
        <>
          <rect
            x={x + pad}
            y={y + pad}
            width={w - pad * 2}
            height={h - pad * 2}
            rx={8}
            ry={8}
            fill={grad}
            stroke={dragTarget ? "var(--accent)" : stroke}
            strokeWidth={strokeW}
            strokeDasharray={dragTarget ? "4 3" : undefined}
            filter="url(#kc-shadow)"
          />
          {/* top bevel highlight for a physical keycap feel */}
          <rect
            x={x + pad + 2}
            y={y + pad + 1.5}
            width={w - pad * 2 - 4}
            height={Math.max(2, (h - pad * 2) * 0.18)}
            rx={5}
            ry={5}
            fill="var(--key-bevel)"
            style={{ pointerEvents: "none" }}
          />
        </>
      )}

      {chip ? (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="ui-monospace, monospace"
          fontSize={unit * 0.2}
          fill="var(--text-muted)"
        >
          {chip}
        </text>
      ) : (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="var(--key-font, inherit)"
          fontSize={fontSize}
          fontWeight={kind === "ordinary" ? 600 : 500}
          fill={faint ? "var(--text-muted)" : "var(--key-text)"}
          style={{ pointerEvents: "none" }}
        >
          {main}
        </text>
      )}

      {isDead && (
        <circle cx={x + w - 9} cy={y + 9} r={3.5} fill="var(--key-dead)" />
      )}
      {inherited && !isDead && (
        <circle cx={x + w - 9} cy={y + 9} r={3} fill="var(--text-muted)" opacity={0.6} />
      )}
    </g>
  );
});
