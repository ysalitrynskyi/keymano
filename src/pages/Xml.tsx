// P7 XML preview + validation (.

import * as React from "react";
import { useTranslation } from "react-i18next";
import { Copy, Wrench, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge, Button } from "@/components/ui";
import { ipc } from "@/lib/ipc";
import type { RepairPlan, ValidationReport } from "@/lib/types";
import { useEditor } from "@/store/editor";

export function XmlPage() {
  const { t } = useTranslation("editor");
  const activeDocId = useEditor((s) => s.activeDocId);
  const kbIndex = useEditor((s) => s.kbIndex);
  const issues = useEditor((s) => s.issues);
  const repair = useEditor((s) => s.repair);
  const refreshIssues = useEditor((s) => s.refreshIssues);
  const [xml, setXml] = React.useState("");
  const [codeNonAscii, setCodeNonAscii] = React.useState(false);
  const [report, setReport] = React.useState<ValidationReport | null>(null);
  const [plan, setPlan] = React.useState<RepairPlan | null>(null);

  const loadXml = React.useCallback(async () => {
    if (activeDocId == null) return;
    setXml(await ipc.getXml(activeDocId, kbIndex, codeNonAscii));
    setReport(await ipc.validationReport(activeDocId, kbIndex));
    setPlan(await ipc.repairPlan(activeDocId, kbIndex));
  }, [activeDocId, kbIndex, codeNonAscii]);

  React.useEffect(() => {
    if (activeDocId == null) return;
    void loadXml();
    void refreshIssues();
  }, [activeDocId, loadXml, refreshIssues]);

  if (activeDocId == null) return null;
  const cockpitIssues = report?.issues ?? issues;
  const score = report
    ? Math.max(0, 100 - report.error_count * 30 - report.warning_count * 8)
    : issues.length === 0
      ? 100
      : 70;

  return (
    <div className="flex h-full flex-col gap-4 lg:flex-row" data-tour="tour-page">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm text-[var(--text-muted)]">{t("xml.intro")}</p>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={codeNonAscii}
              onChange={(e) => setCodeNonAscii(e.target.checked)}
            />
            {t("xml.codeNonAscii")}
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const diagnostic = {
                  app: "Keymano",
                  generated_at: new Date().toISOString(),
                  validation: report,
                };
                const blob = new Blob([JSON.stringify(diagnostic, null, 2)], {
                  type: "application/json",
                });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "keymano-diagnostic.json";
                a.click();
                URL.revokeObjectURL(a.href);
              }}
            >
              {t("xml.diagnostic")}
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(xml);
                  toast.success(t("toast.xmlCopied"));
                } catch {
                  toast.error(t("toast.clipboardUnavailable"));
                }
              }}
            >
              <Copy size={14} />
              {t("xml.copy")}
            </Button>
          </div>
        </div>
        <pre dir="ltr" className="min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-left text-xs leading-relaxed">
          <code>{xml}</code>
        </pre>
      </div>

      <aside data-tour="tour-validation" className="w-full shrink-0 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 lg:w-80">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("validation.title")}</h3>
          {(plan?.ops.length ?? 0) > 0 ? (
            <Button
              size="sm"
              variant="accent"
              onClick={async () => {
                await ipc.applyRepairPlan(activeDocId, kbIndex, plan!);
                await refreshIssues();
                await loadXml();
              }}
            >
              <Wrench size={14} />
              {t("validation.repair")}
            </Button>
          ) : cockpitIssues.some((i) => i.auto_fixable) ? (
            <Button
              size="sm"
              variant="accent"
              onClick={async () => {
                await repair();
                await loadXml();
              }}
            >
              <Wrench size={14} />
              {t("validation.repair")}
            </Button>
          ) : null}
        </div>
        <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">{t("validation.score")}</span>
            <Badge tone={score === 100 ? "success" : report?.error_count ? "error" : "warning"}>
              {score}/100
            </Badge>
          </div>
          {report && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(report.by_category).map(([category, count]) => (
                <Badge key={category}>{category}: {count}</Badge>
              ))}
            </div>
          )}
        </div>
        {(plan?.ops.length ?? 0) > 0 && (
          <div className="mb-3 space-y-1 rounded-lg border border-[var(--border)] p-2.5">
            <div className="text-xs font-semibold">{t("validation.repairPreview")}</div>
            {plan!.ops.map((op) => (
              <div key={`${op.code}-${op.title}`} className="text-xs text-[var(--text-muted)]">
                <span className="font-medium text-[var(--text)]">{op.title}</span>: {op.impact}
              </div>
            ))}
          </div>
        )}
        {cockpitIssues.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 size={16} />
            {t("validation.clean")}
          </p>
        ) : (
          <ul className="space-y-2">
            {cockpitIssues.map((issue, i) => (
              <li key={i} className="rounded-lg border border-[var(--border)] p-2.5">
                <div className="mb-1 flex items-center gap-2">
                  {issue.severity === "Error" ? (
                    <XCircle size={14} className="text-red-400" />
                  ) : (
                    <AlertTriangle size={14} className="text-amber-400" />
                  )}
                  <span className="text-xs font-semibold">{issue.code}</span>
                  {issue.auto_fixable && <Badge tone="success">{t("validation.fixable")}</Badge>}
                  {issue.category && <Badge>{issue.category}</Badge>}
                </div>
                <p className="text-xs text-[var(--text-muted)]">{issue.message}</p>
                {issue.affected?.length > 0 && (
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    {t("validation.affected")}: {issue.affected.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
