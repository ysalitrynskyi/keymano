import * as React from "react";
import type { TFunction } from "i18next";
import { toast } from "sonner";

import { ipc } from "@/lib/ipc";

export function useFileDrop({
  importXml,
  openInstalled,
  t,
}: {
  importXml: (xml: string) => Promise<void>;
  openInstalled: (path: string) => Promise<void>;
  t: TFunction;
}) {
  const [dragging, setDragging] = React.useState(false);

  const onDrop = React.useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (/\.(keylayout|xml)$/i.test(file.name)) {
        await importXml(await file.text());
        return;
      }
      toast.error(
        t("welcome.dropUnsupported", {
          defaultValue: ipc.isTauri
            ? "Drop a .keylayout, .bundle, or .bundle.zip file."
            : "Drop a .keylayout file in the browser; use Open… for .bundle.zip.",
        }),
      );
    },
    [importXml, t],
  );

  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    void ipc
      .onFileDrop((paths) => {
        const p = paths.find((x) => /\.(keylayout|bundle|bundle\.zip)$/i.test(x));
        if (p) {
          void openInstalled(p);
          return;
        }
        toast.error(
          t("welcome.dropUnsupported", {
            defaultValue: "Drop a .keylayout, .bundle, or .bundle.zip file.",
          }),
        );
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, [openInstalled, t]);

  const dragHandlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (!dragging) setDragging(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (
        e.relatedTarget === null ||
        e.clientX <= 0 ||
        e.clientY <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      ) {
        setDragging(false);
      }
    },
    onDrop: (e: React.DragEvent) => void onDrop(e),
  };

  return { dragging, dragHandlers };
}
