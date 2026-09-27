import { expect, test } from "@playwright/test";
import { API, apiGet, findTask, openTask, signIn, token } from "./helpers";

test.describe("concurrency, filters & small screens", () => {
  test("a stale drawer is refreshed instead of overwriting someone else's change", async ({ page, request }) => {
    const t = await findTask(request, "karan", (x) => x.status === "NOT_STARTED" && x.engagement.client_name.startsWith("Bharat"));
    await signIn(page, request, "karan");
    const d = await openTask(page, t.id, t.title);

    // Meanwhile the manager moves the deadline (bumps the version)
    const cur = await apiGet<{ version: number }>(request, "priya", `/tasks/${t.id}`);
    const res = await request.patch(`${API}/tasks/${t.id}`, {
      headers: { Authorization: `Bearer ${await token(request, "priya")}` },
      data: { due_date: "2026-12-20", version: cur.version },
    });
    expect(res.ok()).toBeTruthy();

    await d.getByRole("button", { name: /^Start work/ }).click();
    await expect(d.getByRole("alert")).toContainText("Someone else changed this task");
    await expect(d.getByText("20 Dec 2026")).toBeVisible(); // reloaded with the manager's change

    await d.getByRole("button", { name: /^Start work/ }).click(); // retry succeeds on the fresh version
    await expect(page.getByText(`Start work: ${t.title}`)).toBeVisible();
  });

  test("task filters: overdue and due today", async ({ page, request }) => {
    await signIn(page, request, "priya", "/tasks?view=overdue");
    const overdue = page.locator("tbody tr");
    await expect(overdue.first()).toBeVisible();
    for (const text of await overdue.locator("td:nth-child(3)").allInnerTexts()) expect(text).toMatch(/overdue/);

    await page.getByRole("tab", { name: "Due today" }).click();
    await expect(page.locator("tbody td:nth-child(3)").first()).toHaveText("Due today");
    for (const text of await page.locator("tbody td:nth-child(3)").allInnerTexts()) expect(text).toBe("Due today");

    await page.getByLabel("Filter by status").selectOption("COMPLETED");
    await expect(page.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("tbody td:nth-child(4)").first()).toHaveText("Completed");
    for (const text of await page.locator("tbody td:nth-child(4)").allInnerTexts()) expect(text).toBe("Completed");
  });

  test("dashboard tiles switch the list", async ({ page, request }) => {
    await signIn(page, request, "priya");
    await page.getByRole("button", { name: /With client/ }).click();
    await expect(page.getByRole("heading", { name: "Tasks waiting for client" })).toBeVisible();
    await expect(page.locator("tbody td:nth-child(4)").first()).toHaveText("Waiting for client");
    for (const text of await page.locator("tbody td:nth-child(4)").allInnerTexts()) expect(text).toBe("Waiting for client");
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test("menu, task cards and the drawer work on a phone", async ({ page, request }) => {
      await signIn(page, request, "anita", "/tasks");
      await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
      await page.getByRole("button", { name: "Open menu" }).click();
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Engagements" }).click();
      await expect(page.getByRole("heading", { name: "Engagements", level: 1 })).toBeVisible();

      await page.goto("/tasks");
      const card = page.locator("ul li button").first();
      await card.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect(scroll).toBe(true); // no horizontal page scroll
    });
  });
});
