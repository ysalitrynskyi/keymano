import { BundlePage } from "@/pages/Bundle";
import { DeadKeysPage } from "@/pages/DeadKeys";
import { EditorPage } from "@/pages/Editor";
import { ModifiersPage } from "@/pages/Modifiers";
import { WelcomePage } from "@/pages/Welcome";
import { XmlPage } from "@/pages/Xml";

export type Page = "editor" | "modifiers" | "deadkeys" | "bundle" | "xml";

export const PAGE_ORDER: Page[] = ["editor", "modifiers", "deadkeys", "bundle", "xml"];

export const PAGE_LABEL_KEY: Record<Page, string> = {
  editor: "nav.editor",
  modifiers: "nav.modifiers",
  deadkeys: "nav.deadkeys",
  bundle: "nav.bundle",
  xml: "nav.xml",
};

export function pageForDocState(page: Page, hasDoc: boolean) {
  if (!hasDoc) return <WelcomePage />;
  switch (page) {
    case "editor":
      return <EditorPage />;
    case "modifiers":
      return <ModifiersPage />;
    case "deadkeys":
      return <DeadKeysPage />;
    case "bundle":
      return <BundlePage />;
    case "xml":
      return <XmlPage />;
  }
}
