// App shell: top bar + tabs + page switch + status bar (.

import * as React from "react";
import { useTranslation } from "react-i18next";
import { Toaster } from "sonner";

import { ipc } from "@/lib/ipc";
import { isRtl } from "@/lib/i18n";
import { Splash } from "@/components/Splash";
import { About } from "@/components/About";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { InstalledPicker } from "@/features/installed/InstalledPicker";
import { PreferencesModal } from "@/pages/Preferences";
import { Tour } from "@/features/tour/Tour";
import { TOURS, type TourKey } from "@/features/tour/steps";
import { useEditor } from "@/store/editor";
import { useTheme } from "@/store/theme";
import { pageForDocState, type Page } from "./pageRegistry";
import { useBrowserShortcuts } from "./useBrowserShortcuts";
import { useDocumentTitle } from "./useDocumentTitle";
import { useFileDrop } from "./useFileDrop";
import { useHelpNudges } from "./useHelpNudges";
import { useNativeMenuBridge } from "./useNativeMenuBridge";
import { useUnsavedCloseGuards } from "./useUnsavedCloseGuards";
import { DropOverlay } from "./shell/DropOverlay";
import { PageNav } from "./shell/PageNav";
import { StatusBar } from "./shell/StatusBar";
import { TopBar } from "./shell/TopBar";

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
  const generateName = useEditor((s) => s.generateName);
  const duplicateActive = useEditor((s) => s.duplicateActive);
  const exportBundle = useEditor((s) => s.exportBundle);
  const installActive = useEditor((s) => s.installActive);
  const importXml = useEditor((s) => s.importXml);
  const openInstalled = useEditor((s) => s.openInstalled);
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
  const [confirmCloseId, setConfirmCloseId] = React.useState<number | null>(null);
  const [confirmQuit, setConfirmQuit] = React.useState(false);
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

  const { helpHint, openTour, showTour, setShowTour } = useHelpNudges(hasDoc, t);
  const { dragging, dragHandlers } = useFileDrop({ importXml, openInstalled, t });
  useBrowserShortcuts({ undo, redo, setZoom });

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

  useDocumentTitle(docs, activeDocId, t);
  useNativeMenuBridge({
    requestClose,
    setShowInstalled,
    setShowAbout,
    setShowPrefs,
    setConfirmQuit,
    t,
  });
  useUnsavedCloseGuards(setConfirmQuit);

  return (
    <div className="flex h-full flex-col" {...dragHandlers}>
      <DropOverlay visible={dragging} />
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
      <TopBar
        docs={docs}
        activeDocId={activeDocId}
        hasDoc={hasDoc}
        renaming={renaming}
        cancelRename={cancelRename}
        theme={theme}
        helpHint={helpHint}
        setActiveDoc={setActiveDoc}
        requestClose={requestClose}
        setRenaming={setRenaming}
        setShowInstalled={setShowInstalled}
        setShowPrefs={setShowPrefs}
        goHome={goHome}
        newDocument={newDocument}
        openFile={openFile}
        saveActive={saveActive}
        saveActiveAs={saveActiveAs}
        renameDoc={renameDoc}
        generateName={generateName}
        duplicateActive={duplicateActive}
        exportBundle={exportBundle}
        installActive={installActive}
        undo={undo}
        redo={redo}
        openTour={openTour}
        toggleTheme={toggle}
      />

      <div className="h-px hairline-accent" />

      {hasDoc && <PageNav page={page} setPage={setPage} />}

      <main className="min-h-0 flex-1 overflow-auto p-4">{pageForDocState(page, hasDoc)}</main>

      {hasDoc && <StatusBar snapshot={snapshot} issues={issues} deadState={deadState} zoom={zoom} />}

      <Toaster position="bottom-right" theme={theme === "dark" ? "dark" : "light"} />
    </div>
  );
}
