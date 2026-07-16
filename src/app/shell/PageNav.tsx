import { useTranslation } from "react-i18next";

import { PAGE_LABEL_KEY, PAGE_ORDER, type Page } from "@/app/pageRegistry";

export function PageNav({
  page,
  setPage,
}: {
  page: Page;
  setPage: (page: Page) => void;
}) {
  const { t } = useTranslation();
  return (
    <nav className="flex h-10 items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--panel)] px-3">
      {PAGE_ORDER.map((p) => {
        const active = page === p;
        return (
          <button
            key={p}
            onClick={() => setPage(p)}
            aria-current={active ? "page" : undefined}
            className={
              "relative h-9 px-3 text-[13px] font-medium transition-colors " +
              (active ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)]")
            }
          >
            {t(PAGE_LABEL_KEY[p])}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--accent)]" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
