import * as React from "react";

import type { Geometry } from "@/lib/types";

type Direction = "left" | "right" | "up" | "down";

export function useKeyboardNavigation(
  geo: Geometry,
  selectedCode: number | null,
  selectKey: (code: number | null) => void,
) {
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

  return React.useCallback(
    (dir: Direction) => {
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
    },
    [centers, selectedCode, selectKey],
  );
}
