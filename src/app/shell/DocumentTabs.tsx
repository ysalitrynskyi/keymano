import * as React from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import type { DocSummary } from "@/lib/types";

export function DocumentTabs({
  docs,
  activeDocId,
  renaming,
  cancelRename,
  setActiveDoc,
  requestClose,
  setRenaming,
  renameDoc,
}: {
  docs: DocSummary[];
  activeDocId: number | null;
  renaming: number | null;
  cancelRename: React.MutableRefObject<boolean>;
  setActiveDoc: (id: number) => Promise<void>;
  requestClose: (id: number) => void;
  setRenaming: (id: number | null) => void;
  renameDoc: (id: number, name: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
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
  );
}
