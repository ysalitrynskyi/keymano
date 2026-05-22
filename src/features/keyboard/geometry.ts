import ansi from "@/assets/keyboards/ansi.json";
import iso from "@/assets/keyboards/iso.json";
import jis from "@/assets/keyboards/jis.json";
import type { Geometry } from "@/lib/types";
import type { KbType } from "@/store/editor";

const MAP: Record<KbType, Geometry> = {
  ansi: ansi as Geometry,
  iso: iso as Geometry,
  jis: jis as Geometry,
};

export function geometryFor(type: KbType): Geometry {
  return MAP[type];
}

/** Bounding extent in key units. */
export function geometryExtent(geo: Geometry): { w: number; h: number } {
  let w = 0;
  let h = 0;
  for (const row of geo.rows) {
    for (const key of row.keys) {
      const rects = key.rects ?? [{ x: key.x, y: key.y ?? row.y, w: key.w ?? 1, h: key.h ?? 1 }];
      for (const r of rects) {
        w = Math.max(w, r.x + (r.w ?? 1));
        h = Math.max(h, r.y + (r.h ?? 1));
      }
    }
  }
  return { w, h };
}
