import { expect, test, type Page } from "@playwright/test";
import { E2E_ENV } from "../playwright.config";
import { db, PASSWORD, phone, STAFF } from "./db";

test.afterAll(async () => {
  await db.$disconnect();
});

const CARD = "4021876543";

async function chooseAndPay(
  page: Page,
  opts: { phone: string; method?: "mtn_momo" | "orange_money" },
) {
  await page.goto("/");
  await page.getByLabel("Smartcard number").fill(CARD);
  await page.getByTestId("package-compact").click();
  await page.getByTestId("continue").click();

  await expect(page).toHaveURL(/\/months\?card=4021876543&package=compact/);
  await page.getByTestId("months-3").click();
  await expect(page.getByTestId("total")).toHaveText("45 000 FCFA");
  await expect(page).toHaveURL(/months=3/); // choices survive a refresh
  await page.reload();
  await expect(page.getByTestId("total")).toHaveText("45 000 FCFA");
  await page.getByTestId("continue").click();

  await expect(page).toHaveURL(/\/pay\?/);
  await page.getByTestId(`method-${opts.method ?? "mtn_momo"}`).click();
  await page.locator("#phone").fill(opts.phone);
  await page.locator("#confirm").fill(CARD);
  await page.getByTestId("pay").click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}\/approve$/);
  await expect(page.getByRole("heading", { name: "Approve on your phone" })).toBeVisible();
}

const orderIdFrom = (url: string) => /orders\/([0-9a-f-]{36})/.exec(url)![1];

test("happy path: pay, auto-advance, staff marks renewed, customer sees done", async ({
  page,
  browser,
}) => {
  await chooseAndPay(page, { phone: phone(7) });
  const id = orderIdFrom(page.url());

  // Screen 4 moves to screen 5 by itself once FakeProvider confirms.
  await expect(page).toHaveURL(new RegExp(`/orders/${id}$`), { timeout: 20_000 });
  await expect(page.getByTestId("headline")).toHaveText("Payment received");
  const reference = (await page.getByTestId("reference").textContent())!.trim();
  expect(reference).toMatch(/^HR-\d{6}$/);

  // Staff renews it from the admin queue (desktop).
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const admin = await adminCtx.newPage();
  await admin.goto("/admin/orders");
  await expect(admin).toHaveURL(/\/admin\/login/);
  await admin.getByLabel("Email").fill(STAFF.email);
  await admin.getByLabel("Password").fill(PASSWORD);
  await admin.getByRole("button", { name: "Sign in" }).click();
  await expect(admin.getByRole("heading", { name: "Orders to fulfil" })).toBeVisible();
  const row = admin.getByTestId(`order-${reference}`);
  await expect(row).toBeVisible();
  await row.getByTestId("mark-renewed").click();
  await admin.getByLabel("DStv agent receipt number or note").fill("AGENT-RCPT-7781");
  await admin.getByTestId("confirm-renewed").click();
  await expect(admin.getByTestId("toast")).toContainText(`${reference} marked renewed`);

  // Staff cannot open owner settings.
  await admin.goto("/admin/packages");
  await expect(admin.getByTestId("owner-only")).toBeVisible();
  expect((await admin.request.get("/api/admin/packages")).status()).toBe(403);
  expect((await admin.request.get("/api/admin/users")).status()).toBe(403);
  await adminCtx.close();

  // Customer page updates on its own.
  await expect(page.getByTestId("headline")).toHaveText("Your DStv is renewed", {
    timeout: 15_000,
  });

  const order = await db.order.findUniqueOrThrow({
    where: { id },
    include: { smsMessages: true, events: true },
  });
  expect(order.status).toBe("renewed");
  expect(order.totalXaf).toBe(45000);
  expect(order.adminNote).toContain("AGENT-RCPT-7781");
  expect(order.smsMessages.map((m) => m.kind).sort()).toEqual(["payment_received", "renewed"]);
  expect(order.events.map((e) => e.toStatus)).toEqual(
    expect.arrayContaining(["awaiting_payment", "paid", "renewed"]),
  );

  // Receipt
  const receipt = await page.request.get(`/api/orders/${id}/receipt`);
  expect(receipt.status()).toBe(200);
  expect(await receipt.text()).toContain(reference);
});

test("failed payment, then retry with another number succeeds", async ({ page }) => {
  await chooseAndPay(page, { phone: phone(0), method: "orange_money" }); // ends in 0 -> declined
  const failedId = orderIdFrom(page.url());
  await expect(page.getByTestId("payment-failed")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("declined")).toBeVisible();

  await page.getByTestId("try-again").click();
  await expect(page).toHaveURL(/\/pay\?.*method=orange_money/);
  await expect(page.getByTestId("method-orange_money")).toHaveAttribute("aria-checked", "true");
  await page.locator("#phone").fill(phone(3));
  await page.locator("#confirm").fill(CARD);
  await page.getByTestId("pay").click();
  await expect(page).toHaveURL(/\/approve$/);
  const retryId = orderIdFrom(page.url());
  expect(retryId).not.toBe(failedId);

  await expect(page.getByTestId("headline")).toHaveText("Payment received", { timeout: 20_000 });
  expect((await db.order.findUniqueOrThrow({ where: { id: failedId } })).status).toBe(
    "payment_failed",
  );
  expect((await db.order.findUniqueOrThrow({ where: { id: retryId } })).status).toBe("paid");
});

test("an unpaid order expires after 10 minutes (fake clock)", async ({ page, request }) => {
  const pkg = await db.package.findUniqueOrThrow({ where: { code: "family" } });
  const res = await request.post("/api/orders", {
    data: {
      smartcardNumber: CARD,
      smartcardConfirm: CARD,
      packageId: pkg.id,
      months: 1,
      phone: phone(5),
      paymentMethod: "mtn_momo",
    },
  });
  expect(res.status()).toBe(201);
  const { id } = await res.json();

  await page.clock.install();
  await page.goto(`/orders/${id}/approve`);
  await expect(page.getByTestId("approve")).toBeVisible();
  await expect(page.getByText(/Waiting for approval · (9|10):\d\d/)).toBeVisible();

  // 9 minutes in: reconcile leaves it alone.
  const reconcile = (minutes: number) =>
    request.get("/api/cron/reconcile", {
      headers: {
        authorization: `Bearer ${E2E_ENV.CRON_SECRET}`,
        "x-test-now": new Date(Date.now() + minutes * 60_000).toISOString(),
      },
    });
  expect((await (await reconcile(9)).json()).ordersExpired).toBe(0);

  // 11 minutes in (browser and server clocks both moved): order expires, screen offers Try again.
  await page.clock.fastForward("11:00");
  expect((await (await reconcile(11)).json()).ordersExpired).toBe(1);
  await page.clock.runFor(4_000);
  await expect(page.getByRole("heading", { name: "Payment timed out" })).toBeVisible();
  await expect(page.getByTestId("try-again")).toBeVisible();

  const order = await db.order.findUniqueOrThrow({ where: { id }, include: { events: true } });
  expect(order.status).toBe("expired");
  expect(order.events.find((e) => e.toStatus === "expired")?.actor).toBe("system");
});
