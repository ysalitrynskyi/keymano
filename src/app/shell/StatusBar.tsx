import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui";
import type { Issue, KeyboardSnapshot } from "@/lib/types";

export function StatusBar({
  snapshot,
  issues,
  deadState,
  zoom,
}: {
  snapshot: KeyboardSnapshot | null;
  issues: Issue[];
  deadState: string;
  zoom: number;
}) {
  const { t } = useTranslation();
  return (
    <footer className="flex h-7 items-center gap-4 border-t border-[var(--border)] bg-[var(--panel)] px-3 text-xs text-[var(--text-muted)]">
      <span>{snapshot?.keyboard_name}</span>
      <span>
        {t("status.mapIndex")}: {snapshot?.modifier_index ?? 0}
      </span>
      <span>
        {t("status.deadState")}: {deadState}
      </span>
      <span>
        {t("status.zoom")}: {Math.round(zoom * 100)}%
      </span>
      <span className="ml-auto">
        {issues.length === 0 ? (
          <Badge tone="success">{t("status.valid")}</Badge>
        ) : (
          <Badge tone="warning">{t("status.issues", { count: issues.length })}</Badge>
        )}
      </span>
    </footer>
  );
}
