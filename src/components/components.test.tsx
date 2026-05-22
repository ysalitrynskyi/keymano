import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";
import { Logo } from "./Logo";
import { Splash } from "./Splash";
import { ErrorBoundary } from "./ErrorBoundary";
import { InstalledPicker } from "@/features/installed/InstalledPicker";

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

describe("InstalledPicker", () => {
  it("shows the empty state on web (no system access)", async () => {
    const onClose = vi.fn();
    render(<InstalledPicker onClose={onClose} />);
    // The browser can't read the OS, so the web-mock returns no layouts and the
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
