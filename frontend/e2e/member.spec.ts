import { expect, test } from "@playwright/test";
import { apiGet, findTask, openTask, signIn } from "./helpers";

test.describe("team member (Anita)", () => {
  test("dashboard shows only her own work", async ({ page, request }) => {
    await signIn(page, request, "anita");
    await expect(page.getByText("Tasks assigned to you.")).toBeVisible();
    const dash = await apiGet<{ counts: Record<string, number> }>(request, "anita", "/dashboard");
    await expect(page.getByRole("button", { name: /Open/ }).getByText(String(dash.counts.open), { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Due today/ }).getByText(String(dash.counts.due_today), { exact: true })).toBeVisible();
  });

  test("task list never shows other people's tasks", async ({ page, request }) => {
    await signIn(page, request, "anita", "/tasks?view=all");
    await expect(page.getByRole("heading", { name: "My tasks" })).toBeVisible();
    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
    await expect(page.locator("tbody").getByText("KM", { exact: true })).toHaveCount(0); // Karan's avatar
    await expect(page.getByRole("button", { name: "Assigned to me" })).toHaveCount(0);
  });

  test("full work cycle: start → wait for client (note required) → resume → submit", async ({ page, request }) => {
    const t = await findTask(request, "anita", (x) => x.status === "NOT_STARTED" && x.title === "Prepare & file GSTR-1" && x.engagement.client_name.startsWith("Arora"));
    await signIn(page, request, "anita");
    const d = await openTask(page, t.id, t.title);

    // only work actions are offered to a member; no assignment editing
    await expect(d.getByRole("button", { name: /^Approve/ })).toHaveCount(0);
    await expect(d.getByText("Assignment & deadline")).toHaveCount(0);

    await d.getByRole("button", { name: /^Start work/ }).click();
    await expect(page.getByText(`Start work: ${t.title}`)).toBeVisible(); // toast
    await expect(d.getByText("In progress", { exact: true }).first()).toBeVisible();

    await d.getByRole("button", { name: /^Waiting on client/ }).click();
    const note = d.getByLabel("What are you waiting for from the client?");
    await expect(note).toBeFocused();
    await d.getByRole("button", { name: "Waiting on client", exact: true }).click(); // empty → browser blocks
    await expect(note).toBeVisible();
    await note.fill("Purchase register for the month");
    await d.getByRole("button", { name: "Waiting on client", exact: true }).click();
    await expect(d.getByText("On hold until the client responds.")).toBeVisible();
    await expect(d.getByText("Purchase register for the month")).toBeVisible(); // note in activity

    await d.getByRole("button", { name: /^Resume work/ }).click();
    await expect(d.getByRole("button", { name: /^Submit for review/ })).toBeVisible();
    await d.getByRole("button", { name: /^Submit for review/ }).click();
    await expect(d.getByText("Waiting for review. Someone other than the assignee has to approve it.")).toBeVisible();

    const history = await apiGet<{ action: string }[]>(request, "anita", `/tasks/${t.id}/history`);
    expect(history.map((h) => h.action)).toEqual(["CREATED", "START", "WAIT_FOR_CLIENT", "RESUME", "SUBMIT_FOR_REVIEW"]);
  });

  test("closing the drawer with Escape keeps the list", async ({ page, request }) => {
    const t = await findTask(request, "anita", (x) => x.status === "COMPLETED");
    await signIn(page, request, "anita");
    const d = await openTask(page, t.id, t.title);
    await expect(d.getByText("Done. This task was approved and is closed.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "My tasks" })).toBeVisible();
  });
});
