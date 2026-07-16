import * as React from "react";

import type { Geometry } from "@/lib/types";

export function useQuickEntry({
  geo,
  selectedCode,
  selectKey,
  setKeyOutput,
}: {
  geo: Geometry;
  selectedCode: number | null;
  selectKey: (code: number | null) => void;
  setKeyOutput: (code: number, output: string) => Promise<void>;
}) {
  const ordinaryOrder = React.useMemo(
    () =>
      geo.rows.flatMap((row) =>
        row.keys.filter((k) => (k.kind ?? "ordinary") === "ordinary").map((k) => k.code),
      ),
    [geo],
  );

  const advance = React.useCallback(() => {
    if (selectedCode == null) return;
    const i = ordinaryOrder.indexOf(selectedCode);
    if (i >= 0 && i + 1 < ordinaryOrder.length) selectKey(ordinaryOrder[i + 1]);
  }, [ordinaryOrder, selectedCode, selectKey]);

  return React.useCallback(
    (e: React.KeyboardEvent, enabled: boolean) => {
      if (
        enabled &&
        selectedCode != null &&
        e.key.length === 1 &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        void setKeyOutput(selectedCode, e.key);
        advance();
        return true;
      }
      return false;
    },
    [advance, selectedCode, setKeyOutput],
  );
}
