// TS types mirroring keylayout-core (. Keep in lockstep with Rust.

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
export type IssueCategory =
  | "Keyboard"
  | "Layout"
  | "ModifierMap"
  | "KeyMapSet"
  | "KeyMap"
  | "Key"
  | "Action"
  | "DeadState"
  | "Unicode";

export type IssueLocation =
  | { kind: "Keyboard" }
  | { kind: "LayoutRange"; value: { index: number } }
  | { kind: "ModifierMap"; value: { id: string } }
  | { kind: "KeyMapSet"; value: { id: string } }
  | { kind: "KeyMap"; value: { set_id: string; map_index: number } }
  | { kind: "Key"; value: { set_id: string; map_index: number; code: number } }
  | { kind: "Action"; value: { id: string } }
  | { kind: "State"; value: { state: string } };

export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  auto_fixable: boolean;
  category: IssueCategory;
  location: IssueLocation | null;
  affected: string[];
}

export interface ValidationReport {
  issues: Issue[];
  error_count: number;
  warning_count: number;
  auto_fixable_count: number;
  by_category: Record<string, number>;
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

export interface RepairPlan {
  ops: RepairOp[];
}

export interface RepairOp {
  code: string;
  title: string;
  before: string;
  after: string;
  impact: string;
  kind: RepairKind;
}

export type RepairKind =
  | { kind: "AssignKeyboardId" }
  | { kind: "AddSpecialKeys"; set_id: string; map_index: number }
  | { kind: "DropInvalidBase"; set_id: string; map_index: number }
  | { kind: "RepairJis"; set_id: string };

export interface LayerMatrix {
  keyboard_name: string;
  map_set: string;
  key_codes: number[];
  rows: LayerRow[];
}

export interface LayerRow {
  map_index: number;
  modifier_specs: string[];
  cells: LayerCell[];
}

export type LayerCellSource = "Local" | "Inherited" | "Missing";

export interface LayerCell {
  code: number;
  source: LayerCellSource;
  output: string | null;
  action_id: string | null;
  is_dead: boolean;
}

export interface DeadKeyGraph {
  states: string[];
  edges: DeadKeyEdge[];
  terminators: DeadKeyTerminator[];
  unreachable_states: string[];
}

export interface DeadKeyEdge {
  action_id: string;
  from_state: string;
  to_state: string | null;
  output: string | null;
  key_codes: number[];
}

export interface DeadKeyTerminator {
  state: string;
  output: string | null;
}

export interface Comments {
  before: Record<string, string[]>;
}

export interface BundleMetadataView {
  identifier: string;
  name: string;
  version: string;
  build_version: string | null;
  project_name: string | null;
  source_version: string | null;
  layout_count: number;
  localizations: string[];
}

export interface BundleMetadataPatch {
  identifier?: string | null;
  name?: string | null;
  version?: string | null;
  build_version?: string | null;
  project_name?: string | null;
  source_version?: string | null;
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

// Geometry JSON (.
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
