import { useTranslation } from "react-i18next";

import { ipc } from "@/lib/ipc";

export function DropOverlay({ visible }: { visible: boolean }) {
  const { t } = useTranslation();
  if (!visible) return null;
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center backdrop-blur-sm"
      style={{ background: "color-mix(in srgb, var(--bg) 75%, transparent)" }}
    >
      <div className="rounded-2xl border-2 border-dashed border-[var(--accent)] px-10 py-8 text-center">
        <p className="font-display text-xl font-semibold">{t("welcome.dropTitle")}</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {ipc.isTauri ? t("welcome.dropHint") : t("welcome.dropHint.web")}
        </p>
      </div>
    </div>
  );
}
