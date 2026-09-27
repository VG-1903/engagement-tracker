import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("admin (Asha)", () => {
  test("client CRUD with GSTIN validation and in-use protection", async ({ page, request }) => {
    await signIn(page, request, "admin", "/admin/clients");

    await page.getByRole("button", { name: "Add client" }).click();
    let m = page.getByRole("dialog", { name: "Add client" });
    await m.getByLabel("Legal name").fill("Zenith Exports LLP");
    await m.getByLabel("GSTIN").fill("12345");
    await m.getByRole("button", { name: "Add client" }).click();
    await expect(m.getByRole("alert")).toContainText("GSTIN must be a valid");

    await m.getByLabel("GSTIN").fill("29AAZFZ1234K1Z9");
    await m.getByRole("button", { name: "Add client" }).click();
    await expect(page.getByText("Zenith Exports LLP saved")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Zenith Exports LLP" })).toBeVisible();

    // duplicate GSTIN is refused by the unique constraint
    await page.getByRole("button", { name: "Add client" }).click();
    m = page.getByRole("dialog", { name: "Add client" });
    await m.getByLabel("Legal name").fill("Copycat Traders");
    await m.getByLabel("GSTIN").fill("29AAZFZ1234K1Z9");
    await m.getByRole("button", { name: "Add client" }).click();
    await expect(m.getByRole("alert")).toContainText("already exists");
    await m.getByRole("button", { name: "Cancel" }).click();

    // search
    await page.getByPlaceholder("Search name, GSTIN, email").fill("zenith");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page.getByPlaceholder("Search name, GSTIN, email").fill("");

    // a client with engagements cannot be deleted
    const arora = page.locator("tr", { hasText: "Arora Textiles" });
    await arora.hover();
    await arora.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog", { name: "Delete client?" }).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "has engagements" })).toBeVisible();

    // a new one can
    const zenith = page.locator("tr", { hasText: "Zenith Exports" });
    await zenith.hover();
    await zenith.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog", { name: "Delete client?" }).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Zenith Exports LLP deleted")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Zenith Exports LLP" })).toHaveCount(0);
  });

  test("create a quarterly service and build its checklist", async ({ page, request }) => {
    await signIn(page, request, "admin", "/admin/service-types");
    await page.getByRole("button", { name: "New service" }).click();
    const m = page.getByRole("dialog", { name: "New service" });
    await m.getByLabel("Name").fill("Quarterly TDS Returns");
    await m.getByLabel("Repeats").selectOption("QUARTERLY");
    await m.getByRole("button", { name: "Create service" }).click();
    await expect(page.getByText("Quarterly TDS Returns created")).toBeVisible();

    const card = page.getByRole("region", { name: "Quarterly TDS Returns" });
    await expect(card.getByText("No checklist yet.")).toBeVisible();
    await card.getByRole("button", { name: "Add task" }).click();
    const t = page.getByRole("dialog", { name: "Add task to checklist" });
    await t.getByLabel("Title").fill("File Form 26Q");
    await t.getByLabel("Due after (days)").fill("31");
    await t.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Checklist updated")).toBeVisible();
    await expect(page.getByText("File Form 26Q")).toBeVisible();
    await expect(page.getByText("Due 31d after period end").first()).toBeVisible();
  });

  test("recurring generation can be re-run safely", async ({ page, request }) => {
    await signIn(page, request, "admin", "/admin/service-types");
    await page.getByRole("button", { name: "Run now" }).click();
    await expect(page.getByText(/\d+ created, \d+ already up to date/)).toBeVisible();
    await page.getByRole("button", { name: "Run now" }).click();
    await expect(page.getByText(/0 created, \d+ already up to date/)).toBeVisible();
  });

  test("add a person, change their role, deactivate them", async ({ page, request }) => {
    await signIn(page, request, "admin", "/admin/users");
    await page.getByRole("button", { name: "Add person" }).click();
    const m = page.getByRole("dialog", { name: "Add person" });
    await m.getByLabel("Full name").fill("Rohan Kapoor");
    await m.getByLabel("Email").fill("rohan@example.com");
    await m.getByLabel("Temporary password").fill("Welcome@123");
    await m.getByRole("button", { name: "Add person" }).click();
    await expect(page.getByText("Rohan Kapoor added")).toBeVisible();

    const row = page.locator("tr", { hasText: "rohan@example.com" });
    await row.getByLabel("Role for Rohan Kapoor").selectOption("MANAGER");
    await expect(page.getByText("Rohan Kapoor is now manager")).toBeVisible();
    await row.getByRole("button", { name: "Deactivate" }).click();
    await expect(row.getByText("Deactivated")).toBeVisible();

    // the deactivated account can no longer sign in
    const res = await request.post("http://localhost:8001/auth/login", {
      data: { email: "rohan@example.com", password: "Welcome@123" },
    });
    expect(res.status()).toBe(401);

    // admins cannot demote or deactivate themselves from the UI
    const me = page.locator("tr", { hasText: "admin@example.com" });
    await expect(me.getByLabel("Role for Asha Admin")).toBeDisabled();
    await expect(me.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
  });
});
