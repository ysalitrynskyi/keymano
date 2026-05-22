// About dialog — opened from the native "About Keymano" menu item (and any
// in-app trigger). All identity comes from lib/meta (single source).

import { useTranslation } from "react-i18next";

import { Button, Card } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { ipc } from "@/lib/ipc";
import {
  APP_NAME,
  APP_TAGLINE,
  APP_VERSION,
  AUTHOR,
  AUTHOR_MAILTO,
  GITHUB_URL,
  LICENSE,
} from "@/lib/meta";

export function About({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${t("about.title")} ${APP_NAME}`}
    >
      <Card className="w-[380px] max-w-[calc(100vw-2rem)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 w-fit" style={{ color: "var(--text)" }}>
          <Logo size={88} />
        </div>
        <h2 className="font-display text-2xl font-semibold">{APP_NAME}</h2>
        <div className="mx-auto my-2 h-px w-20 hairline-accent" />
        <p className="text-sm text-[var(--text-muted)]">{APP_TAGLINE}</p>

        <dl className="mt-5 space-y-1.5 text-sm">
          <Row label={t("about.version")} value={APP_VERSION} />
          <div className="flex items-center justify-between">
            <dt className="text-[var(--text-muted)]">{t("about.author")}</dt>
            <dd>
              <button
                onClick={() => void ipc.openExternal(AUTHOR_MAILTO)}
                title={t("about.contact")}
                className="font-medium underline-offset-2 hover:text-[var(--accent)] hover:underline"
              >
                {AUTHOR}
              </button>
            </dd>
          </div>
          <Row label={t("about.license")} value={LICENSE} />
        </dl>

        <div className="mt-5 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void ipc.openExternal(GITHUB_URL)}>
            {t("about.github")}
          </Button>
          <Button variant="accent" size="sm" onClick={onClose}>
            {t("action.close")}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
