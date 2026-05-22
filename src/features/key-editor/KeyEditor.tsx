// Key output / dead-key editor (docs/08 P3). Modal dialog form.

import * as React from "react";
import { useTranslation } from "react-i18next";

import { Button, Card, Input, Label } from "@/components/ui";
import { useEditor } from "@/store/editor";

export function KeyEditor({ code, onClose }: { code: number; onClose: () => void }) {
  const { t } = useTranslation("editor");
  const snapshot = useEditor((s) => s.snapshot);
  const setKeyOutput = useEditor((s) => s.setKeyOutput);
  const clearKey = useEditor((s) => s.clearKey);
  const makeKeyDead = useEditor((s) => s.makeKeyDead);

  const view = snapshot?.keys.find((k) => k.code === code);
  const [output, setOutput] = React.useState(view?.output ?? "");
  const [tab, setTab] = React.useState<"output" | "dead">("output");
  const [state, setState] = React.useState("acute");
  const [terminator, setTerminator] = React.useState("´");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    // Restore focus to the element that opened the dialog on close (P3-10).
    const opener = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  const confirm = async () => {
    if (tab === "output") {
      await setKeyOutput(code, output);
    } else {
      if (!state.trim()) return; // need a state name
      await makeKeyDead(code, state.trim(), terminator);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("keyeditor.title", { code })}
    >
      <Card className="w-[420px] max-w-[calc(100vw-2rem)] p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-semibold">{t("keyeditor.title", { code })}</h2>

        <div className="mb-4 inline-flex rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-0.5">
          {(["output", "dead"] as const).map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={
                "h-7 rounded-md px-3 text-xs font-medium " +
                (tab === tb ? "bg-[var(--panel)] shadow-sm" : "text-[var(--text-muted)]")
              }
            >
              {tb === "output" ? t("keyeditor.outputLabel") : t("keyeditor.makeDead")}
            </button>
          ))}
        </div>

        {tab === "output" ? (
          <div className="space-y-2">
            <Label htmlFor="ke-output">{t("keyeditor.outputLabel")}</Label>
            <Input
              id="ke-output"
              ref={inputRef}
              value={output}
              placeholder={t("keyeditor.outputPlaceholder")}
              onChange={(e) => setOutput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirm()}
            />
            <p className="text-xs text-[var(--text-muted)]">
              {[...output].map((c) => "U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")).join(" ")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ke-state">{t("keyeditor.deadState")}</Label>
              <Input id="ke-state" value={state} onChange={(e) => setState(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ke-term">{t("keyeditor.terminator")}</Label>
              <Input id="ke-term" value={terminator} onChange={(e) => setTerminator(e.target.value)} />
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await clearKey(code);
              onClose();
            }}
          >
            {t("keyeditor.clear")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("keyeditor.cancel")}
            </Button>
            <Button
              variant="accent"
              size="sm"
              onClick={confirm}
              disabled={tab === "dead" && !state.trim()}
            >
              {t("keyeditor.confirm")}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
