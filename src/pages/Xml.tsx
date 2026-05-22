// P7 XML preview + validation (.

import * as React from "react";
import { useTranslation } from "react-i18next";
import { Copy, Wrench, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge, Button } from "@/components/ui";
import { ipc } from "@/lib/ipc";
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

  React.useEffect(() => {
    if (activeDocId == null) return;
    void ipc.getXml(activeDocId, kbIndex, codeNonAscii).then(setXml);
    void refreshIssues();
  }, [activeDocId, kbIndex, codeNonAscii, refreshIssues]);

  if (activeDocId == null) return null;

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
        <pre dir="ltr" className="min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-left text-xs leading-relaxed">
          <code>{xml}</code>
        </pre>
      </div>

      <aside data-tour="tour-validation" className="w-full shrink-0 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 lg:w-80">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("validation.title")}</h3>
          {issues.some((i) => i.auto_fixable) && (
            <Button size="sm" variant="accent" onClick={() => void repair()}>
              <Wrench size={14} />
              {t("validation.repair")}
            </Button>
          )}
        </div>
        {issues.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 size={16} />
            {t("validation.clean")}
          </p>
        ) : (
          <ul className="space-y-2">
            {issues.map((issue, i) => (
              <li key={i} className="rounded-lg border border-[var(--border)] p-2.5">
                <div className="mb-1 flex items-center gap-2">
                  {issue.severity === "Error" ? (
                    <XCircle size={14} className="text-red-400" />
                  ) : (
                    <AlertTriangle size={14} className="text-amber-400" />
                  )}
                  <span className="text-xs font-semibold">{issue.code}</span>
                  {issue.auto_fixable && <Badge tone="success">fixable</Badge>}
                </div>
                <p className="text-xs text-[var(--text-muted)]">{issue.message}</p>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
