import * as React from "react";
import type { TFunction } from "i18next";

import { ipc } from "@/lib/ipc";
import { GITHUB_URL } from "@/lib/meta";
import { useEditor } from "@/store/editor";

export function useNativeMenuBridge({
  requestClose,
  setShowInstalled,
  setShowAbout,
  setShowPrefs,
  setConfirmQuit,
  t,
}: {
  requestClose: (id: number) => void;
  setShowInstalled: (open: boolean) => void;
  setShowAbout: (open: boolean) => void;
  setShowPrefs: (open: boolean) => void;
  setConfirmQuit: (open: boolean) => void;
  t: TFunction;
}) {
  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    void ipc
      .onMenu((id) => {
        const st = useEditor.getState();
        switch (id) {
          case "new":
            void st.newDocument("standard", t("tabs.untitled"));
            break;
          case "open":
            void st.openFile();
            break;
          case "save":
            void st.saveActive();
            break;
          case "save_as":
            void st.saveActiveAs();
            break;
          case "from_system":
            setShowInstalled(true);
            break;
          case "close_tab":
            if (st.activeDocId != null) requestClose(st.activeDocId);
            break;
          case "undo":
            void st.undo();
            break;
          case "redo":
            void st.redo();
            break;
          case "zoom_in":
            st.setZoom(st.zoom + 0.1);
            break;
          case "zoom_out":
            st.setZoom(st.zoom - 0.1);
            break;
          case "zoom_reset":
            st.setZoom(1);
            break;
          case "about":
            setShowAbout(true);
            break;
          case "preferences":
            setShowPrefs(true);
            break;
          case "github":
            void ipc.openExternal(GITHUB_URL);
            break;
          case "quit":
            if (st.docs.some((d) => d.dirty)) setConfirmQuit(true);
            else void ipc.quit();
            break;
        }
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, [requestClose, setShowAbout, setShowInstalled, setShowPrefs, setConfirmQuit, t]);
}
