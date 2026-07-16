import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Copy,
  Download,
  FolderOpen,
  HelpCircle,
  MonitorCog,
  Moon,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Redo2,
  Save,
  Settings,
  Sun,
  Undo2,
  Wand2,
} from "lucide-react";

import { DocumentTabs } from "./DocumentTabs";
import { Logo } from "@/components/Logo";
import { Wordmark } from "@/components/Wordmark";
import { Button, Dropdown, MenuItem } from "@/components/ui";
import { ipc } from "@/lib/ipc";
import type { DocSummary } from "@/lib/types";

export function TopBar({
  docs,
  activeDocId,
  hasDoc,
  renaming,
  cancelRename,
  theme,
  helpHint,
  setActiveDoc,
  requestClose,
  setRenaming,
  setShowInstalled,
  setShowPrefs,
  goHome,
  newDocument,
  openFile,
  saveActive,
  saveActiveAs,
  renameDoc,
  generateName,
  duplicateActive,
  exportBundle,
  installActive,
  undo,
  redo,
  openTour,
  toggleTheme,
}: {
  docs: DocSummary[];
  activeDocId: number | null;
  hasDoc: boolean;
  renaming: number | null;
  cancelRename: React.MutableRefObject<boolean>;
  theme: "light" | "dark" | "system";
  helpHint: boolean;
  setActiveDoc: (id: number) => Promise<void>;
  requestClose: (id: number) => void;
  setRenaming: (id: number | null) => void;
  setShowInstalled: (open: boolean) => void;
  setShowPrefs: (open: boolean) => void;
  goHome: () => void;
  newDocument: (template: "basic" | "standard", name: string) => Promise<void>;
  openFile: () => Promise<void>;
  saveActive: () => Promise<boolean>;
  saveActiveAs: () => Promise<boolean>;
  renameDoc: (id: number, name: string) => Promise<void>;
  generateName: () => Promise<void>;
  duplicateActive: () => Promise<void>;
  exportBundle: () => Promise<void>;
  installActive: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  openTour: () => void;
  toggleTheme: () => void;
}) {
  const { t } = useTranslation();
  return (
    <header className="relative flex h-14 items-center gap-3 overflow-x-auto bg-[var(--panel)] px-3">
      <button
        onClick={goHome}
        className="flex shrink-0 items-center gap-2.5 rounded-lg px-1 py-0.5 transition-opacity hover:opacity-80"
        aria-label={t("home")}
        title={t("home")}
        style={{ color: "var(--text)" }}
      >
        <Logo size={30} />
        <Wordmark className="hidden text-lg sm:block" />
      </button>

      <span className="mx-1 h-5 w-px bg-[var(--border)]" />

      <Button size="sm" variant="ghost" className="shrink-0" onClick={() => void newDocument("standard", t("tabs.untitled"))}>
        <Plus size={15} />
        <span className="hidden sm:inline">{t("action.new")}</span>
      </Button>
      <Button size="sm" variant="ghost" className="shrink-0" onClick={() => void openFile()}>
        <FolderOpen size={15} />
        <span className="hidden sm:inline">{t("action.open")}</span>
      </Button>
      {ipc.isTauri && (
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
      )}

      {hasDoc && (
        <>
          <span className="mx-1 h-5 w-px shrink-0 bg-[var(--border)]" />
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0"
            onClick={() => void saveActive()}
            title={t("action.saveTooltip")}
          >
            <Save size={15} />
            <span className="hidden md:inline">{t("action.save")}</span>
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
                  <MenuItem onClick={() => { void generateName(); close(); }}>
                    <Wand2 size={14} /> {t("action.generateName")}
                  </MenuItem>
                  <MenuItem onClick={() => { void duplicateActive(); close(); }}>
                    <Copy size={14} /> {t("action.useAsTemplate")}
                  </MenuItem>
                  <div className="my-1 h-px bg-[var(--border)]" />
                  <MenuItem onClick={() => { void saveActiveAs(); close(); }} title={t("action.saveAsTooltip")}>
                    <Save size={14} /> {t("action.saveAs")}
                  </MenuItem>
                  <MenuItem onClick={() => { void exportBundle(); close(); }}>
                    <Package size={14} /> {t("action.exportBundle")}
                  </MenuItem>
                  {ipc.isTauri && (
                    <MenuItem onClick={() => { void installActive(); close(); }} title={t("action.installHint")}>
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

      <DocumentTabs
        docs={docs}
        activeDocId={activeDocId}
        renaming={renaming}
        cancelRename={cancelRename}
        setActiveDoc={setActiveDoc}
        requestClose={requestClose}
        setRenaming={setRenaming}
        renameDoc={renameDoc}
      />

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
        <Button size="icon" variant="ghost" onClick={toggleTheme} aria-label={t("theme.toggle")}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </Button>
      </div>
    </header>
  );
}
