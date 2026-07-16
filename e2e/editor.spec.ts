import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip intro" }).click();
});

test("creates, edits, undoes, redoes, validates, and exports a layout", async ({ page }) => {
  await page.getByRole("button", { name: /Standard \(US\)/ }).click();
  await expect(page.getByTestId("keyboard-svg")).toBeVisible();
  await expect(page.getByLabel(/key 0: a/)).toBeVisible();

  await page.getByLabel(/key 0: a/).click();
  await page.getByText("Edit output").click();
  await page.getByLabel("Output").fill("ø");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByLabel(/key 0: ø/)).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByLabel(/key 0: a/)).toBeVisible();
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByLabel(/key 0: ø/)).toBeVisible();

  await page.getByRole("button", { name: "XML & Validation" }).click();
  await expect(page.getByText(/<keyboard/)).toBeVisible();
  await expect(page.getByText("Valid", { exact: true })).toBeVisible();

  const keylayoutDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save" }).click();
  await expect((await keylayoutDownload).suggestedFilename()).toMatch(/\.keylayout$/);

  const bundleDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("menuitem", { name: /Export as \.bundle/ }).click();
  await expect((await bundleDownload).suggestedFilename()).toMatch(/\.bundle\.zip$/);
});

test("opens an example .keylayout through the browser picker", async ({ page }) => {
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("main").getByRole("button", { name: "Open…" }).click();
  const chooser = await chooserPromise;

  await chooser.setFiles("examples/Ukrainian (Phonetic).keylayout");

  await expect(page.getByTestId("keyboard-svg")).toBeVisible();
  await page.getByRole("button", { name: "XML & Validation" }).click();
  await expect(page.getByText(/<keyboard/)).toBeVisible();
});
