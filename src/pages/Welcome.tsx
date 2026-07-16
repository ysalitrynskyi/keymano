// P1 Welcome / Start (.

import * as React from "react";
import { useTranslation } from "react-i18next";
import { FilePlus2, FolderOpen, Sparkles, MonitorCog, Clock, FileText, Copy, FolderSearch, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { ActionCard, Button, Card, Input } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { Wordmark } from "@/components/Wordmark";
import { InstalledPicker } from "@/features/installed/InstalledPicker";
import { ipc } from "@/lib/ipc";
import { useEditor } from "@/store/editor";

const EXAMPLE_LAYOUTS = import.meta.glob("../../examples/*.keylayout", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const examples = Object.entries(EXAMPLE_LAYOUTS).map(([path, xml]) => ({
  name: path.split("/").pop()?.replace(/\.keylayout$/, "") ?? path,
  xml,
}));

export function WelcomePage() {
  const { t } = useTranslation();
  const newDocument = useEditor((s) => s.newDocument);
  const importXml = useEditor((s) => s.importXml);
  const openFile = useEditor((s) => s.openFile);
  const openInstalled = useEditor((s) => s.openInstalled);
  const recents = useEditor((s) => s.recents);
  const clearRecents = useEditor((s) => s.clearRecents);
  const [showInstalled, setShowInstalled] = React.useState(false);
  const [showWizard, setShowWizard] = React.useState(false);
  const [exampleQuery, setExampleQuery] = React.useState("");
  const filteredExamples = examples.filter((example) =>
    example.name.toLowerCase().includes(exampleQuery.toLowerCase()),
  );

  const tiles: Array<{ icon: React.ReactNode; title: string; desc: string; onClick: () => void }> = [
    {
      icon: <Sparkles size={20} />,
      title: t("template.standard"),
      desc: t("template.standard.desc"),
      onClick: () => void newDocument("standard", t("tabs.untitled")),
    },
    {
      icon: <FilePlus2 size={20} />,
      title: t("template.basic"),
      desc: t("template.basic.desc"),
      onClick: () => void newDocument("basic", t("tabs.untitled")),
    },
    ...(ipc.isTauri
      ? [
          {
            icon: <MonitorCog size={20} />,
            title: t("template.fromSystem"),
            desc: t("template.fromSystem.desc"),
            onClick: () => setShowInstalled(true),
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col items-center justify-center gap-8 text-center">
      <div className="space-y-3" style={{ color: "var(--text)" }}>
        <div className="km-float mx-auto w-fit">
          <Logo size={84} />
        </div>
        <h1><Wordmark className="text-4xl" /></h1>
        <div className="mx-auto h-px w-24 hairline-accent" />
        <p className="text-[var(--text-muted)]">{t("app.tagline")}</p>
      </div>

      <div data-tour="welcome-tiles" className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <ActionCard
            key={tile.title}
            className="p-5"
            onClick={tile.onClick}
          >
            <div className="mb-2 text-[var(--accent)]">{tile.icon}</div>
            <h3 className="font-semibold">{tile.title}</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{tile.desc}</p>
          </ActionCard>
        ))}
      </div>

      <div data-tour="topbar-open" className="flex items-center gap-2">
        <Button variant="outline" onClick={() => void openFile()}>
          <FolderOpen size={16} />
          {t("action.open")}
        </Button>
        <Button variant="outline" onClick={() => setShowWizard((open) => !open)}>
          <Wand2 size={16} />
          {t("wizard.title")}
        </Button>
      </div>

      {showWizard && (
        <Card className="w-full p-4 text-left">
          <h2 className="font-display text-lg font-semibold">{t("wizard.title")}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t("wizard.help")}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <ActionCard className="p-4" onClick={() => void newDocument("standard", t("wizard.tweakUs.name"))}>
              <h3 className="font-semibold">{t("wizard.tweakUs")}</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{t("wizard.tweakUs.desc")}</p>
            </ActionCard>
            <ActionCard className="p-4" onClick={() => void newDocument("basic", t("wizard.accents.name"))}>
              <h3 className="font-semibold">{t("wizard.accents")}</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{t("wizard.accents.desc")}</p>
            </ActionCard>
            <ActionCard className="p-4" onClick={() => void importXml(examples[0]?.xml ?? "")}>
              <h3 className="font-semibold">{t("wizard.phonetic")}</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{t("wizard.phonetic.desc")}</p>
            </ActionCard>
            <ActionCard className="p-4" onClick={() => void openFile()}>
              <h3 className="font-semibold">{t("wizard.repair")}</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{t("wizard.repair.desc")}</p>
            </ActionCard>
          </div>
        </Card>
      )}

      {examples.length > 0 && (
        <Card className="w-full p-4 text-left">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold">{t("examples.title")}</h2>
              <p className="text-sm text-[var(--text-muted)]">{t("examples.help")}</p>
            </div>
            <Input
              value={exampleQuery}
              onChange={(e) => setExampleQuery(e.target.value)}
              placeholder={t("examples.search")}
              className="h-8 w-52"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {filteredExamples.map((example) => (
              <ActionCard
                key={example.name}
                className="p-3"
                onClick={() => void importXml(example.xml)}
              >
                <div className="flex items-center gap-2">
                  <FileText size={15} className="text-[var(--accent)]" />
                  <span className="font-medium">{example.name}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{t("examples.open")}</p>
              </ActionCard>
            ))}
          </div>
        </Card>
      )}

      {recents.length > 0 && (
        <div className="w-full max-w-md text-left">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              <Clock size={13} />
              {t("action.openRecent")}
            </span>
            <button
              onClick={clearRecents}
              className="text-xs text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
            >
              {t("action.clear")}
            </button>
          </div>
          <ul className="space-y-1">
            {recents.map((r) => (
              <li
                key={r.path}
                className="group flex items-center gap-1 rounded-lg border border-[var(--border)] pr-1 transition-colors hover:border-[var(--accent)] hover:bg-[var(--panel-2)]"
              >
                <button
                  onClick={() => void openInstalled(r.path)}
                  title={r.path}
                  className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm"
                >
                  <FileText size={15} className="shrink-0 text-[var(--accent)]" />
                  <span className="truncate font-medium">{r.name}</span>
                </button>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(r.path);
                      toast.success(t("recent.copied"));
                    } catch {
                      toast.error(t("generic", { ns: "errors", defaultValue: "Something went wrong." }));
                    }
                  }}
                  aria-label={t("recent.copyPath")}
                  title={t("recent.copyPath")}
                  className="shrink-0 rounded-md p-1.5 text-[var(--text-muted)] opacity-0 transition hover:bg-[var(--panel)] hover:text-[var(--text)] focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Copy size={13} />
                </button>
                {ipc.isTauri && (
                  <button
                    onClick={() => void ipc.revealPath(r.path)}
                    aria-label={t("recent.reveal")}
                    title={t("recent.reveal")}
                    className="shrink-0 rounded-md p-1.5 text-[var(--text-muted)] opacity-0 transition hover:bg-[var(--panel)] hover:text-[var(--text)] focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <FolderSearch size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-[var(--text-muted)]">
        {ipc.isTauri ? t("welcome.dropHint") : t("welcome.dropHint.web")}
      </p>

      {showInstalled && <InstalledPicker onClose={() => setShowInstalled(false)} />}
    </div>
  );
}
