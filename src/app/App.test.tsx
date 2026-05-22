import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import "@/lib/i18n";
import { useEditor } from "@/store/editor";
import { App } from "./App";

afterEach(cleanup);

describe("App integration", () => {
  beforeEach(() => {
    useEditor.setState({ docs: [], activeDocId: null, snapshot: null });
  });

  it("opens Preferences from the gear even with no document", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByText("Keymano").length).toBeGreaterThan(0));
    // gear button is present on the welcome screen (app-level, not per-layout)
    fireEvent.click(screen.getByRole("button", { name: "Preferences" }));
    expect(await screen.findByRole("dialog", { name: "Preferences" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Preferences" })).not.toBeInTheDocument(),
    );
  });

  it("shows the welcome screen then enters the editor", async () => {
    render(<App />);
    // i18n ready (app name renders)
    await waitFor(() => expect(screen.getAllByText("Keymano").length).toBeGreaterThan(0));

    const card = await screen.findByText("Standard (US)");
    fireEvent.click(card);

    // editor appears: nav tabs + keyboard with a key
    await waitFor(() => expect(screen.getByTestId("keyboard-svg")).toBeInTheDocument());
    expect(screen.getByLabelText(/key 0: a/)).toBeInTheDocument();
    // status bar shows the valid badge
    expect(screen.getByText("Valid")).toBeInTheDocument();
  });

  it("navigates to the XML page and shows generated keylayout", async () => {
    render(<App />);
    const card = await screen.findByText("Standard (US)");
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByTestId("keyboard-svg")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "XML & Validation" }));
    await waitFor(() => expect(screen.getByText(/<keyboard/)).toBeInTheDocument());
  });

  it("visits every page without crashing", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("Standard (US)"));
    await waitFor(() => expect(screen.getByTestId("keyboard-svg")).toBeInTheDocument());
    for (const name of ["Modifiers", "Dead Keys", "Bundle", "XML & Validation", "Editor"]) {
      fireEvent.click(screen.getByRole("button", { name }));
      await waitFor(() => expect(screen.getByRole("button", { name })).toBeInTheDocument());
    }
  });

  it("closes the key editor on Escape", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("Standard (US)"));
    await waitFor(() => expect(screen.getByTestId("keyboard-svg")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/key 0: a/));
    fireEvent.click(await screen.findByText("Edit output"));
    expect(await screen.findByLabelText("Output")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("Output")).not.toBeInTheDocument());
  });

  it("renames a layout tab", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("Standard (US)"));
    await waitFor(() => expect(screen.getByTestId("keyboard-svg")).toBeInTheDocument());
    const tabs = screen.getAllByTitle(/Double-click to rename/);
    fireEvent.doubleClick(tabs[tabs.length - 1]);
    const input = await screen.findByLabelText("Rename layout");
    fireEvent.change(input, { target: { value: "Renamed KB" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByTitle(/Renamed KB/)).toBeInTheDocument());
  });

  it("copies a key output and pastes it onto another via context menu", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("Standard (US)"));
    await waitFor(() => expect(screen.getByTestId("keyboard-svg")).toBeInTheDocument());

    fireEvent.contextMenu(screen.getByLabelText(/key 0: a/));
    fireEvent.click(await screen.findByText("Copy output"));

    fireEvent.contextMenu(screen.getByLabelText(/key 1: s/));
    fireEvent.click(await screen.findByText("Paste output"));

    await waitFor(() =>
      expect(useEditor.getState().snapshot!.keys[1].output).toBe("a"),
    );
  });

  it("shows the real modifier map on the Modifiers page", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("Standard (US)"));
    await waitFor(() => expect(screen.getByTestId("keyboard-svg")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Modifiers" }));
    expect((await screen.findAllByText("anyShift")).length).toBeGreaterThan(0);
    expect(screen.getByText("command")).toBeInTheDocument();
  });

  it("edits a terminator on the Dead Keys page", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("Standard (US)"));
    await waitFor(() => expect(screen.getByTestId("keyboard-svg")).toBeInTheDocument());
    const docId = useEditor.getState().activeDocId!;
    await useEditor.getState().makeKeyDead(2, "acute", "´");
    fireEvent.click(screen.getByRole("button", { name: "Dead Keys" }));
    const input = (await screen.findByLabelText(/Terminator acute/)) as HTMLInputElement;
    expect(input.value).toBe("´");
    fireEvent.change(input, { target: { value: "¨" } });
    fireEvent.blur(input);
    await waitFor(async () => {
      const { ipc } = await import("@/lib/ipc");
      const v = await ipc.actionsView(docId, 0);
      expect(v.terminators.find((w) => w.state === "acute")?.output).toBe("¨");
    });
  });

  it("finds a key by its output and selects it", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("Standard (US)"));
    await waitFor(() => expect(screen.getByTestId("keyboard-svg")).toBeInTheDocument());
    const input = screen.getByLabelText("Find key stroke");
    fireEvent.change(input, { target: { value: "s" } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    // inspector now shows the selected key (code 1 = 's')
    await waitFor(() => expect(screen.getByText("Key code")).toBeInTheDocument());
    expect(useEditor.getState().selectedCode).toBe(1);
  });

  it("warns before closing a layout with unsaved changes", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("Standard (US)"));
    await waitFor(() => expect(screen.getByTestId("keyboard-svg")).toBeInTheDocument());
    // make an edit → dirty
    fireEvent.click(screen.getByLabelText(/key 0: a/));
    fireEvent.click(await screen.findByText("Edit output"));
    const input = (await screen.findByLabelText("Output")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ø" } });
    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() => expect(screen.queryByLabelText("Output")).not.toBeInTheDocument());

    // closing the active tab now prompts
    const closes = screen.getAllByLabelText("Close");
    fireEvent.click(closes[closes.length - 1]);
    expect(await screen.findByText("Discard unsaved changes?")).toBeInTheDocument();
  });

  it("creates a dead key via the editor's Make Dead Key tab", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("Standard (US)"));
    await waitFor(() => expect(screen.getByTestId("keyboard-svg")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/key 2: d/));
    fireEvent.click(await screen.findByText("Edit output"));
    // switch to the dead-key tab; default state "acute" + terminator are prefilled
    fireEvent.click(screen.getByRole("button", { name: "Make Dead Key" }));
    fireEvent.click(screen.getByText("Confirm"));

    await waitFor(() => {
      const k = useEditor.getState().snapshot!.keys.find((x) => x.code === 2)!;
      expect(k.is_dead).toBe(true);
    });
  });

  it("edits a key output through the inspector dialog", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("Standard (US)"));
    await waitFor(() => expect(screen.getByTestId("keyboard-svg")).toBeInTheDocument());

    // select key 0 ('a')
    fireEvent.click(screen.getByLabelText(/key 0: a/));
    // inspector edit button opens the dialog
    fireEvent.click(await screen.findByText("Edit output"));
    const input = (await screen.findByLabelText("Output")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ñ" } });
    fireEvent.click(screen.getByText("Confirm"));

    await waitFor(() => expect(screen.getByLabelText(/key 0: ñ/)).toBeInTheDocument());
  });
});
