// Special-key glyphs + display helpers (.

export const SPECIAL_GLYPHS: Record<number, string> = {
  56: "⇧", // shift L
  60: "⇧", // shift R
  59: "⌃", // control L
  62: "⌃", // control R
  58: "⌥", // option L
  61: "⌥", // option R
  55: "⌘", // command L
  54: "⌘", // command R
  57: "⇪", // caps
  36: "↩", // return
  76: "⌤", // enter
  48: "⇥", // tab
  51: "⌫", // delete back
  117: "⌦", // forward delete
  53: "esc",
  49: "space",
  123: "←",
  124: "→",
  126: "↑",
  125: "↓",
  116: "⇞",
  121: "⇟",
  115: "↖",
  119: "↘",
};

/** Human-readable label for a control / non-printable code point. */
export function codePointChip(cp: number): string {
  return "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
}

/** Is a single-char string non-printable (control)? */
export function isControl(s: string): boolean {
  if (s.length === 0) return false;
  const cp = s.codePointAt(0)!;
  return cp <= 0x1f || cp === 0x7f || (cp >= 0x80 && cp <= 0x9f);
}
