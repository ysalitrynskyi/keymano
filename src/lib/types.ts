// TS types mirroring keylayout-core (docs/07). Keep in lockstep with Rust.

export interface KeyView {
  code: number;
  output: string | null;
  is_dead: boolean;
  action_id: string | null;
  display: string;
  code_points: number[];
  inherited: boolean;
}

export interface KeyboardSnapshot {
  keyboard_name: string;
  modifier_index: number;
  dead_state: string;
  keys: KeyView[];
  available_modifier_indices: number[];
  dead_states: string[];
  mask_covered: boolean;
}

export interface DocSummary {
  id: number;
  name: string;
  path: string | null;
  is_bundle: boolean;
  keyboard_names: string[];
  dirty: boolean;
}

export interface RecentFile {
  path: string;
  name: string;
  ts: number;
}

export type Severity = "Error" | "Warning";

export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  auto_fixable: boolean;
}

export interface When {
  state: string;
  output: string | null;
  next: string | null;
  through: string | null;
  multiplier: string | null;
}
export interface Action {
  id: string;
  whens: When[];
}
export interface ActionsView {
  actions: Action[];
  terminators: When[];
  states: string[];
}

export interface ModifierSelectView {
  map_index: number;
  specs: string[];
}

export type SaveFormat = "keylayout" | "bundle";

export interface InstalledLayout {
  name: string;
  path: string;
  is_bundle: boolean;
  scope: "user" | "system";
}

export interface InputSource {
  name: string;
  /** Editable source file, or null for a sealed macOS built-in. */
  file: string | null;
}

export type TemplateName = "basic" | "standard";

// Physical modifier bitmask bits — must match Rust ModMask.
export const Mod = {
  ShiftL: 1 << 0,
  ShiftR: 1 << 1,
  OptionL: 1 << 2,
  OptionR: 1 << 3,
  ControlL: 1 << 4,
  ControlR: 1 << 5,
  Command: 1 << 6,
  Caps: 1 << 7,
} as const;

// Geometry JSON (docs/04).
export type KeyKind = "ordinary" | "modifier" | "special" | "protected";

export interface GeoRect {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface GeoKey {
  code: number;
  x: number;
  y?: number;
  w?: number;
  h?: number;
  label?: string;
  kind?: KeyKind;
  shape?: "l-enter";
  rects?: GeoRect[];
}

export interface GeoRow {
  y: number;
  keys: GeoKey[];
}

export interface Geometry {
  id: string;
  name: string;
  type: "ANSI" | "ISO" | "JIS";
  unit: number;
  rows: GeoRow[];
}
