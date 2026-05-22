import { afterEach, describe, expect, it } from "vitest";

import { exportKeyboardPng } from "./exportImage";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("exportKeyboardPng", () => {
  it("throws when there is no keyboard svg", async () => {
    await expect(exportKeyboardPng("x.png")).rejects.toThrow(/No keyboard/);
  });
});
