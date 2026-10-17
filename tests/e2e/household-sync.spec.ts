import { expect, test, type Browser, type Page } from "@playwright/test";
import { FakeSupabase } from "./fake-supabase";

async function openAs(browser: Browser, fake: FakeSupabase, name: string, email: string) {
  const user = fake.user(name, email);
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, ...test.info().project.use });
  await fake.attach(context, user);
  const page = await context.newPage();
  await page.goto("/");
  return page;
}

async function addTask(page: Page, title: string) {
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByRole("textbox", { name: "Task title" }).first().fill(title);
  await page.keyboard.press("Enter");
}

const row = (page: Page, title: string) => page.getByRole("listitem").filter({ hasText: title });

test("Dean and Lu share one list that stays in sync", async ({ browser }) => {
  const fake = new FakeSupabase();

  const dean = await openAs(browser, fake, "Dean", "dean@example.com");
  await expect(dean.getByRole("heading", { name: "Our Tasks" })).toBeVisible();
  await expect(dean.getByText("No tasks yet")).toBeVisible();
  await dean.screenshot({ path: "test-results/screens/01-empty.png" });

  // Dean invites Lu from the account sheet.
  await dean.getByRole("button", { name: "Account and household" }).click();
  await dean.getByRole("textbox", { name: "Email address to invite" }).fill("Lu@Example.com");
  await dean.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(dean.getByText("lu@example.com · invited")).toBeVisible();
  await dean.screenshot({ path: "test-results/screens/02-invite.png" });
  await dean.keyboard.press("Escape");

  // Lu signs in and accepts.
  const lu = await openAs(browser, fake, "Lu", "lu@example.com");
  await expect(lu.getByText("Dean invited you to share")).toBeVisible();
  await lu.screenshot({ path: "test-results/screens/03-join.png" });
  await lu.getByRole("button", { name: "Join" }).click();
  await expect(lu.getByRole("heading", { name: "Our Tasks" })).toBeVisible();

  // Dean adds "Buy milk"; Lu sees it without refreshing.
  await addTask(dean, "Buy milk");
  await expect(row(dean, "Buy milk")).toBeVisible();
  await expect(row(lu, "Buy milk")).toBeVisible();

  // Reverse: Lu adds a task, Dean sees it.
  await addTask(lu, "Book swim lessons");
  await expect(row(dean, "Book swim lessons")).toBeVisible();
  await dean.screenshot({ path: "test-results/screens/04-list.png" });

  // Lu completes "Buy milk"; it leaves Dean's active list.
  await row(lu, "Buy milk").getByRole("checkbox").click();
  await expect(dean.getByRole("button", { name: "Completed (1)" })).toBeVisible();
  await expect(row(dean, "Buy milk")).toHaveCount(0);

  // Dean reopens it from the completed section; Lu sees it active again.
  await dean.getByRole("button", { name: "Completed (1)" }).click();
  await dean.screenshot({ path: "test-results/screens/05-completed.png" });
  await row(dean, "Buy milk").getByRole("checkbox").click();
  await expect(lu.getByRole("button", { name: /Completed/ })).toHaveCount(0);
  await expect(row(lu, "Buy milk").getByRole("checkbox")).toHaveAttribute("aria-checked", "false");

  // Dean edits the title in task details, which show who added it.
  await row(dean, "Book swim lessons").getByRole("button", { name: "Book swim lessons" }).click();
  await expect(dean.getByText(/Added by Lu/)).toBeVisible();
  await dean.screenshot({ path: "test-results/screens/06-details.png" });
  const title = dean.getByRole("dialog", { name: "Task details" }).getByRole("textbox", { name: "Task title" });
  await title.fill("Book swim lessons for Saturday");
  await dean.getByRole("button", { name: "Done" }).click();
  await expect(row(lu, "Book swim lessons for Saturday")).toBeVisible();

  // Lu deletes it; it disappears for Dean.
  await row(lu, "Book swim lessons for Saturday").getByRole("button", { name: "Book swim lessons for Saturday" }).click();
  await lu.getByRole("button", { name: "Delete task" }).click();
  await expect(row(dean, "Book swim lessons for Saturday")).toHaveCount(0);
  await expect(row(lu, "Book swim lessons for Saturday")).toHaveCount(0);
});

test("a task that fails to save is kept and can be retried", async ({ browser }) => {
  const fake = new FakeSupabase();
  const dean = await openAs(browser, fake, "Dean", "dean@example.com");
  await expect(dean.getByRole("heading", { name: "Our Tasks" })).toBeVisible();

  fake.failNextTaskWrites = 1;
  await addTask(dean, "Pay nursery fees");
  await expect(row(dean, "Pay nursery fees").getByRole("button", { name: "Not saved · Retry" })).toBeVisible();
  await expect(dean.getByText(`"Pay nursery fees" wasn't saved yet`)).toBeVisible();
  await dean.screenshot({ path: "test-results/screens/07-unsaved.png" });

  // Still there after closing and reopening the app.
  await dean.reload();
  await expect(row(dean, "Pay nursery fees")).toBeVisible();
  await expect.poll(() => fake.tasks.map((t) => t.title)).toEqual(["Pay nursery fees"]);
  await expect(row(dean, "Pay nursery fees").getByRole("button", { name: /Retry/ })).toHaveCount(0);
});

test("a stranger's list is separate", async ({ browser }) => {
  const fake = new FakeSupabase();
  const dean = await openAs(browser, fake, "Dean", "dean@example.com");
  await addTask(dean, "Buy milk");
  await expect(row(dean, "Buy milk")).toBeVisible();

  const eve = await openAs(browser, fake, "Eve", "eve@example.com");
  await expect(eve.getByText("No tasks yet")).toBeVisible();
  await expect(row(eve, "Buy milk")).toHaveCount(0);
});

test("signed-out visitors see the Google sign-in screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await page.screenshot({ path: "test-results/screens/00-sign-in.png" });
});

test("the app is installable", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toContain("512x512");
  expect((await request.get("/sw.js")).ok()).toBe(true);
  expect((await request.get("/icons/apple-touch-icon.png")).ok()).toBe(true);
});
