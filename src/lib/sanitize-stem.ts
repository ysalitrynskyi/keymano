// Mirror of `keylayout-core::bundle::sanitize_stem` — used by the UI to show
// preview filenames that match what the wasm core actually writes into the
// .bundle archive. The Rust version is the source of truth (`bundle.rs`);
// this is a TS port for *display only*. If they drift, the unit test fails
// and the Bundle page's "what's inside" tree starts lying.
//
// Rules (per bundle.rs comments):
//   - replace path separators (`/`, `\`, `:`), control chars, and
//     bidi/format controls with `-`
//   - trim whitespace, then strip leading/trailing `.` and `-`
//   - fall back to "Keyboard Layout" when nothing usable remains

const BIDI_FORMAT_CONTROL_CODEPOINTS: ReadonlyArray<[number, number]> = [
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];
const SINGLE_BIDI_CONTROLS: ReadonlySet<number> = new Set([0x200e, 0x200f, 0x061c]);

function isBidiControl(cp: number): boolean {
  if (SINGLE_BIDI_CONTROLS.has(cp)) return true;
  for (const [lo, hi] of BIDI_FORMAT_CONTROL_CODEPOINTS) {
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

function isControl(cp: number): boolean {
  // Rust's char::is_control = Unicode general category Cc (C0 + C1 + DEL).
  return cp <= 0x1f || cp === 0x7f || (cp >= 0x80 && cp <= 0x9f);
}

export function sanitizeStem(name: string): string {
  let out = "";
  for (const ch of name) {
    const cp = ch.codePointAt(0)!;
    if (
      ch === "/" ||
      ch === "\\" ||
      ch === ":" ||
      isControl(cp) ||
      isBidiControl(cp)
    ) {
      out += "-";
    } else {
      out += ch;
    }
  }
  // Drop surrounding whitespace, then strip the trim characters `.` and `-`.
  // (Replicates Rust's `s.trim().trim_matches(|c| c == '.' || c == '-')`.)
  return out.trim().replace(/^[.-]+|[.-]+$/g, "") || "Keyboard Layout";
}
