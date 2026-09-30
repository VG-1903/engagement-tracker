import { expect, test } from "@playwright/test";
import { API, apiGet, findTask, openTask, signIn } from "./helpers";

function monthPlus(n: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

test.describe("manager (Priya)", () => {
  test("approves submitted work with a note", async ({ page, request }) => {
    const t = await findTask(request, "priya", (x) => x.status === "READY_FOR_REVIEW" && x.engagement.client_name.startsWith("Arora"));
    await signIn(page, request, "priya");
    const d = await openTask(page, t.id, t.title);

    await d.getByRole("button", { name: /^Approve/ }).click();
    await d.getByLabel("Add a note (optional)").fill("Ties to the sales register");
    await d.getByRole("button", { name: "Approve", exact: true }).click();

    await expect(page.getByText(`Approve: ${t.title}`)).toBeVisible();
    await expect(d.getByText("Done. This task was approved and is closed.")).toBeVisible();
    await expect(d.getByText("Ties to the sales register")).toBeVisible();
    await expect(d.getByText("Assignment & deadline")).toHaveCount(0); // completed tasks are read-only
  });

  test("request changes requires a note and sends the task back", async ({ page, request }) => {
    const t = await findTask(request, "priya", (x) => x.status === "IN_PROGRESS" && x.engagement.client_name.startsWith("Arora"));
    // Anita submits it first (through the API) so there is something to review
    const anita = await (await request.post(`${API}/auth/login`, { data: { email: "anita@example.com", password: "Member@123" } })).json();
    const cur = await apiGet<{ version: number }>(request, "anita", `/tasks/${t.id}`);
    await request.post(`${API}/tasks/${t.id}/transitions`, {
      headers: { Authorization: `Bearer ${anita.access_token}` },
      data: { action: "SUBMIT_FOR_REVIEW", version: cur.version },
    });

    await signIn(page, request, "priya");
    const d = await openTask(page, t.id, t.title);
    await d.getByRole("button", { name: /^Request changes/ }).click();
    const note = d.getByLabel("What needs to change?");
    await d.getByRole("button", { name: "Request changes", exact: true }).click();
    await expect(note).toBeVisible(); // blocked: note is required
    await note.fill("HSN summary is missing");
    await d.getByRole("button", { name: "Request changes", exact: true }).click();
    await expect(d.getByText("Sent back by the reviewer.")).toBeVisible();
  });

  test("cannot approve her own work even as the engagement manager", async ({ page, request }) => {
    const t = await findTask(request, "priya", (x) => x.status === "READY_FOR_REVIEW" && x.title.startsWith("Follow up with officer"));
    await signIn(page, request, "priya");
    const d = await openTask(page, t.id, t.title);
    await expect(d.getByRole("button", { name: /^Approve/ })).toHaveCount(0);
    await expect(d.getByText("Waiting for review. Someone other than the assignee has to approve it.")).toBeVisible();
  });

  test("reassigns a task and moves its deadline; both are audited", async ({ page, request }) => {
    const t = await findTask(request, "priya", (x) => x.status === "NOT_STARTED" && x.engagement.client_name.startsWith("Bharat"));
    await signIn(page, request, "priya");
    const d = await openTask(page, t.id, t.title);

    await d.getByLabel("Assignee").selectOption({ label: "Anita Desai" });
    await d.getByLabel("Due date").fill("2026-12-15");
    await d.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Task updated")).toBeVisible();
    await expect(d.getByText(/reassigned/)).toBeVisible();
    await expect(d.getByText(/due date changed/)).toBeVisible();
    await expect(d.getByText("15 Dec 2026")).toBeVisible();
  });

  test("creates an engagement, and a duplicate period is refused", async ({ page, request }) => {
    const period = monthPlus(3);
    await signIn(page, request, "priya", "/engagements");
    const create = async () => {
      await page.getByRole("button", { name: "New engagement" }).click();
      const m = page.getByRole("dialog", { name: "New engagement" });
      await m.getByLabel("Client").selectOption({ label: "Coastal Logistics Pvt Ltd" });
      await m.getByLabel("Service").selectOption({ label: "Monthly GST Compliance · monthly" });
      await m.getByLabel("Period").fill(period);
      await m.getByLabel("Assign tasks to").selectOption({ label: "Neha Iyer" });
      await expect(m.getByText("4 tasks will be created")).toBeVisible();
      await m.getByRole("button", { name: "Create engagement" }).click();
      return m;
    };

    await create();
    await expect(page).toHaveURL(/\/engagements\/\d+$/, { timeout: 30_000 }); // first visit compiles the route in dev
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Coastal Logistics Pvt Ltd");
    await expect(page.locator("tbody tr")).toHaveCount(4);

    await page.goto("/engagements");
    const m = await create();
    await expect(m.getByRole("alert")).toContainText("already exists");
    await m.getByRole("button", { name: "Open the existing engagement →" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Coastal Logistics Pvt Ltd");
  });

  test("generate next period is idempotent", async ({ page, request }) => {
    const list = await apiGet<{ items: { id: number; client: { name: string }; period_start: string | null }[] }>(
      request,
      "priya",
      "/engagements?limit=100",
    );
    const arora = list.items
      .filter((e) => e.client.name.startsWith("Arora") && e.period_start)
      .sort((a, b) => (a.period_start! < b.period_start! ? 1 : -1))[0];

    await signIn(page, request, "priya", `/engagements/${arora.id}`);
    await page.getByRole("button", { name: /Generate next period/ }).click();
    await expect(page).not.toHaveURL(new RegExp(`/engagements/${arora.id}$`));
    await expect(page.getByText(/Created [A-Z][a-z]{2} \d{4} with 4 tasks/)).toBeVisible();

    await page.goto(`/engagements/${arora.id}`);
    await page.getByRole("button", { name: /Generate next period/ }).click();
    await expect(page.getByText(/already exists, so nothing new was created/)).toBeVisible();
  });

  test("members don't see manager controls on an engagement", async ({ page, request }) => {
    const list = await apiGet<{ items: { id: number }[] }>(request, "anita", "/engagements?limit=1");
    await signIn(page, request, "anita", `/engagements/${list.items[0].id}`);
    await expect(page.getByRole("button", { name: /Generate next period/ })).toHaveCount(0);
  });
});
