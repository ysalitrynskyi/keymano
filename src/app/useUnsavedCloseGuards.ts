import * as React from "react";

import { ipc } from "@/lib/ipc";
import { useEditor } from "@/store/editor";

export function useUnsavedCloseGuards(setConfirmQuit: (open: boolean) => void) {
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
  }, [setConfirmQuit]);
}
