import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";

import { useEditor } from "@/store/editor";

export function resetEditorState(): void {
  useEditor.setState({ docs: [], activeDocId: null, snapshot: null });
}

export function renderWithEditor(ui: ReactElement, options?: RenderOptions) {
  resetEditorState();
  return render(ui, options);
}
