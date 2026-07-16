import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";
import { Logo } from "./Logo";
import { Splash } from "./Splash";
import { ErrorBoundary } from "./ErrorBoundary";
import { ConfirmDialog } from "./ConfirmDialog";
import { About } from "./About";
import { Dialog } from "./ui";
import { InstalledPicker } from "@/features/installed/InstalledPicker";
import { ipc } from "@/lib/ipc";

afterEach(cleanup);

describe("Logo", () => {
  it("renders an accessible svg emblem", () => {
    render(<Logo size={48} />);
    expect(screen.getByRole("img", { name: "Keymano" })).toBeInTheDocument();
  });

  it("renders unique gradient ids per instance", () => {
    const { container } = render(
      <div>
        <Logo />
        <Logo />
      </div>,
    );
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length); // all unique
  });
});

describe("Splash", () => {
  it("calls onDone when clicked", () => {
    const onDone = vi.fn();
    render(<Splash onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: /Skip intro/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("calls onDone on any key", () => {
    const onDone = vi.fn();
    render(<Splash onDone={onDone} />);
    fireEvent.keyDown(window, { key: "x" });
    expect(onDone).toHaveBeenCalled();
  });
});

describe("ErrorBoundary", () => {
  function Boom(): never {
    throw new Error("kaboom");
  }

  it("renders a recoverable fallback when a child throws", () => {
    // the boundary logs to console.error — silence it for this expected throw
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("kaboom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    spy.mockRestore();
  });

  it("renders children unchanged when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ConfirmDialog", () => {
  it("does not confirm a destructive action on a global Enter key", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Discard unsaved changes?"
        message="This layout has unsaved edits."
        confirmLabel="Discard"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.keyDown(window, { key: "Enter" });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("still confirms through the explicit confirm button", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Discard unsaved changes?"
        message="This layout has unsaved edits."
        confirmLabel="Discard"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe("Dialog", () => {
  it("closes on backdrop click but not content click", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Test dialog" onClose={onClose}>
        <button>Inside</button>
      </Dialog>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Inside" }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog", { name: "Test dialog" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("About", () => {
  it("renders app metadata and closes on Escape", () => {
    const onClose = vi.fn();
    const origOpenExternal = ipc.openExternal;
    ipc.openExternal = vi.fn(async () => undefined);
    render(<About onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "About Keymano" })).toBeInTheDocument();
    expect(screen.getByText("Apache-2.0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yevhen Salitrynskyi" }));
    fireEvent.click(screen.getByRole("button", { name: "GitHub" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(ipc.openExternal).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    ipc.openExternal = origOpenExternal;
  });
});

describe("InstalledPicker", () => {
  it("shows the empty state on web (no system access)", async () => {
    const onClose = vi.fn();
    render(<InstalledPicker onClose={onClose} />);
    // The browser can't read the OS, so the web backend returns no layouts and the
    // picker explains that — no fake/misleading entries.
    expect(await screen.findByText(/No installed layout files/)).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<InstalledPicker onClose={onClose} />);
    await screen.findByText(/No installed layout files/);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
