// P5 Dead keys & actions editor — view the state machine, edit terminator
// outputs, and run housekeeping. (docs/08, docs/12 §3–4)

import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge, Button, Card, Input } from "@/components/ui";
import { ipc } from "@/lib/ipc";
import type { ActionsView } from "@/lib/types";
import { useEditor } from "@/store/editor";

export function DeadKeysPage() {
  const { t } = useTranslation("editor");
  const activeDocId = useEditor((s) => s.activeDocId);
  const kbIndex = useEditor((s) => s.kbIndex);
  const refreshSnapshot = useEditor((s) => s.refreshSnapshot);
  const refreshDocs = useEditor((s) => s.refreshDocs);
  const refreshIssues = useEditor((s) => s.refreshIssues);
  const [view, setView] = React.useState<ActionsView | null>(null);

  const reload = React.useCallback(async () => {
    if (activeDocId == null) return;
    try {
      setView(await ipc.actionsView(activeDocId, kbIndex));
    } catch {
      setView(null);
    }
  }, [activeDocId, kbIndex]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  if (activeDocId == null || !view) return null;

  const afterEdit = async () => {
    await reload();
    await refreshSnapshot();
    await refreshDocs();
    await refreshIssues();
  };

  const terminatorFor = (state: string) =>
    view.terminators.find((w) => w.state === state)?.output ?? "";

  const housekeep = async (
    label: string,
    fn: () => Promise<number>,
    noun: "states" | "actions" | "keys",
  ) => {
    const n = await fn();
    toast.message(
      n > 0
        ? t("deadkeys.housekeepDone", {
            label,
            count: n,
            item: t(`deadkeys.noun.${noun}`, { count: n }),
          })
        : t("deadkeys.housekeepNothing", { label }),
    );
    await afterEdit();
  };

  const editableStates = view.states.filter((s) => s !== "none");

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-tour="tour-page">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">{t("deadkeys.title")}</h2>
        <div className="flex gap-2" data-tour="tour-housekeeping">
          <Button size="sm" variant="outline" onClick={() => void housekeep(t("deadkeys.removeStates"), () => ipc.removeUnusedStates(activeDocId, kbIndex), "states")}>
            {t("deadkeys.removeStates")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void housekeep(t("deadkeys.removeActions"), () => ipc.removeUnusedActions(activeDocId, kbIndex), "actions")}>
            {t("deadkeys.removeActions")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void housekeep(t("deadkeys.addSpecial"), () => ipc.addSpecialKeys(activeDocId, kbIndex), "keys")}>
            {t("deadkeys.addSpecial")}
          </Button>
        </div>
      </div>

      <p className="-mt-3 text-sm text-[var(--text-muted)]">{t("deadkeys.intro")}</p>

      <div>
        <h3 className="mb-2 text-sm font-semibold">{t("deadkeys.states")}</h3>
        {editableStates.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t("deadkeys.noActions")}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--panel-2)] text-left text-xs text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-2.5">{t("deadkeys.states")}</th>
                  <th className="px-4 py-2.5">{t("deadkeys.terminator")}</th>
                </tr>
              </thead>
              <tbody>
                {editableStates.map((s) => (
                  <tr key={s} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2 font-medium">
                      <Badge tone="warning">{s}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        defaultValue={terminatorFor(s)}
                        aria-label={`${t("deadkeys.terminator")} ${s}`}
                        className="h-8 w-40"
                        onBlur={async (e) => {
                          await ipc.setTerminator(activeDocId, kbIndex, s, e.target.value);
                          await afterEdit();
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">{t("deadkeys.actions")}</h3>
        {view.actions.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t("deadkeys.noActions")}</p>
        ) : (
          <div className="space-y-2">
            {view.actions.map((a) => (
              <Card key={a.id} className="p-3 text-sm">
                <div className="mb-1.5 font-mono text-xs text-[var(--accent)]">{a.id}</div>
                <ul className="space-y-0.5">
                  {a.whens.map((w, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <span className="font-medium text-[var(--text)]">{w.state}</span>
                      {w.next && <span>→ {w.next}</span>}
                      {w.output && <span>= {JSON.stringify(w.output)}</span>}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
