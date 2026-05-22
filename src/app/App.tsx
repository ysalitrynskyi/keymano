// App shell: top bar + tabs + page switch + status bar (.

import * as React from "react";
import { useTranslation } from "react-i18next";
import { Toaster, toast } from "sonner";
import {
  Moon,
  Sun,
  Undo2,
  Redo2,
  Plus,
  X,
  FolderOpen,
  Save,
  Copy,
  MonitorCog,
  Download,
  Settings,
  HelpCircle,
  MoreHorizontal,
  Pencil,
  Wand2,
  Package,
} from "lucide-react";

import { Badge, Button, Dropdown, MenuItem } from "@/components/ui";
import { ipc } from "@/lib/ipc";
import { isRtl } from "@/lib/i18n";
import { GITHUB_URL } from "@/lib/meta";
import { Logo } from "@/components/Logo";
import { Wordmark } from "@/components/Wordmark";
import { Splash } from "@/components/Splash";
import { About } from "@/components/About";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { InstalledPicker } from "@/features/installed/InstalledPicker";
import { WelcomePage } from "@/pages/Welcome";
import { EditorPage } from "@/pages/Editor";
import { ModifiersPage } from "@/pages/Modifiers";
import { DeadKeysPage } from "@/pages/DeadKeys";
import { BundlePage } from "@/pages/Bundle";
import { XmlPage } from "@/pages/Xml";
import { PreferencesModal } from "@/pages/Preferences";
import { Tour } from "@/features/tour/Tour";
import { TOURS, type TourKey } from "@/features/tour/steps";
import { useEditor } from "@/store/editor";
import { useTheme } from "@/store/theme";

type Page = "editor" | "modifiers" | "deadkeys" | "bundle" | "xml";

export function App() {
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();
  const docs = useEditor((s) => s.docs);
  const activeDocId = useEditor((s) => s.activeDocId);
  const setActiveDoc = useEditor((s) => s.setActiveDoc);
  const closeDoc = useEditor((s) => s.closeDoc);
  const newDocument = useEditor((s) => s.newDocument);
  const openFile = useEditor((s) => s.openFile);
  const saveActive = useEditor((s) => s.saveActive);
  const saveActiveAs = useEditor((s) => s.saveActiveAs);
  const goHome = useEditor((s) => s.goHome);
  const renameDoc = useEditor((s) => s.renameDoc);
  const duplicateActive = useEditor((s) => s.duplicateActive);
  const importXml = useEditor((s) => s.importXml);
  const setZoom = useEditor((s) => s.setZoom);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const snapshot = useEditor((s) => s.snapshot);
  const issues = useEditor((s) => s.issues);
  const deadState = useEditor((s) => s.deadState);
  const zoom = useEditor((s) => s.zoom);
  const [page, setPage] = React.useState<Page>("editor");
  const [showSplash, setShowSplash] = React.useState(true);
  const [renaming, setRenaming] = React.useState<number | null>(null);
  const [showInstalled, setShowInstalled] = React.useState(false);
  const [showAbout, setShowAbout] = React.useState(false);
  const [showPrefs, setShowPrefs] = React.useState(false);
  const [showTour, setShowTour] = React.useState(false);
  const [helpSeen, setHelpSeen] = React.useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem("keymano-help-seen") === "1",
  );
  const [confirmCloseId, setConfirmCloseId] = React.useState<number | null>(null);
  const [confirmQuit, setConfirmQuit] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const cancelRename = React.useRef(false);

  const requestClose = React.useCallback(
    (id: number) => {
      const d = useEditor.getState().docs.find((x) => x.id === id);
      if (d?.dirty) setConfirmCloseId(id);
      else void closeDoc(id);
    },
    [closeDoc],
  );

  const hasDoc = activeDocId != null;

  // current page → tour content (welcome tour when no document is open)
  const tourKey: TourKey = hasDoc ? (page as TourKey) : "welcome";

  const [helpHint, setHelpHint] = React.useState(false);

  const openTour = React.useCallback(() => {
    setShowTour(true);
    setHelpSeen(true);
    setHelpHint(false);
    try {
      localStorage.setItem("keymano-help-seen", "1");
    } catch {
      /* ignore */
    }
  }, []);

  // First-run only: gently pulse the Help button after a few seconds of
  // inactivity, and stop the moment the user does anything. Never loops "all
  // the time" — it's a one-shot idle nudge.
  React.useEffect(() => {
    if (helpSeen) return;
    let idle = window.setTimeout(() => setHelpHint(true), 4000);
    const stop = () => {
      window.clearTimeout(idle);
      idle = 0;
      setHelpHint(false);
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("keydown", stop);
      window.removeEventListener("wheel", stop);
    };
    window.addEventListener("pointerdown", stop);
    window.addEventListener("keydown", stop);
    window.addEventListener("wheel", stop, { passive: true });
    return () => {
      window.clearTimeout(idle);
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("keydown", stop);
      window.removeEventListener("wheel", stop);
    };
  }, [helpSeen]);

  // First time a document is opened/created, nudge the user toward Help once.
  React.useEffect(() => {
    if (!hasDoc) return;
    try {
      if (localStorage.getItem("keymano-doc-nudge") === "1") return;
      localStorage.setItem("keymano-doc-nudge", "1");
    } catch {
      return;
    }
    const id = setTimeout(() => {
      toast(t("help.nudge"), {
        action: { label: t("help.nudgeAction"), onClick: openTour },
        duration: 8000,
      });
    }, 900);
    return () => clearTimeout(id);
  }, [hasDoc, openTour, t]);

  // keyboard shortcuts
  React.useEffect(() => {
    // On desktop the native menu owns these accelerators; only bind them in
    // the browser to avoid firing actions twice.
    if (ipc.isTauri) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      // Don't hijack accelerators while the user is typing — let the focused
      // field handle its own undo/redo and caret editing.
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        void undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        void redo();
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setZoom(useEditor.getState().zoom + 0.1);
      } else if (e.key === "-") {
        e.preventDefault();
        setZoom(useEditor.getState().zoom - 0.1);
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, setZoom]);

  // open a dropped .keylayout file (web DataTransfer)
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (/\.(keylayout|xml)$/i.test(file.name)) {
      await importXml(await file.text());
    }
  };

  // native OS file-drop (Tauri desktop)
  const openInstalled = useEditor((s) => s.openInstalled);
  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    void ipc
      .onFileDrop((paths) => {
        const p = paths.find((x) => /\.(keylayout|bundle)$/i.test(x)) ?? paths[0];
        if (p) void openInstalled(p);
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, [openInstalled]);

  // returning to a document always lands on the Editor view
  React.useEffect(() => {
    if (activeDocId != null) setPage("editor");
  }, [activeDocId]);

  // keep <html lang> + text direction in sync for accessibility / RTL scripts
  React.useEffect(() => {
    const lang = i18n.language || "en";
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl(lang) ? "rtl" : "ltr";
  }, [i18n.language]);

  // reflect the active document (and dirty state) in the window title
  React.useEffect(() => {
    const active = docs.find((d) => d.id === activeDocId);
    const title = active
      ? `${active.dirty ? "• " : ""}${active.name || t("tabs.untitled")} — Keymano`
      : "Keymano";
    document.title = title;
    void ipc.setTitle(title);
  }, [docs, activeDocId, t]);

  // native menu events
  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    void ipc
      .onMenu((id) => {
        const st = useEditor.getState();
        switch (id) {
          case "new": void st.newDocument("standard", t("tabs.untitled")); break;
          case "open": void st.openFile(); break;
          case "save": void st.saveActive(); break;
          case "save_as": void st.saveActiveAs(); break;
          case "from_system": setShowInstalled(true); break;
          case "close_tab": if (st.activeDocId != null) requestClose(st.activeDocId); break;
          case "undo": void st.undo(); break;
          case "redo": void st.redo(); break;
          case "zoom_in": st.setZoom(st.zoom + 0.1); break;
          case "zoom_out": st.setZoom(st.zoom - 0.1); break;
          case "zoom_reset": st.setZoom(1); break;
          case "about": setShowAbout(true); break;
          case "preferences": setShowPrefs(true); break;
          case "github": void ipc.openExternal(GITHUB_URL); break;
          case "quit":
            if (st.docs.some((d) => d.dirty)) setConfirmQuit(true);
            else void ipc.quit();
            break;
        }
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, [requestClose, t]);

  // intercept window close when there are unsaved changes
  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    void ipc
      .onCloseRequested(() => {
        if (useEditor.getState().docs.some((d) => d.dirty)) {
          setConfirmQuit(true);
          return false;
        }
        return true;
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  const nav: Array<[Page, string]> = [
    ["editor", t("nav.editor")],
    ["modifiers", t("nav.modifiers")],
    ["deadkeys", t("nav.deadkeys")],
    ["bundle", t("nav.bundle")],
    ["xml", t("nav.xml")],
  ];

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        // leaving the window entirely (no related target, or pointer at any
        // window edge) clears the overlay — not only the exact (0,0) corner
        if (
          e.relatedTarget === null ||
          e.clientX <= 0 ||
          e.clientY <= 0 ||
          e.clientX >= window.innerWidth ||
          e.clientY >= window.innerHeight
        ) {
          setDragging(false);
        }
      }}
      onDrop={(e) => void onDrop(e)}
    >
      {dragging && (
        <div
          className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center backdrop-blur-sm"
          style={{ background: "color-mix(in srgb, var(--bg) 75%, transparent)" }}
        >
          <div className="rounded-2xl border-2 border-dashed border-[var(--accent)] px-10 py-8 text-center">
            <p className="font-display text-xl font-semibold">{t("welcome.dropTitle")}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{t("welcome.dropHint")}</p>
          </div>
        </div>
      )}
      {showSplash && <Splash onDone={() => setShowSplash(false)} />}
      {showInstalled && <InstalledPicker onClose={() => setShowInstalled(false)} />}
      {showAbout && <About onClose={() => setShowAbout(false)} />}
      {showPrefs && <PreferencesModal onClose={() => setShowPrefs(false)} />}
      {showTour && <Tour steps={TOURS[tourKey]} onClose={() => setShowTour(false)} />}
      {confirmCloseId != null && (
        <ConfirmDialog
          title={t("confirm.closeTitle")}
          message={t("confirm.closeMessage")}
          confirmLabel={t("confirm.discard")}
          onCancel={() => setConfirmCloseId(null)}
          onConfirm={() => {
            void closeDoc(confirmCloseId);
            setConfirmCloseId(null);
          }}
        />
      )}
      {confirmQuit && (
        <ConfirmDialog
          title={t("confirm.quitTitle")}
          message={t("confirm.quitMessage")}
          confirmLabel={t("confirm.quitConfirm")}
          onCancel={() => setConfirmQuit(false)}
          onConfirm={() => {
            setConfirmQuit(false);
            void ipc.quit();
          }}
        />
      )}
      {/* Top bar */}
      <header className="relative flex h-14 items-center gap-3 overflow-x-auto bg-[var(--panel)] px-3">
        <button
          onClick={goHome}
          className="flex shrink-0 items-center gap-2.5 rounded-lg px-1 py-0.5 transition-opacity hover:opacity-80"
          aria-label={t("home")}
          title={t("home")}
          style={{ color: "var(--text)" }}
        >
          <Logo size={30} />
          <Wordmark className="text-lg" />
        </button>

        <span className="mx-1 h-5 w-px bg-[var(--border)]" />

        {/* Create / open — primary entries keep labels */}
        <Button size="sm" variant="ghost" className="shrink-0" onClick={() => void newDocument("standard", t("tabs.untitled"))}>
          <Plus size={15} />
          {t("action.new")}
        </Button>
        <Button size="sm" variant="ghost" className="shrink-0" onClick={() => void openFile()}>
          <FolderOpen size={15} />
          {t("action.open")}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="shrink-0"
          onClick={() => setShowInstalled(true)}
          aria-label={t("action.fromSystem")}
          title={t("action.fromSystem")}
        >
          <MonitorCog size={16} />
        </Button>

        {hasDoc && (
          <>
            <span className="mx-1 h-5 w-px shrink-0 bg-[var(--border)]" />
            {/* Save (quick) + a document menu consolidating rename / naming /
                export formats / install. */}
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={() => void saveActive()}
              title={t("action.saveTooltip")}
            >
              <Save size={15} />
              {t("action.save")}
            </Button>
            <div className="shrink-0">
              <Dropdown
                trigger={
                  <Button size="icon" variant="ghost" aria-label={t("action.document")} title={t("action.document")}>
                    <MoreHorizontal size={16} />
                  </Button>
                }
              >
                {(close) => (
                  <>
                    <MenuItem onClick={() => { if (activeDocId != null) setRenaming(activeDocId); close(); }}>
                      <Pencil size={14} /> {t("action.rename")}
                    </MenuItem>
                    <MenuItem onClick={() => { void useEditor.getState().generateName(); close(); }}>
                      <Wand2 size={14} /> {t("action.generateName")}
                    </MenuItem>
                    <MenuItem onClick={() => { void duplicateActive(); close(); }}>
                      <Copy size={14} /> {t("action.useAsTemplate")}
                    </MenuItem>
                    <div className="my-1 h-px bg-[var(--border)]" />
                    <MenuItem onClick={() => { void saveActiveAs(); close(); }} title={t("action.saveAsTooltip")}>
                      <Save size={14} /> {t("action.saveAs")}
                    </MenuItem>
                    <MenuItem onClick={() => { void useEditor.getState().exportBundle(); close(); }}>
                      <Package size={14} /> {t("action.exportBundle")}
                    </MenuItem>
                    {ipc.isTauri && (
                      <MenuItem onClick={() => { void useEditor.getState().installActive(); close(); }} title={t("action.installHint")}>
                        <Download size={14} /> {t("action.install")}
                      </MenuItem>
                    )}
                  </>
                )}
              </Dropdown>
            </div>
            <span className="mx-1 h-5 w-px shrink-0 bg-[var(--border)]" />
            <Button size="icon" variant="ghost" className="shrink-0" onClick={() => void undo()} aria-label={t("action.undo")} title={t("action.undo")}>
              <Undo2 size={16} />
            </Button>
            <Button size="icon" variant="ghost" className="shrink-0" onClick={() => void redo()} aria-label={t("action.redo")} title={t("action.redo")}>
              <Redo2 size={16} />
            </Button>
          </>
        )}

        <div className="ml-2 flex items-center gap-1 overflow-x-auto">
          {docs.map((d) => (
            <div
              key={d.id}
              className={
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs " +
                (d.id === activeDocId
                  ? "border-[var(--accent)] bg-[var(--panel-2)]"
                  : "border-[var(--border)] hover:bg-[var(--panel-2)]")
              }
            >
              {renaming === d.id ? (
                <input
                  autoFocus
                  defaultValue={d.name}
                  aria-label={t("tabs.rename")}
                  className="w-28 bg-transparent font-medium outline-none"
                  onBlur={(e) => {
                    if (!cancelRename.current) {
                      void renameDoc(d.id, e.target.value.trim() || d.name);
                    }
                    cancelRename.current = false;
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") {
                      cancelRename.current = true;
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
              ) : (
                <button
                  onClick={() => void setActiveDoc(d.id)}
                  onDoubleClick={() => setRenaming(d.id)}
                  className="max-w-[160px] truncate font-medium"
                  title={`${d.name || t("tabs.untitled")} — ${t("tabs.renameHint")}`}
                >
                  {d.name || t("tabs.untitled")}
                  {d.dirty && <span className="ml-1 text-[var(--accent)]">•</span>}
                </button>
              )}
              <button onClick={() => requestClose(d.id)} aria-label={t("action.close")}>
                <X size={12} className="text-[var(--text-muted)] hover:text-[var(--text)]" />
              </button>
            </div>
          ))}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={openTour}
            aria-label={t("help.label")}
            title={t("help.label")}
            className={"relative" + (helpHint ? " km-help-pulse" : "")}
          >
            <HelpCircle size={16} />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setShowPrefs(true)} aria-label={t("nav.prefs")} title={t("nav.prefs")}>
            <Settings size={16} />
          </Button>
          <Button size="icon" variant="ghost" onClick={toggle} aria-label={t("theme.toggle")}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
        </div>
      </header>

      <div className="h-px hairline-accent" />

      {/* Nav */}
      {hasDoc && (
        <nav className="flex h-10 items-center gap-1 border-b border-[var(--border)] bg-[var(--panel)] px-3">
          {nav.map(([p, label]) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              aria-current={page === p ? "page" : undefined}
              className={
                "relative h-9 px-3 text-[13px] font-medium transition-colors " +
                (page === p
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]")
              }
            >
              {label}
              {page === p && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--accent)]" />
              )}
            </button>
          ))}
        </nav>
      )}

      {/* Main */}
      <main className="min-h-0 flex-1 overflow-auto p-4">
        {!hasDoc ? (
          <WelcomePage />
        ) : page === "editor" ? (
          <EditorPage />
        ) : page === "modifiers" ? (
          <ModifiersPage />
        ) : page === "deadkeys" ? (
          <DeadKeysPage />
        ) : page === "bundle" ? (
          <BundlePage />
        ) : (
          <XmlPage />
        )}
      </main>

      {/* Status bar */}
      {hasDoc && (
        <footer className="flex h-7 items-center gap-4 border-t border-[var(--border)] bg-[var(--panel)] px-3 text-xs text-[var(--text-muted)]">
          <span>{snapshot?.keyboard_name}</span>
          <span>
            {t("status.mapIndex")}: {snapshot?.modifier_index ?? 0}
          </span>
          <span>
            {t("status.deadState")}: {deadState}
          </span>
          <span>
            {t("status.zoom")}: {Math.round(zoom * 100)}%
          </span>
          <span className="ml-auto">
            {issues.length === 0 ? (
              <Badge tone="success">{t("status.valid")}</Badge>
            ) : (
              <Badge tone="warning">{t("status.issues", { count: issues.length })}</Badge>
            )}
          </span>
        </footer>
      )}

      <Toaster position="bottom-right" theme={theme === "dark" ? "dark" : "light"} />
    </div>
  );
}
