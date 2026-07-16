import * as React from "react";

import { ipc } from "@/lib/ipc";
import { useEditor } from "@/store/editor";

export function useBrowserShortcuts({
  undo,
  redo,
  setZoom,
}: {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  setZoom: (zoom: number) => void;
}) {
  React.useEffect(() => {
    if (ipc.isTauri) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
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
}
