import { expect, test } from "@playwright/test";
import { USERS, signIn } from "./helpers";

test.describe("sign in & navigation", () => {
  test("wrong password shows a clear error and stays on the login page", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(USERS.anita.email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password" })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("signing in with the form lands on the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(USERS.priya.email);
    await page.getByLabel("Password").fill(USERS.priya.password);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Priya");
  });

  test("demo account buttons sign straight in", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Member.*Anita Desai/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Tasks assigned to you.")).toBeVisible();
  });

  test("navigation is role-aware", async ({ page, request }) => {
    const main = page.getByRole("navigation", { name: "Main" });

    await signIn(page, request, "anita");
    await expect(main.getByRole("link", { name: "Tasks" })).toBeVisible();
    await expect(main.getByRole("link", { name: "Clients" })).toHaveCount(0);

    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await signIn(page, request, "admin");
    for (const name of ["Dashboard", "Tasks", "Engagements", "Clients", "Services", "People"]) {
      await expect(main.getByRole("link", { name })).toBeVisible();
    }
  });

  test("members who open an admin URL get a friendly no-access page", async ({ page, request }) => {
    await signIn(page, request, "anita", "/dashboard");
    await page.goto("/admin/clients");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
  });

  test("sign out clears the session and protects pages", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Member.*Anita Desai/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});
