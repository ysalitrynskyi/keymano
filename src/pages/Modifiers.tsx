// P4 Modifiers editor (. Shows the active layout's real modifier map:
// each keyMapSelect row with its tokens and which physical combos it covers.

import * as React from "react";
import { useTranslation } from "react-i18next";

import { Badge, Button, Input } from "@/components/ui";
import { ipc } from "@/lib/ipc";
import type { LayerMatrix, ModifierSelectView } from "@/lib/types";
import { useEditor, TYPE_CODE } from "@/store/editor";

export function ModifiersPage() {
  const { t } = useTranslation("editor");
  const activeDocId = useEditor((s) => s.activeDocId);
  const kbIndex = useEditor((s) => s.kbIndex);
  const kbType = useEditor((s) => s.kbType);
  const refreshSnapshot = useEditor((s) => s.refreshSnapshot);
  const refreshDocs = useEditor((s) => s.refreshDocs);
  const refreshIssues = useEditor((s) => s.refreshIssues);
  const [rows, setRows] = React.useState<ModifierSelectView[] | null>(null);
  const [matrix, setMatrix] = React.useState<LayerMatrix | null>(null);

  const reload = React.useCallback(() => {
    if (activeDocId == null) return;
    void ipc
      .modifierMapView(activeDocId, kbIndex, TYPE_CODE[kbType])
      .then(setRows)
      .catch(() => setRows([]));
    void ipc
      .layerMatrix(activeDocId, kbIndex, TYPE_CODE[kbType], true)
      .then(setMatrix)
      .catch(() => setMatrix(null));
  }, [activeDocId, kbIndex, kbType]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  if (activeDocId == null) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6" data-tour="tour-page">
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

      {matrix && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{t("layerMatrix.title")}</h3>
              <p className="text-xs text-[var(--text-muted)]">{t("layerMatrix.help")}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const base = matrix.rows.find((row) => row.map_index === 0);
                const shift =
                  matrix.rows.find((row) =>
                    row.modifier_specs.some((spec) => /shift/i.test(spec)),
                  ) ?? matrix.rows.find((row) => row.map_index !== 0);
                if (!base || !shift || activeDocId == null) return;
                for (const cell of base.cells) {
                  const upper = cell.output?.length === 1 ? cell.output.toUpperCase() : null;
                  if (upper && upper !== cell.output) {
                    await ipc.setKeyOutputInMap(
                      activeDocId,
                      kbIndex,
                      matrix.map_set,
                      shift.map_index,
                      cell.code,
                      upper,
                    );
                  }
                }
                await refreshSnapshot();
                await refreshDocs();
                await refreshIssues();
                reload();
              }}
            >
              {t("layerMatrix.fillShift")}
            </Button>
          </div>
          <div className="max-h-[420px] overflow-auto rounded-xl border border-[var(--border)]">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-[var(--panel-2)] text-left text-[var(--text-muted)]">
                <tr>
                  <th className="sticky left-0 z-10 bg-[var(--panel-2)] px-3 py-2">
                    {t("modifiers.index")}
                  </th>
                  {matrix.key_codes.slice(0, 80).map((code) => (
                    <th key={code} className="px-2 py-2 text-center tabular-nums">
                      {code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.map_index} className="border-t border-[var(--border)]">
                    <td className="sticky left-0 bg-[var(--panel)] px-3 py-2 font-medium">
                      <div>{row.map_index}</div>
                      <div className="max-w-28 truncate text-[10px] text-[var(--text-muted)]">
                        {row.modifier_specs.join(" · ") || "—"}
                      </div>
                    </td>
                    {row.cells.slice(0, 80).map((cell) => (
                      <td key={cell.code} className="min-w-14 px-1 py-1">
                        <Input
                          aria-label={`${row.map_index}:${cell.code}`}
                          defaultValue={cell.output ?? ""}
                          className={
                            "h-7 min-w-12 px-1 text-center text-xs " +
                            (cell.source === "Inherited" ? "opacity-70" : "")
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          onBlur={async (e) => {
                            if (activeDocId == null || e.target.value === (cell.output ?? "")) return;
                            await ipc.setKeyOutputInMap(
                              activeDocId,
                              kbIndex,
                              matrix.map_set,
                              row.map_index,
                              cell.code,
                              e.target.value,
                            );
                            await refreshSnapshot();
                            await refreshDocs();
                            await refreshIssues();
                            reload();
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">{t("layerMatrix.limitNote")}</p>
        </div>
      )}
    </div>
  );
}
