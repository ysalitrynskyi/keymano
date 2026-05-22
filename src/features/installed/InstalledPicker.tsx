// Import-from-system picker (. Lists installed layout files AND the
// macOS input sources the user has enabled (incl. sealed built-ins). File-backed
// entries open directly; built-ins fork a fresh layout named after them.

import * as React from "react";
import { useTranslation } from "react-i18next";
import { MonitorCog, FileText, Package, Keyboard as KbIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button, Card } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ipc } from "@/lib/ipc";
import type { InputSource, InstalledLayout } from "@/lib/types";
import { useEditor } from "@/store/editor";

export function InstalledPicker({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const openInstalled = useEditor((s) => s.openInstalled);
  const newDocument = useEditor((s) => s.newDocument);
  const [files, setFiles] = React.useState<InstalledLayout[] | null>(null);
  const [sources, setSources] = React.useState<InputSource[] | null>(null);
  const [confirm, setConfirm] = React.useState<InstalledLayout | null>(null);

  const refresh = React.useCallback(() => {
    void ipc.listInstalledLayouts().then(setFiles).catch(() => setFiles([]));
    void ipc.listInputSources().then(setSources).catch(() => setSources([]));
  }, []);

  React.useEffect(() => {
    refresh();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // live-refresh when the Keyboard Layouts folders change (fs-watch)
    let unlisten: (() => void) | undefined;
    void ipc.onInstalledChanged(refresh).then((u) => (unlisten = u));
    return () => {
      window.removeEventListener("keydown", onKey);
      unlisten?.();
    };
  }, [onClose, refresh]);

  const uninstall = async (it: InstalledLayout) => {
    try {
      await ipc.uninstallLayout(it.path);
      toast.message(t("installed.uninstalled", { name: it.name }));
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("installed.uninstall"));
    }
  };

  const loading = files === null || sources === null;
  const empty = !loading && files!.length === 0 && sources!.length === 0;

  const fileGroups: Array<["user" | "system", string]> = [
    ["user", t("installed.user")],
    ["system", t("installed.system")],
  ];

  const openSource = async (src: InputSource) => {
    if (src.file) {
      await openInstalled(src.file);
    } else {
      // macOS seals Apple's built-in layouts (they live in a binary bundle no
      // app can read), so we cannot import the actual layout. Start a BLANK
      // layout named after it — not a US-QWERTY one, which would look like the
      // built-in loaded as English.
      await newDocument("basic", src.name);
      toast.message(t("installed.forked", { name: src.name }), {
        description: t("installed.forkedDesc"),
        duration: 7000,
      });
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("installed.title")}
    >
      <Card className="max-h-[74vh] w-[480px] max-w-[calc(100vw-2rem)] overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display mb-1 flex items-center gap-2 text-lg font-semibold">
          <MonitorCog size={18} />
          {t("installed.title")}
        </h2>
        <p className="mb-4 text-xs text-[var(--text-muted)]">{t("installed.hint")}</p>

        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">…</p>
        ) : empty ? (
          <p className="text-sm text-[var(--text-muted)]">{t("installed.empty")}</p>
        ) : (
          <div className="space-y-4">
            {/* installed files */}
            {fileGroups.map(([scope, label]) => {
              const list = (files ?? []).filter((i) => i.scope === scope);
              if (list.length === 0) return null;
              return (
                <Group key={scope} label={label}>
                  {list.map((it) => (
                    <Row
                      key={it.path}
                      icon={it.is_bundle ? <Package size={15} /> : <FileText size={15} />}
                      name={it.name}
                      tag={it.is_bundle ? ".bundle" : ".keylayout"}
                      onClick={async () => {
                        await openInstalled(it.path);
                        onClose();
                      }}
                      onDelete={scope === "user" ? () => setConfirm(it) : undefined}
                      deleteLabel={t("installed.uninstall")}
                    />
                  ))}
                </Group>
              );
            })}

            {/* enabled input sources (incl. built-ins) */}
            {(sources ?? []).length > 0 && (
              <Group label={t("installed.inputSources")}>
                {(sources ?? []).map((src) => (
                  <Row
                    key={src.name}
                    icon={<KbIcon size={15} />}
                    name={src.name}
                    tag={src.file ? t("installed.editable") : t("installed.builtin")}
                    muted={!src.file}
                    onClick={() => void openSource(src)}
                  />
                ))}
              </Group>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("keyeditor.cancel", { ns: "editor" })}
          </Button>
        </div>
      </Card>

      {confirm && (
        <ConfirmDialog
          title={t("installed.uninstallTitle")}
          message={t("installed.uninstallMessage", { name: confirm.name })}
          confirmLabel={t("installed.uninstallConfirm")}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            void uninstall(confirm);
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function Row({
  icon,
  name,
  tag,
  muted,
  onClick,
  onDelete,
  deleteLabel,
}: {
  icon: React.ReactNode;
  name: string;
  tag: string;
  muted?: boolean;
  onClick: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
}) {
  return (
    <li className="group flex items-center gap-1">
      <button
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm transition-colors hover:border-[var(--accent)] hover:bg-[var(--panel-2)]"
      >
        <span className={muted ? "text-[var(--text-muted)]" : "text-[var(--accent)]"}>{icon}</span>
        <span className="truncate font-medium">{name}</span>
        <span className="ml-auto whitespace-nowrap text-xs text-[var(--text-muted)]">{tag}</span>
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          aria-label={deleteLabel}
          title={deleteLabel}
          className="rounded-lg border border-transparent p-2 text-[var(--text-muted)] transition-colors hover:border-[var(--border)] hover:text-[var(--danger,#e5484d)]"
        >
          <Trash2 size={15} />
        </button>
      )}
    </li>
  );
}
