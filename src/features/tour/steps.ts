// Per-page guided-tour structure. Copy lives in i18n (common namespace) under
// `tour.*` keys so it's translated like the rest of the UI. Each step optionally
// anchors to an element tagged with `data-tour="<anchor>"`; steps with no anchor
// (or a missing one) render as a centered card.

export interface TourStep {
  anchor?: string;
  /** i18n key for the title (common namespace). */
  titleKey: string;
  /** i18n key for the body. */
  bodyKey: string;
}

export type TourKey = "welcome" | "editor" | "modifiers" | "deadkeys" | "bundle" | "xml";

const step = (titleKey: string, bodyKey: string, anchor?: string): TourStep => ({
  titleKey,
  bodyKey,
  anchor,
});

export const TOURS: Record<TourKey, TourStep[]> = {
  welcome: [
    step("tour.welcome.intro.title", "tour.welcome.intro.body"),
    step("tour.welcome.tiles.title", "tour.welcome.tiles.body", "welcome-tiles"),
    step("tour.welcome.open.title", "tour.welcome.open.body", "topbar-open"),
  ],
  editor: [
    step("tour.editor.keyboard.title", "tour.editor.keyboard.body", "tour-keyboard"),
    step("tour.editor.modbar.title", "tour.editor.modbar.body", "tour-modbar"),
    step("tour.editor.kbtype.title", "tour.editor.kbtype.body", "tour-kbtype"),
    step("tour.editor.tools.title", "tour.editor.tools.body", "tour-tools"),
    step("tour.editor.find.title", "tour.editor.find.body", "tour-find"),
    step("tour.editor.export.title", "tour.editor.export.body", "tour-export"),
    step("tour.editor.inspector.title", "tour.editor.inspector.body", "tour-inspector"),
  ],
  modifiers: [step("tour.modifiers.map.title", "tour.modifiers.map.body", "tour-page")],
  deadkeys: [
    step("tour.deadkeys.intro.title", "tour.deadkeys.intro.body", "tour-page"),
    step("tour.deadkeys.housekeeping.title", "tour.deadkeys.housekeeping.body", "tour-housekeeping"),
  ],
  bundle: [step("tour.bundle.intro.title", "tour.bundle.intro.body", "tour-page")],
  xml: [
    step("tour.xml.intro.title", "tour.xml.intro.body", "tour-page"),
    step("tour.xml.validation.title", "tour.xml.validation.body", "tour-validation"),
  ],
};
