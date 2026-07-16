import * as React from "react";
import type { TFunction } from "i18next";
import { toast } from "sonner";

export function useHelpNudges(hasDoc: boolean, t: TFunction) {
  const [showTour, setShowTour] = React.useState(false);
  const [helpSeen, setHelpSeen] = React.useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem("keymano-help-seen") === "1",
  );
  const [helpHint, setHelpHint] = React.useState(false);

  const openTour = React.useCallback(() => {
    setShowTour(true);
    setHelpSeen(true);
    setHelpHint(false);
    try {
      localStorage.setItem("keymano-help-seen", "1");
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    if (helpSeen) return;
    let idle = window.setTimeout(() => setHelpHint(true), 4000);
    const stop = () => {
      window.clearTimeout(idle);
      idle = 0;
      setHelpHint(false);
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("keydown", stop);
      window.removeEventListener("wheel", stop);
    };
    window.addEventListener("pointerdown", stop);
    window.addEventListener("keydown", stop);
    window.addEventListener("wheel", stop, { passive: true });
    return () => {
      window.clearTimeout(idle);
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("keydown", stop);
      window.removeEventListener("wheel", stop);
    };
  }, [helpSeen]);

  React.useEffect(() => {
    if (!hasDoc) return;
    try {
      if (localStorage.getItem("keymano-doc-nudge") === "1") return;
      localStorage.setItem("keymano-doc-nudge", "1");
    } catch {
      return;
    }
    const id = setTimeout(() => {
      toast(t("help.nudge"), {
        action: { label: t("help.nudgeAction"), onClick: openTour },
        duration: 8000,
      });
    }, 900);
    return () => clearTimeout(id);
  }, [hasDoc, openTour, t]);

  return { helpHint, openTour, showTour, setShowTour };
}
