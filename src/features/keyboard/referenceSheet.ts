// Reference sheet: paginated monochrome render of the keyboard
// for several modifier combinations, exported as a single PNG. The SVG builder
// is pure (unit-tested); the PNG step needs a DOM and runs in the app.

import { SPECIAL_GLYPHS, codePointChip, isControl } from "@/lib/glyphs";
import type { GeoKey, Geometry, KeyView } from "@/lib/types";
import { geometryExtent } from "./geometry";

export interface SheetSection {
  label: string;
  keys: KeyView[];
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// Mirror of KeyCap's legend selection, kept monochrome-text-only.
function legendFor(geo: GeoKey, view: KeyView | undefined): string {
  const kind = geo.kind ?? "ordinary";
  if (kind === "ordinary") {
    const d = view?.display ?? "";
    if (d === "") return "";
    if (isControl(d)) return codePointChip(d.codePointAt(0)!);
    return d;
  }
  return SPECIAL_GLYPHS[geo.code] ?? geo.label ?? "";
}

function keyboardMarkup(
  geo: Geometry,
  viewByCode: Map<number, KeyView>,
  unit: number,
  ox: number,
  oy: number,
): string {
  const parts: string[] = [];
  for (const row of geo.rows) {
    for (const key of row.keys) {
      const rects = key.rects ?? [{ x: key.x, y: key.y ?? row.y, w: key.w ?? 1, h: key.h ?? 1 }];
      for (const r of rects) {
        const x = ox + r.x * unit;
        const y = oy + r.y * unit;
        const w = (r.w ?? 1) * unit;
        const h = (r.h ?? 1) * unit;
        parts.push(
          `<rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="4" fill="none" stroke="#000" stroke-width="1"/>`,
        );
      }
      const main = legendFor(key, viewByCode.get(key.code));
      if (main) {
        const primary = rects[rects.length - 1];
        const cx = ox + (primary.x + (primary.w ?? 1) / 2) * unit;
        const top = Math.min(...rects.map((r) => r.y));
        const bottom = Math.max(...rects.map((r) => r.y + (r.h ?? 1)));
        const cy = oy + ((top + bottom) / 2) * unit;
        const fs = main.length > 2 ? unit * 0.26 : unit * 0.38;
        parts.push(
          `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-family="ui-sans-serif,system-ui,sans-serif" fill="#000">${esc(main)}</text>`,
        );
      }
    }
  }
  return parts.join("");
}

/** Build a standalone monochrome SVG stacking each section's keyboard. */
export function buildReferenceSheetSvg(geo: Geometry, sections: SheetSection[]): string {
  const unit = geo.unit;
  const extent = geometryExtent(geo);
  const kbW = extent.w * unit;
  const kbH = extent.h * unit;
  const margin = 24;
  const labelH = 26;
  const gap = 22;
  const sectionH = labelH + kbH + gap;
  const totalW = Math.ceil(kbW + margin * 2);
  const totalH = Math.ceil(margin * 2 + sections.length * sectionH);

  const body: string[] = [];
  sections.forEach((sec, i) => {
    const oy = margin + i * sectionH;
    body.push(
      `<text x="${margin}" y="${oy + 16}" font-size="15" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="700" fill="#000">${esc(sec.label)}</text>`,
    );
    const map = new Map<number, KeyView>();
    sec.keys.forEach((k) => map.set(k.code, k));
    body.push(keyboardMarkup(geo, map, unit, margin, oy + labelH));
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}"><rect width="100%" height="100%" fill="#fff"/>${body.join("")}</svg>`;
}

/** Rasterise an SVG string to a PNG download (white background, 2× scale). */
export async function downloadSvgAsPng(svg: string, filename: string): Promise<void> {
  const m = /width="(\d+)"\s+height="(\d+)"/.exec(svg);
  const w = m ? Number(m[1]) : 800;
  const h = m ? Number(m[2]) : 600;
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("render failed"));
    img.src = url;
  });

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = filename;
  a.click();
}
