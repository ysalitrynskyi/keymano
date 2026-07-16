import * as React from "react";
import type { TFunction } from "i18next";

import { ipc } from "@/lib/ipc";
import type { DocSummary } from "@/lib/types";

export function useDocumentTitle(docs: DocSummary[], activeDocId: number | null, t: TFunction) {
  React.useEffect(() => {
    const active = docs.find((d) => d.id === activeDocId);
    const title = active
      ? `${active.dirty ? "• " : ""}${active.name || t("tabs.untitled")} — Keymano`
      : "Keymano";
    document.title = title;
    void ipc.setTitle(title);
  }, [docs, activeDocId, t]);
}
