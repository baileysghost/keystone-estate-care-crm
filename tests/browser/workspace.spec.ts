import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page, baseURL }) => {
  if (
    !baseURL ||
    !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)
  )
    throw Error("UI tests write fictional data. Use an isolated local demo.");
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Active customers/ }),
  ).toBeVisible();
});
test("create a lead, filter, drag between stages, convert and reload", async ({
  page,
}) => {
  const name = "QA residence " + Date.now();
  await page.getByRole("button", { name: "Quick add" }).click();
  await page.getByRole("button", { name: "New lead", exact: true }).click();
  await page.getByLabel("Name or title").fill(name);
  await page.getByRole("button", { name: "Save lead" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Sales leads", exact: true }).click();
  await page.getByLabel("Search directory").fill(name);
  await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(1);
  await page
    .getByRole("button", { name: "Sales Pipeline", exact: true })
    .click();
  const card = page
    .locator(".deal")
    .filter({ has: page.getByRole("button", { name, exact: true }) });
  const target = page
    .locator(".stage")
    .filter({ has: page.getByRole("heading", { name: /^Contact Attempted/ }) });
  const handle = page.getByRole("button", {
    name: "Drag " + name,
    exact: true,
  });
  await handle.scrollIntoViewIfNeeded();
  const a = await handle.boundingBox(),
    b = await target.boundingBox();
  if (!a || !b) throw Error("Missing board bounds");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, {
    steps: 4,
  });
  await page.mouse.move(b.x + b.width / 2, Math.max(15, a.y), { steps: 18 });
  await page.mouse.up();
  await expect(target.locator(".deal").filter({ hasText: name })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("combobox").selectOption("Won");
  await expect(page.getByRole("dialog")).toContainText("Customer");
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText(name);
});
test("uploads a document and downloads the same bytes", async ({
  page,
  request,
}) => {
  const name = "sample-" + Date.now() + ".txt";
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "Upload file" }).click();
  await page.locator("input[type=file]").setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from("Fictional service summary."),
  });
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Search directory").fill(name);
  await page.getByRole("button", { name: new RegExp(name) }).click();
  const url = await page
    .getByRole("link", { name: "Download" })
    .getAttribute("href");
  const file = await request.get(url!);
  expect(file.status()).toBe(200);
  expect(await file.text()).toBe("Fictional service summary.");
});
test("mobile navigation, task completion and grouped search", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "Tasks & Follow-Ups", exact: true })
    .click();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const title = "QA follow-up " + Date.now();
  await page.getByLabel("Name or title").fill(title);
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Search directory").fill(title);
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByRole("dialog")).toContainText("Completed");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Name, email, phone, address or tag").fill(title);
  await expect(
    page.getByRole("dialog").getByRole("button", { name: title }),
  ).toBeVisible();
});
test("CSV lead import, bulk archive, restore and export", async ({ page }) => {
  await page.getByRole("button", { name: "Sales leads", exact: true }).click();
  const name = "CSV household " + Date.now();
  await page.locator("input[type=file]").setInputFiles({
    name: "leads.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "name,email,status\n" + name + ",sample.csv@example.test,Qualified",
    ),
  });
  await page.getByLabel("Search directory").fill(name);
  await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible();
  await page.getByLabel("Select " + name, { exact: true }).check();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await page.getByLabel("Select " + name, { exact: true }).check();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("button", { name: "Current", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe("lead.csv");
});
test("reschedule an appointment, change calendar views, and filter reports", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page
    .getByRole("button", { name: "New appointment", exact: true })
    .click();
  const title = "QA visit " + Date.now();
  await page.getByLabel("Name or title").fill(title);
  await page.getByLabel("Time", { exact: true }).fill("14:00");
  await page.getByRole("button", { name: "Save appointment" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Calendar view").selectOption("Day");
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "Edit appointment" }).click();
  await page.getByLabel("Time", { exact: true }).fill("16:30");
  await page.getByRole("button", { name: "Save appointment" }).click();
  await expect(
    page.getByRole("button", { name: "16:30 " + title }),
  ).toBeVisible();
  for (const v of ["Week", "Month", "Agenda"])
    await page.getByLabel("Calendar view").selectOption(v);
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await page.getByLabel("Created from").fill("2099-01-01");
  await expect(
    page.getByText("No records in this period.").first(),
  ).toBeVisible();
});
test("probate intake and billing criteria persist in the lead profile", async ({
  page,
}) => {
  await expect(
    page.getByRole("img", { name: "Keystone Estate Care" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sales leads", exact: true }).click();
  await page.getByRole("button", { name: "New lead", exact: true }).click();
  const name = "Probate intake " + Date.now();
  await page.getByLabel("Name or title").fill(name);
  await page
    .getByRole("dialog")
    .getByLabel("Estate name")
    .fill("Example Estate");
  await page
    .getByRole("dialog")
    .getByLabel("Probate county")
    .fill("Los Angeles");
  await page
    .getByRole("dialog")
    .getByLabel("Billing arrangement")
    .selectOption("Escrow-deferred");
  await page.getByRole("button", { name: "Save lead" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Search directory").fill(name);
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("dialog")).toContainText("Escrow-deferred");
});
test("mobile probate inbox opens fictional evidence and run history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Load fictional examples" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "New Leads", exact: true }).click();
  await page.getByLabel("Dataset").selectOption("true");
  await page
    .getByRole("button", { name: "DEMO-2026-00001", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Score breakdown" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Fictional legal notice" }),
  ).toBeVisible();
});
