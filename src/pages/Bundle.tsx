// Bundle manager: metadata, file-tree preview, platform-aware export + install
// instructions. A `.bundle` is a macOS keyboard package (a directory with one
// or more layouts, an `Info.plist`, and translated display names). Browsers
// can't write directories, so the web build downloads it as a zip the user
// unzips back into a real `.bundle` (handled in `ipc.exportBundleDialog`).

import { useTranslation } from "react-i18next";
import { Package, Wand2 } from "lucide-react";

import { Badge, Button, Card, Input } from "@/components/ui";
import { ipc } from "@/lib/ipc";
import { sanitizeStem } from "@/lib/sanitize-stem";
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
  const web = !ipc.isTauri;

  // Two different slugs, both matching keylayout-core::bundle:
  //   - identifier: CFBundleIdentifier must be ASCII reverse-DNS (strict).
  //   - file stem: permissive, keeps Unicode letters so a Cyrillic / Japanese
  //     name survives into the actual on-disk filename (sanitize_stem).
  // The "what's inside" tree below uses the latter; using the strict
  // identifier slug there would lie about the archive contents.
  const idSlug = doc.name.replace(/[^A-Za-z0-9-]/g, "-").replace(/^-+|-+$/g, "") || "layout";
  const identifier = `app.keymano.layouts.${idSlug}`;
  const bundleStem = sanitizeStem(doc.name);

  return (
    <div className="mx-auto max-w-2xl space-y-4" data-tour="tour-page">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">{t("bundle.title")}</h2>
        <Button size="sm" variant="accent" onClick={() => void exportBundle()}>
          <Package size={14} />
          {web ? t("bundle.export.web") : t("bundle.export.desktop")}
        </Button>
      </div>
      <p className="text-sm text-[var(--text-muted)]">{t("bundle.intro")}</p>
      {!doc.is_bundle && (
        <p className="text-xs text-[var(--text-muted)]">{t("bundle.standaloneNote")}</p>
      )}

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
            {identifier}
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

      <Card className="space-y-1.5 p-4 text-sm">
        <h3 className="font-semibold">{t("bundle.contents")}</h3>
        <p className="text-xs text-[var(--text-muted)]">{t("bundle.contentsHelp")}</p>
        <ul className="space-y-1 font-mono text-xs" dir="ltr">
          <li>{bundleStem}.bundle/Contents/Info.plist</li>
          {doc.keyboard_names.map((name, i) => (
            <li key={i}>
              {bundleStem}.bundle/Contents/Resources/{sanitizeStem(name)}.keylayout
            </li>
          ))}
          <li>{bundleStem}.bundle/Contents/Resources/en.lproj/InfoPlist.strings</li>
        </ul>
      </Card>

      <Card className="space-y-2 p-4 text-sm">
        <h3 className="font-semibold">{t("bundle.install.title")}</h3>
        {web ? (
          <ol className="ml-5 list-decimal space-y-1 text-[var(--text-muted)]">
            <li>{t("bundle.install.web1")}</li>
            <li>{t("bundle.install.web2")}</li>
            <li>{t("bundle.install.web3")}</li>
          </ol>
        ) : (
          <ol className="ml-5 list-decimal space-y-1 text-[var(--text-muted)]">
            <li>{t("bundle.install.desktop1")}</li>
            <li>{t("bundle.install.desktop2")}</li>
          </ol>
        )}
      </Card>
    </div>
  );
}
