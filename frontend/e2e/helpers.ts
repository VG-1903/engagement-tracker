import { expect, type APIRequestContext, type Page } from "@playwright/test";

// E2E_API_URL targets a deployed API (see playwright.config.ts); default is the local e2e server.
export const API = process.env.E2E_API_URL ?? "http://localhost:8001";

export const USERS = {
  admin: { email: "admin@example.com", password: "Admin@123", name: "Asha Admin" },
  priya: { email: "priya.manager@example.com", password: "Manager@123", name: "Priya Sharma" },
  rahul: { email: "rahul.manager@example.com", password: "Manager@123", name: "Rahul Verma" },
  anita: { email: "anita@example.com", password: "Member@123", name: "Anita Desai" },
  karan: { email: "karan@example.com", password: "Member@123", name: "Karan Mehta" },
} as const;
export type Who = keyof typeof USERS;

export async function token(request: APIRequestContext, who: Who): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: USERS[who] });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).access_token;
}

/** Sign in without the UI (the login form itself is covered in auth.spec.ts). */
export async function signIn(page: Page, request: APIRequestContext, who: Who, path = "/dashboard") {
  const t = await token(request, who);
  await page.addInitScript((value) => localStorage.setItem("et_token", value), t);
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

export async function apiGet<T>(request: APIRequestContext, who: Who, path: string): Promise<T> {
  const res = await request.get(`${API}${path}`, { headers: { Authorization: `Bearer ${await token(request, who)}` } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}

/** First task visible to `who` matching a predicate: keeps specs independent of database ids. */
export async function findTask(
  request: APIRequestContext,
  who: Who,
  pred: (t: { id: number; title: string; status: string; engagement: { client_name: string; period_label: string | null } }) => boolean,
) {
  let cursor: string | null = null;
  do {
    const q: string = `/tasks?limit=100${cursor ? `&cursor=${cursor}` : ""}`;
    const page = await apiGet<{ items: Parameters<typeof pred>[0][]; next_cursor: string | null }>(request, who, q);
    const hit = page.items.find(pred);
    if (hit) return hit;
    cursor = page.next_cursor;
  } while (cursor);
  throw new Error("no matching task");
}

/** Opens a task's drawer through its deep link (/tasks?task=ID) and waits for it to load. */
export async function openTask(page: Page, taskId: number, title: string) {
  await page.goto(`/tasks?view=all&task=${taskId}`);
  const d = page.getByRole("dialog", { name: title });
  await expect(d.getByRole("heading", { name: title })).toBeVisible();
  await expect(d.getByText("Activity")).toBeVisible();
  return d;
}

export function isoPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
