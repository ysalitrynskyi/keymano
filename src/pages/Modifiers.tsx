// P4 Modifiers editor (. Shows the active layout's real modifier map:
// each keyMapSelect row with its tokens and which physical combos it covers.

import * as React from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui";
import { ipc } from "@/lib/ipc";
import type { ModifierSelectView } from "@/lib/types";
import { useEditor, TYPE_CODE } from "@/store/editor";

export function ModifiersPage() {
  const { t } = useTranslation("editor");
  const activeDocId = useEditor((s) => s.activeDocId);
  const kbIndex = useEditor((s) => s.kbIndex);
  const kbType = useEditor((s) => s.kbType);
  const [rows, setRows] = React.useState<ModifierSelectView[] | null>(null);

  React.useEffect(() => {
    if (activeDocId == null) return;
    ipc
      .modifierMapView(activeDocId, kbIndex, TYPE_CODE[kbType])
      .then(setRows)
      .catch(() => setRows([]));
  }, [activeDocId, kbIndex, kbType]);

  if (activeDocId == null) return null;

  return (
    <div className="mx-auto max-w-2xl" data-tour="tour-page">
      <h2 className="font-display mb-4 text-xl font-semibold">{t("modifiers.title")}</h2>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-[var(--panel-2)] text-left text-xs text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-2.5">{t("modifiers.index")}</th>
              <th className="px-4 py-2.5">{t("modifiers.tokens")}</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((row, i) => (
              <tr key={i} className="border-t border-[var(--border)]">
                <td className="px-4 py-2.5 font-medium tabular-nums">{row.map_index}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {row.specs.every((s) => s.trim() === "") ? (
                      <span className="text-[var(--text-muted)]">(none)</span>
                    ) : (
                      row.specs.flatMap((spec, si) =>
                        spec
                          .split(/\s+/)
                          .filter(Boolean)
                          .map((tok) => <Badge key={`${si}-${tok}`}>{tok}</Badge>),
                      )
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[var(--text-muted)]">{t("modifiers.note")}</p>
    </div>
  );
}
