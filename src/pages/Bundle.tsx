// P6 Bundle manager (. Metadata + layouts overview.

import { useTranslation } from "react-i18next";
import { Package, Wand2 } from "lucide-react";

import { Badge, Button, Card, Input } from "@/components/ui";
import { useEditor } from "@/store/editor";

export function BundlePage() {
  const { t } = useTranslation("editor");
  const docs = useEditor((s) => s.docs);
  const activeDocId = useEditor((s) => s.activeDocId);
  const exportBundle = useEditor((s) => s.exportBundle);
  const renameDoc = useEditor((s) => s.renameDoc);
  const generateName = useEditor((s) => s.generateName);
  const doc = docs.find((d) => d.id === activeDocId);
  if (!doc) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-4" data-tour="tour-page">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">{t("bundle.title")}</h2>
        <Button size="sm" variant="accent" onClick={() => void exportBundle()}>
          <Package size={14} />
          {t("bundle.export")}
        </Button>
      </div>
      <p className="text-sm text-[var(--text-muted)]">{t("bundle.intro")}</p>
      <Card className="space-y-2 p-4 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="shrink-0 text-[var(--text-muted)]">{t("bundle.name")}</span>
          <div className="flex items-center gap-1.5">
            <Input
              key={doc.name}
              defaultValue={doc.name}
              aria-label={t("bundle.name")}
              dir="auto"
              className="h-8 w-48 text-right"
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== doc.name && activeDocId != null) void renameDoc(activeDocId, v);
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => void generateName()}
              aria-label={t("action.generateName", { ns: "common" })}
              title={t("action.generateName", { ns: "common" })}
            >
              <Wand2 size={15} />
            </Button>
          </div>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("bundle.identifier")}</span>
          <span dir="ltr" className="font-mono text-xs">
            com.apple.keyboardlayout.{doc.name.replace(/[^A-Za-z0-9_-]/g, "")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">{t("bundle.type")}</span>
          <Badge>{doc.is_bundle ? "bundle" : "standalone"}</Badge>
        </div>
      </Card>

      <div>
        <h3 className="mb-2 text-sm font-semibold">{t("bundle.layouts")}</h3>
        <ul className="space-y-1.5">
          {doc.keyboard_names.map((name, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <span className="font-medium">{name}</span>
              <span dir="ltr" className="text-xs text-[var(--text-muted)]">{name}.keylayout</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
