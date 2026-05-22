// P2 Editor — the core page (.

import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link2Off, Link2, ArrowLeftRight, Pencil, Search, Image, FileText } from "lucide-react";
import { toast } from "sonner";

import { Badge, Button, Chip, Input, Segmented } from "@/components/ui";
import { Keyboard } from "@/features/keyboard/Keyboard";
import { KeyContextMenu } from "@/features/keyboard/KeyContextMenu";
import { exportKeyboardPng } from "@/features/keyboard/exportImage";
import { KeyEditor } from "@/features/key-editor/KeyEditor";
import { Mod } from "@/lib/types";
import { useEditor, type KbType, type InteractionMode } from "@/store/editor";

function ModifierBar() {
  const { t } = useTranslation("editor");
  const modMask = useEditor((s) => s.modMask);
  const toggleMod = useEditor((s) => s.toggleMod);
  const snapshot = useEditor((s) => s.snapshot);
  const chips: Array<[string, number]> = [
    [t("modifier.shift"), Mod.ShiftL],
    [t("modifier.option"), Mod.OptionL],
    [t("modifier.control"), Mod.ControlL],
    [t("modifier.command"), Mod.Command],
    [t("modifier.caps"), Mod.Caps],
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map(([label, bit]) => (
        <Chip key={label} active={(modMask & bit) !== 0} onClick={() => toggleMod(bit)}>
          {label}
        </Chip>
      ))}
      {snapshot && (
        <Badge tone={snapshot.mask_covered ? "neutral" : "warning"} className="ml-1">
          map {snapshot.modifier_index}
          {!snapshot.mask_covered && " · default"}
        </Badge>
      )}
    </div>
  );
}

function DeadStateSelect() {
  const { t } = useTranslation("editor");
  const snapshot = useEditor((s) => s.snapshot);
  const deadState = useEditor((s) => s.deadState);
  const setDeadState = useEditor((s) => s.setDeadState);
  const states = snapshot?.dead_states ?? ["none"];
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-[var(--text-muted)]">{t("inspector.action")}</span>
      <select
        value={deadState}
        onChange={(e) => setDeadState(e.target.value)}
        aria-label={t("status.deadState", { ns: "common" })}
        className="km-select h-8 rounded-lg border border-[var(--border)] bg-[var(--panel)] text-sm"
      >
        {states.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toolbar() {
  const { t } = useTranslation("editor");
  const mode = useEditor((s) => s.interactionMode);
  const setMode = useEditor((s) => s.setMode);
  const quickEntry = useEditor((s) => s.quickEntry);
  const toggleQuickEntry = useEditor((s) => s.toggleQuickEntry);
  const tools: Array<[InteractionMode, string, React.ReactNode]> = [
    ["idle", t("tool.edit"), <Pencil size={14} key="e" />],
    ["unlinkKey", t("tool.unlink"), <Link2Off size={14} key="u" />],
    ["relinkKey", t("tool.relink"), <Link2 size={14} key="r" />],
    ["swapKeys", t("tool.swap"), <ArrowLeftRight size={14} key="s" />],
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-0.5">
        {tools.map(([m, label, icon]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium " +
              (mode === m ? "bg-[var(--panel)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text)]")
            }
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
      <Chip active={quickEntry} onClick={toggleQuickEntry} title={t("tool.quickEntryHint")}>
        {t("tool.quickEntry")}
      </Chip>
    </div>
  );
}

function FindBar() {
  const { t } = useTranslation("editor");
  const snapshot = useEditor((s) => s.snapshot);
  const selectKey = useEditor((s) => s.selectKey);
  const [mode, setMode] = React.useState<"output" | "code">("output");
  const [q, setQ] = React.useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!snapshot || !q.trim()) return;
    if (mode === "code") {
      const n = parseInt(q.trim(), 10);
      if (n >= 0 && n <= 127) {
        selectKey(n);
      } else {
        toast.error(t("find.codePlaceholder"));
      }
    } else {
      // Substring + case-insensitive search by output string (.
      const needle = q.trim().toLowerCase();
      const k = snapshot.keys.find(
        (key) =>
          (key.output ?? "").toLowerCase().includes(needle) ||
          (key.display ?? "").toLowerCase().includes(needle),
      );
      if (k) selectKey(k.code);
      else toast.message(t("find.noMatch", { q }));
    }
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-1.5">
      <Search size={14} className="text-[var(--text-muted)]" />
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "output", label: t("find.modeOutput") },
          { value: "code", label: t("find.modeCode") },
        ]}
      />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={mode === "code" ? t("find.codePlaceholder") : t("find.placeholder")}
        aria-label={mode === "code" ? t("find.byCode") : t("find.byOutput")}
        className="h-7 w-36"
      />
      <Button size="sm" type="submit" variant="outline">
        {t("find.go")}
      </Button>
    </form>
  );
}

function Inspector({ onEdit }: { onEdit: (code: number) => void }) {
  const { t } = useTranslation("editor");
  const selectedCode = useEditor((s) => s.selectedCode);
  const snapshot = useEditor((s) => s.snapshot);
  const deadState = useEditor((s) => s.deadState);
  const view = snapshot?.keys.find((k) => k.code === selectedCode);

  if (selectedCode == null || !view) {
    return <p className="text-sm text-[var(--text-muted)]">{t("inspector.noSelection")}</p>;
  }
  const editLocked = deadState !== "none";
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
  return (
    <div className="space-y-1">
      {row(t("inspector.code"), view.code)}
      {row(t("inspector.output"), view.output === null ? "—" : JSON.stringify(view.output))}
      {row(t("inspector.display"), view.display || "—")}
      {row(
        t("inspector.codePoints"),
        view.code_points.map((c) => "U+" + c.toString(16).toUpperCase().padStart(4, "0")).join(" ") || "—",
      )}
      {view.is_dead && row(t("inspector.isDead"), <Badge tone="warning">dead</Badge>)}
      {view.action_id && row(t("inspector.action"), view.action_id)}
      {view.inherited && row(t("inspector.inherited"), <Badge>base</Badge>)}
      <Button
        className="mt-3 w-full"
        variant="accent"
        size="sm"
        disabled={editLocked}
        title={editLocked ? t("inspector.editLockedHint") : undefined}
        onClick={() => onEdit(view.code)}
      >
        <Pencil size={14} />
        {t("inspector.editOutput")}
      </Button>
      {editLocked && (
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">{t("inspector.editLockedHint")}</p>
      )}
    </div>
  );
}

export function EditorPage() {
  const { t } = useTranslation();
  const { t: te } = useTranslation("editor");
  const kbType = useEditor((s) => s.kbType);
  const setKbType = useEditor((s) => s.setKbType);
  const snapshot = useEditor((s) => s.snapshot);
  const zoom = useEditor((s) => s.zoom);
  const setZoom = useEditor((s) => s.setZoom);
  const exportReferenceSheet = useEditor((s) => s.exportReferenceSheet);
  const [editing, setEditing] = React.useState<number | null>(null);
  const [ctxMenu, setCtxMenu] = React.useState<{ code: number; x: number; y: number } | null>(null);

  return (
    <div className="flex h-full flex-col gap-4 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div data-tour="tour-modbar">
            <ModifierBar />
          </div>
          <div className="flex items-center gap-3">
            <DeadStateSelect />
            <div data-tour="tour-kbtype">
              <Segmented<KbType>
                value={kbType}
                onChange={setKbType}
                options={[
                  { value: "ansi", label: t("kbtype.ansi") },
                  { value: "iso", label: t("kbtype.iso") },
                  { value: "jis", label: t("kbtype.jis") },
                ]}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div data-tour="tour-tools">
            <Toolbar />
          </div>
          <div data-tour="tour-find">
            <FindBar />
          </div>
          <div data-tour="tour-export" className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await exportKeyboardPng(
                    `${snapshot?.keyboard_name || t("refSheet.filename", { ns: "common" })}.png`,
                  );
                } catch (e) {
                  toast.error(
                    e instanceof Error
                      ? e.message
                      : t("toast.exportFailed", { ns: "common" }),
                  );
                }
              }}
              title={t("status.exportPng")}
            >
              <Image size={14} />
              PNG
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void exportReferenceSheet()}
              title={t("status.exportSheet")}
            >
              <FileText size={14} />
              {t("status.sheet")}
            </Button>
            <span>{t("status.zoom")}</span>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label={t("status.zoom")}
            />
            <span className="w-10 tabular-nums">{Math.round(zoom * 100)}%</span>
          </div>
        </div>

        <div className="min-h-0 flex-1" data-tour="tour-keyboard">
          <Keyboard
            onEditKey={(c) => setEditing(c)}
            onContextKey={(code, x, y) => setCtxMenu({ code, x, y })}
          />
        </div>
      </div>

      <aside data-tour="tour-inspector" className="w-full shrink-0 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 lg:w-72">
        <h3 className="font-display mb-3 text-base font-semibold">{te("inspector.title")}</h3>
        <Inspector onEdit={(c) => setEditing(c)} />
      </aside>

      {editing != null && <KeyEditor key={editing} code={editing} onClose={() => setEditing(null)} />}
      {ctxMenu && (
        <KeyContextMenu
          code={ctxMenu.code}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onEdit={(c) => setEditing(c)}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
