# Hearay

Renew a DStv subscription from a phone or desktop. The customer picks a package and 1, 3, 6 or 12 months, then pays with MTN Mobile Money or Orange Money. In phase 1, staff renew the DStv account by hand from the admin screen, and the customer gets an SMS when it is done. The full spec is in [SPEC.md](SPEC.md).

**Stack:** Next.js 15 (App Router, TypeScript) as a PWA · Tailwind · Prisma + PostgreSQL (Supabase) · Supabase Auth for admins · Notch Pay behind a `PaymentProvider` interface · `SmsSender` interface · Vercel.

## Run it locally

```bash
cp .env.example .env            # defaults: FakeProvider, console SMS, dev admin login
npm install
npm run db:migrate              # needs Postgres at DATABASE_URL
npm run db:seed                 # 4 packages (price 0, hidden) + owner from SEED_OWNER_EMAIL
npm run dev
```

1. Open http://localhost:3000/admin and sign in as `owner@example.com` with the password in `DEV_ADMIN_PASSWORD` (`hearay-dev` by default).
2. In **Packages & prices**, set the prices and click **Show**.
3. Customers can now use http://localhost:3000.

FakeProvider confirms a payment 10 s after it starts. A phone number ending in **0** gets declined.

| Command                              | What it does                                                                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                           | Unit tests. Database integration tests also run when `TEST_DATABASE_URL` points to a **throwaway** DB (they delete orders).                                |
| `npm run test:e2e`                   | Playwright: happy path to renewed, failed payment then retry, expiry with a fake clock. Needs `E2E_DATABASE_URL` (throwaway DB) and `npm run build` first. |
| `scripts/smoke.sh`                   | Creates and pays an order with curl against FakeProvider.                                                                                                  |
| `npm run lint` / `npm run typecheck` | ESLint / tsc.                                                                                                                                              |

> **Use `npm run db:...` rather than `npx prisma ...`.** The project pins Prisma 6.19.0. A bare `npx prisma` can pick up a newer global Prisma (7.x), which rejects this schema with error P1012.

## How it fits together

- **Money** is whole FCFA in integers. Totals are computed only on the server (`lib/money.ts`). A DB CHECK constraint enforces `total = months × price + fee`.
- **Order status** changes go through `transitionOrder()` (`lib/orders.ts`). It checks the move against `lib/order-status.ts`, updates the row only if it is still in the expected state, and writes an `order_events` row.
- **Paid** is set only by `applyProviderResult()` (`lib/payments/service.ts`). That runs after a provider status check, which is triggered by:
  - a verified webhook (`/api/webhooks/{provider}`),
  - the customer's status poll (`GET /api/orders/{id}`, at most every 5 s per order),
  - the reconcile job (`/api/cron/reconcile`).
    The webhook body itself is never trusted for the outcome.
- **Webhooks** are stored in `webhook_events` keyed by the provider event id, so a repeated callback is processed once. Events with a bad signature are stored under a random id, so a forged event can't block the real one.
- **Switching providers** takes one variable: `PAYMENT_PROVIDER=fake|notchpay`. To add CamPay, implement `PaymentProvider` in `lib/payments/` and register it in `lib/payments/index.ts`.
- **SMS:** `lib/sms/index.ts`. `ConsoleSmsSender` logs to stdout. Every message is recorded in `sms_messages`, and each kind is sent at most once per order.
- **Admin auth:** `AUTH_MODE=supabase` in production. `AUTH_MODE=dev` is a local password login that is refused in production builds.

### Decisions the spec left open (worth a look)

- **Late payments.** If the provider confirms a payment _after_ the order was marked `payment_failed` or `expired`, the order still becomes `paid`, because the customer was charged. Only the system/webhook actor can make that move, never an admin.
- **Retries.** A failed attempt ends the order (`payment_failed`). **Try again** returns to screen 3 with everything pre-filled, and screen 3 creates a new order. **Resend prompt** on screen 4 adds another payment attempt to the same order, up to 5. If two attempts on one order both succeed, the order gets a "DUPLICATE PAYMENT — refund" note for staff.
- **Rate limits.** The per-phone limit (5/hour) is exact because it counts orders in the DB. The per-IP limit (20/hour) is kept in memory, so on serverless each instance has its own counter. Use Upstash/Redis if that's not enough.
- **Expiry** is 10 minutes from order creation (`ORDER_EXPIRY_MINUTES`).
- **Stats cards** show: to renew, paid today (+ FCFA), renewed today, and failed or expired today. "Today" is in Africa/Douala time.
- **Smartcard length** comes from `SMARTCARD_LENGTHS` (default `10`, comma-separated for several).
- **Service fee** is a flat `SERVICE_FEE_XAF` per order (default 0). This is still an open question in the spec.

## Deploy (task 11)

1. **Supabase.** Create a project. Copy the pooled connection string (port 6543, add `?pgbouncer=true`) into `DATABASE_URL` and the direct one (port 5432) into `DIRECT_URL`. Copy the URL, anon key and service-role key from Settings → API. In Auth → URL configuration, add `https://<your-domain>/admin/set-password` as a redirect URL.
2. **Migrate and seed** from your machine:
   ```bash
   DATABASE_URL=... DIRECT_URL=... npm run db:deploy
   ```
   ```bash
   AUTH_MODE=supabase SEED_OWNER_EMAIL=you@... SEED_OWNER_PASSWORD=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... npm run db:seed
   ```
3. **Vercel.** Import the repo and set every variable from `.env.example`. Use `AUTH_MODE=supabase`, `PAYMENT_PROVIDER=notchpay` and a long random `CRON_SECRET`. Do **not** set `UNSAFE_TEST_MODE`.
4. **Cron.** `vercel.json` runs `/api/cron/reconcile` every 5 minutes, but **Vercel Hobby only allows daily crons.** Either use Pro, or have an external scheduler (cron-job.org, GitHub Actions) call `GET https://<domain>/api/cron/reconcile` with `Authorization: Bearer $CRON_SECRET` every 5 minutes. Customers who keep the Approve screen open are confirmed by the status poll anyway.
5. **Notch Pay.** Put the sandbox keys in first. Register `https://<domain>/api/webhooks/notchpay` as the webhook URL and put its secret in `NOTCHPAY_WEBHOOK_SECRET`. ⚠️ `lib/payments/notchpay.ts` was written without access to Notch Pay's docs. Before going live, check the endpoint paths, the `cm.mtn` / `cm.orange` channel codes, the `X-Notch-Signature` header and the status strings against their sandbox. They are all in that one file.
6. **Go live.** Enter the real prices in **Packages & prices** and click **Show**. Pay a real 100 FCFA test order from an MTN number and from an Orange number, then mark both renewed.
7. **SMS.** Choose a provider, implement `SmsSender` and add it to `getSmsSender()`.
