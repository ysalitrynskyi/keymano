// Interactive guided tour. Highlights the anchored element with a spotlight
// and shows a positioned tooltip with Back / Next controls. Falls back to a
// centered card when a step has no anchor or its target isn't on screen.

import * as React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui";
import { ipc } from "@/lib/ipc";
import type { TourStep } from "./steps";

const PAD = 8; // spotlight padding around the target
const GAP = 12; // gap between target and tooltip
const TOOLTIP_W = 320;

export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const { t } = useTranslation();
  const [i, setI] = React.useState(0);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const [, setTick] = React.useState(0); // force re-layout of the centered fallback on resize
  const step = steps[i];

  const anchorEl = React.useCallback(
    () =>
      step?.anchor
        ? (document.querySelector(`[data-tour="${step.anchor}"]`) as HTMLElement | null)
        : null,
    [step],
  );

  // Re-read geometry only (no scrolling) — safe to call on resize/scroll.
  const measure = React.useCallback(() => {
    setTick((n) => n + 1); // recompute viewport-relative placement
    const el = anchorEl();
    setRect(el ? el.getBoundingClientRect() : null);
  }, [anchorEl]);

  // Scroll the target into view once per step (smooth scroll must not re-fire
  // from the scroll listener, or it jitters until it settles).
  React.useEffect(() => {
    anchorEl()?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [anchorEl]);

  React.useLayoutEffect(() => {
    measure();
    // re-measure after smooth scroll settles
    const t = setTimeout(measure, 280);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  const last = i >= steps.length - 1;
  const next = React.useCallback(() => (last ? onClose() : setI((n) => n + 1)), [last, onClose]);
  const back = React.useCallback(() => setI((n) => Math.max(0, n - 1)), []);
  const body =
    !ipc.isTauri && step.bodyKey === "tour.welcome.intro.body"
      ? t("tour.welcome.intro.body.web", {
          defaultValue:
            "Design and edit macOS keyboard layouts. Start from a template or open a .keylayout file; use the Bundle page to export a .bundle.zip for macOS.",
        })
      : !ipc.isTauri && step.bodyKey === "tour.welcome.open.body"
        ? t("tour.welcome.open.body.web", {
            defaultValue: "Open a .keylayout from disk, or drag one anywhere onto the window.",
          })
        : t(step.bodyKey);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, onClose]);

  // Tooltip placement: below the target if room, else above; centered when no
  // anchor. Clamped to the viewport.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let tipStyle: React.CSSProperties;
  if (rect) {
    const below = rect.bottom + GAP + 180 < vh;
    const top = below ? rect.bottom + GAP : Math.max(GAP, rect.top - GAP - 180);
    let left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    left = Math.min(Math.max(GAP, left), vw - TOOLTIP_W - GAP);
    tipStyle = { top, left, width: TOOLTIP_W };
  } else {
    tipStyle = {
      top: vh / 2 - 90,
      left: vw / 2 - TOOLTIP_W / 2,
      width: TOOLTIP_W,
    };
  }

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label={t("a11y.tour")}>
      {/* dim + spotlight (hole punched with a huge ring shadow) */}
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-xl transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            outline: "2px solid var(--accent)",
          }}
        />
      ) : (
        <div className="fixed inset-0" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose} />
      )}

      {/* click-catcher so clicks outside the tooltip don't hit the app */}
      <div className="fixed inset-0" onClick={onClose} />

      <div
        className="fixed rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-xl"
        style={{ ...tipStyle, boxShadow: "var(--shadow-panel)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold">{t(step.titleKey)}</h3>
          <span className="text-xs text-[var(--text-muted)]">
            {i + 1} / {steps.length}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-[var(--text-muted)]">{body}</p>
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-xs text-[var(--text-muted)] underline-offset-2 hover:underline"
          >
            {t("help.skip")}
          </button>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <Button size="sm" variant="outline" onClick={back}>
                {t("help.back")}
              </Button>
            )}
            <Button size="sm" variant="accent" onClick={next}>
              {last ? t("help.done") : t("help.next")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
