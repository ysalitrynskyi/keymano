// Export the live keyboard <svg> to a PNG. CSS custom properties are inlined as
// a <style> so the gradients/colours resolve inside the isolated SVG image.

const THEME_VARS = [
  "--key-fill-top",
  "--key-fill-bot",
  "--key-fill-active-top",
  "--key-fill-active-bot",
  "--key-modifier-top",
  "--key-modifier-bot",
  "--key-special-top",
  "--key-special-bot",
  "--key-stroke",
  "--key-text",
  "--key-font",
  "--key-dead",
  "--key-bevel",
  "--key-shadow",
  "--accent",
  "--text-muted",
  "--panel",
  "--bg",
];

export async function exportKeyboardPng(filename: string): Promise<void> {
  const svg = document.querySelector<SVGSVGElement>('[data-testid="keyboard-svg"]');
  if (!svg) throw new Error("No keyboard to export");

  const cs = getComputedStyle(document.documentElement);
  const decls = THEME_VARS.map((v) => `${v}:${cs.getPropertyValue(v).trim()}`).join(";");

  const clone = svg.cloneNode(true) as SVGSVGElement;
  const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
  styleEl.textContent = `:root{${decls}}`;
  clone.insertBefore(styleEl, clone.firstChild);

  const w = svg.width.baseVal.value || svg.viewBox.baseVal.width;
  const h = svg.height.baseVal.value || svg.viewBox.baseVal.height;
  const xml = new XMLSerializer().serializeToString(clone);
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);

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
  ctx.fillStyle = cs.getPropertyValue("--panel").trim() || "#1b150d";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = filename;
  a.click();
}
