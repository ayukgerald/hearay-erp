# Hearay --- Build Spec

Nov 2, 2026 · \@Ayuk

## Overview

Hearay lets a customer renew a DStv subscription from a phone or
desktop: pick a package, pick 1, 3, 6 or 12 months, and pay with MTN
Mobile Money or Orange Money. Phase 1 automates the payment; staff renew
the DStv account by hand from an admin screen, and the customer gets an
SMS when it is done.

---

Layer Choice Why

---

App Next.js (App Router, One codebase installs on
TypeScript) built as a PWA Android, iPhone and desktop

Styling Tailwind CSS Fast to match the canvas
screens

API Next.js route handlers under No separate server to host
/api

Database PostgreSQL on Supabase, Managed, free tier, typed
accessed with Prisma queries

Admin login Supabase Auth (email + Customers do not log in in
password) phase 1

Payments Mobile money aggregator (Notch Swap providers without
Pay first; CamPay as fallback) touching screens
behind one PaymentProvider  
 interface

SMS Provider to be chosen, behind Order confirmations and
one SmsSender interface \"renewed\" messages

Hosting Vercel Free tier is enough to
start

---

Out of scope for phase 1: automatic DStv renewal through a MultiChoice
partner API, customer accounts, card payments.

Change from the canvas: there is no API to look up the account name from
a smartcard number in phase 1, so the Pay screen asks the customer to
type the smartcard number twice instead of showing a name.

Open questions:

- [ ] Which SMS provider?

- [ ] What service fee per order, if any?

- [ ] Final package list and monthly prices for Cameroon

## Database tables

Seven tables. Money is stored as whole FCFA in integers (XAF has no
cents). Every table has created_at and updated_at timestamps, not
repeated below. An order copies the package name and price at the moment
of sale, so later price changes never alter old orders.

Order status runs awaiting_payment → paid → renewed. From
awaiting_payment it can also end as payment_failed or expired (no
confirmation within 10 minutes). A paid order can end as refunded if
staff cannot renew it.

### packages

---

Column Type Notes

---

id uuid, primary  
 key

code text, unique e.g. compact

name text Shown to customers, e.g. Compact

monthly_price_xaf integer Edited by admin when DStv changes
prices

is_active boolean Hidden from customers when false

sort_order integer Order on the package screen

badge text, nullable e.g. \"Most chosen\"

---

### orders

---

Column Type Notes

---

id uuid, primary key

reference text, unique Human code, e.g. HR-001048, shown
on receipt and SMS

smartcard_number text Digits only, validated length

package_id uuid → packages.id

package_name text Snapshot at time of order

monthly_price_xaf integer Snapshot at time of order

months integer One of 1, 3, 6, 12

service_fee_xaf integer 0 if no fee

total_xaf integer months × monthly price + fee,
computed on the server

customer_phone text E.164 format, e.g. +2376XXXXXXXX

payment_method enum payment_method mtn_momo or orange_money

status enum order_status See lifecycle above

renewed_by uuid → Who renewed it
admin_users.id,  
 nullable

renewed_at timestamp, nullable

admin_note text, nullable e.g. DStv agent receipt number

---

### payments

One order can have several payment attempts (customer retries).

---

Column Type Notes

---

id uuid, primary key

order_id uuid → orders.id

provider text e.g. notchpay

provider_reference text, unique The aggregator\'s transaction id

amount_xaf integer Must equal the order total

phone text Number charged

method enum payment_method

status enum payment_status initiated, pending, succeeded,
failed, expired

failure_reason text, nullable From the provider

raw_response jsonb Last provider response, for support

---

### webhook_events

Stores every callback from the aggregator so a repeated callback is
never processed twice.

---

Column Type Notes

---

id uuid, primary key

provider text

event_id text, unique Idempotency key from the provider

signature_valid boolean Rejected events are kept for
review

payload jsonb Raw body

processed_at timestamp, nullable Null until handled

---

### order_events

Audit trail of every status change.

---

Column Type Notes

---

id uuid, primary key

order_id uuid → orders.id

from_status enum order_status,  
 nullable

to_status enum order_status

actor text system, webhook or an admin user
id

note text, nullable

---

### sms_messages

---

Column Type Notes

---

id uuid, primary key

order_id uuid → orders.id

to_phone text

kind text payment_received or renewed

body text

status text queued, sent, failed

provider_reference text, nullable

---

### admin_users

---

Column Type Notes

---

id uuid, primary key Same id as the Supabase Auth user

name text

email text, unique

role enum admin_role owner (manages prices and staff) or staff
(renews orders)

is_active boolean

---

Indexes: orders(status, created_at) for the admin queue,
orders(customer_phone) for support lookups, orders(smartcard_number).

## API endpoints

Fourteen endpoints in three groups. The server always computes prices
and totals from the database; it never trusts an amount sent by the
browser. An order is marked paid only by the webhook or the status
check, never by the customer.

---

Method Path Who What it does

---

GET /api/packages Public Active packages, sorted, with
monthly price

POST /api/orders Public Validates input, computes total,
creates order in awaiting_payment

POST /api/orders/{id}/pay Public Starts a mobile money collection;
can be called again to resend the
prompt

GET /api/orders/{id} Public Order status for the Approve and
Confirmation screens (polled every
3 s)

GET /api/orders/{id}/receipt Public Printable receipt page

POST /api/webhooks/{provider} Aggregator Verifies signature, stores event,
confirms with provider, updates
payment and order

POST /api/cron/reconcile Vercel Cron, Re-checks pending payments with the
every 5 min provider; expires orders unpaid
after 10 min

GET /api/admin/orders Staff Queue with filters: status, search
q (reference, phone, smartcard),
page

GET /api/admin/orders/{id} Staff One order with its payments and
status history

POST /api/admin/orders/{id}/mark-renewed Staff paid → renewed, saves note, sends
\"renewed\" SMS

POST /api/admin/orders/{id}/refund Owner paid → refunded with a reason
(refund itself done in the
aggregator dashboard in phase 1)

GET /api/admin/stats/today Staff Counts and totals for the four
admin cards

GET, /api/admin/packages Owner List, add, edit price, hide a
POST, package
PATCH

GET, /api/admin/users Owner List, invite, deactivate staff
POST,  
 PATCH

---

The order id is a UUID, so status links cannot be guessed. Order
creation is rate-limited to 5 per phone number and 20 per IP address per
hour.

Create an order:

POST /api/orders\
{\
\"smartcardNumber\": \"1234567890\",\
\"smartcardConfirm\": \"1234567890\",\
\"packageId\": \"9b1c...\",\
\"months\": 3,\
\"phone\": \"+2376XXXXXXXX\",\
\"paymentMethod\": \"mtn_momo\"\
}\
\
201 Created\
{\
\"id\": \"5f0e...\",\
\"reference\": \"HR-001048\",\
\"packageName\": \"Compact\",\
\"months\": 3,\
\"monthlyPriceXaf\": 0,\
\"serviceFeeXaf\": 0,\
\"totalXaf\": 0,\
\"status\": \"awaiting_payment\"\
}

Start payment and poll status:

POST /api/orders/5f0e.../pay\
202 Accepted\
{ \"paymentId\": \"a71d...\", \"status\": \"pending\", \"expiresAt\":
\"2026-11-02T15:20:00Z\" }\
\
GET /api/orders/5f0e...\
200 OK\
{ \"reference\": \"HR-001048\", \"status\": \"paid\", \"paymentStatus\":
\"succeeded\", \"renewedAt\": null }

Errors return { \"error\": { \"code\": \"SMARTCARD_MISMATCH\",
\"message\": \"...\" } } with a 4xx status. Codes: VALIDATION_FAILED,
SMARTCARD_MISMATCH, PACKAGE_INACTIVE, ORDER_NOT_PAYABLE,
PROVIDER_UNAVAILABLE, RATE_LIMITED.

## Screens

Five customer screens and four admin screens, matching the Hearay design
canvas. Screens 1 and 2 keep choices in the URL
(?card=...&package=compact&months=3) so a refresh or back button loses
nothing; the order is created on screen 3 once the phone number is
known.

---

\# Screen Route What the user does API calls

---

1 Choose package / Enters smartcard GET /api/packages
number, taps a package  
 card

2 Choose months /months Picks 1, 3, 6 or 12 none (uses package data
months; sees price × from screen 1)
months + fee = total

3 Pay /pay Picks MTN MoMo or POST /api/orders, then
Orange Money, enters POST /api/orders/{id}/pay
phone, retypes  
 smartcard, taps Pay

4 Approve on /orders/{id}/approve Approves the prompt on polls GET
phone their phone; can resend /api/orders/{id}; resend
prompt or change number = POST .../pay

5 Confirmation /orders/{id} Sees paid → renewing → GET /api/orders/{id}, GET
done timeline; .../receipt
downloads receipt

A1 Admin login /admin/login Staff sign in Supabase Auth

A2 Orders to /admin/orders Sees paid orders oldest GET /api/admin/orders,
fulfil first, renews on the GET
DStv agent portal, /api/admin/stats/today,
clicks Mark renewed POST .../mark-renewed

A3 Packages & /admin/packages Owner edits prices, /api/admin/packages
prices hides or reorders  
 packages

A4 Staff /admin/users Owner invites or /api/admin/users
deactivates staff

---

Screen 4 moves to screen 5 by itself as soon as the status turns paid.
If it turns payment_failed or expired, it shows the reason and a Try
again button back to screen 3. The canvas\'s \"I\'ve approved it\"
button is only for the clickable prototype and is not built.

Design rules from the canvas: Manrope font; background #F5F6F8; text
#101418; accent #1F4FD8; touch targets at least 44 px; one primary
button pinned to the bottom of each phone screen.

## Build tasks for Claude Code

Eleven tasks, in build order; each ends with a check that proves it is
done. To use them, export this doc as Markdown, save it as SPEC.md in an
empty repo, and ask Claude Code: \"Read SPEC.md and do task 1.\" Review,
then ask for the next task.

Rules for every task:

- Money is whole FCFA in integers. Totals are computed on the server
  only.

- Every order status change goes through one transitionOrder()
  function that checks the move is allowed and writes an order_events
  row.

- An order becomes paid only from a verified webhook or a provider
  status check.

- Secrets live in environment variables, listed in .env.example, never
  in code.

Tasks:

- [ ] **1. Scaffold the project.** Next.js (App Router, TypeScript),
      Tailwind, Manrope font, the colour values from Screens, PWA manifest
      and service worker with the Hearay name and icon, ESLint and
      Prettier, .env.example.
  - Done when: npm run dev serves a placeholder home page, and
    Chrome on Android offers \"Install app\".

- [ ] **2. Create the database schema.** Prisma schema for the seven
      tables and their enums in Database tables, first migration, and a
      seed script that adds Family, Compact, Compact Plus and Premium with
      price 0 and is_active false until real prices are entered.
  - Done when: the migration runs on a Supabase database and the
    seed creates four packages.

- [ ] **3. Write the core business rules.** Functions for: total =
      months × monthly price + fee; Cameroon phone normalising to +237
      plus 9 digits; smartcard validation (digits only, length set in
      config); transitionOrder() with the allowed moves; order reference
      generator HR-000001 upward.
  - Done when: unit tests cover every allowed and every blocked
    status move, and bad phone and smartcard inputs.

- [ ] **4. Build the payment layer.** A PaymentProvider interface
      (startCollection, getStatus, verifyWebhook), a Notch Pay
      implementation using its MTN and Orange channels, and a FakeProvider
      for local work that succeeds 10 seconds after starting (or fails
      when the phone ends in 0).
  - Done when: the app switches provider with one environment
    variable, and tests pass against the fake.

- [ ] **5. Build the public API.** The five public endpoints in API
      endpoints, with input validation (zod), the error codes listed
      there, and rate limits.
  - Done when: an order can be created and paid against FakeProvider
    using curl, and a total sent from the client is ignored.

- [ ] **6. Handle payment confirmation.** The webhook endpoint (verify
      signature, store in webhook_events, skip duplicates, confirm with
      getStatus, update payment and order) and the reconcile job on Vercel
      Cron every 5 minutes.
  - Done when: sending the same webhook twice changes the order only
    once, and an unpaid order expires after 10 minutes.

- [ ] **7. Add SMS notifications.** An SmsSender interface with a
      console version for now; send on paid (\"Payment received, order
      HR-..., renewing your DStv account\") and on renewed; log each in
      sms_messages.
  - Done when: both messages appear in the log for a test order.

- [ ] **8. Build customer screens 1--5.** Match the canvas:
      mobile-first, centred 420 px column on desktop, bottom-pinned
      primary button, auto-advance from screen 4 to 5 on paid, error and
      retry states for failed or expired payments, receipt page.
  - Done when: the whole flow works on a phone and on desktop with
    FakeProvider, including a failed payment and a retry.

- [ ] **9. Build the admin area.** Supabase Auth login, owner and
      staff roles enforced on every admin endpoint, and screens A2--A4.
      The orders queue shows paid orders oldest first and refreshes every
      30 seconds.
  - Done when: staff can mark an order renewed (customer status
    updates and SMS logged), and staff cannot open package or user
    settings.

- [ ] **10. Add end-to-end tests.** Playwright tests for: happy path
      through to renewed; failed payment then retry; expiry after 10
      minutes (with a fake clock).
  - Done when: all three pass in CI on every push.

- [ ] **11. Deploy.** Vercel project, production Supabase database,
      environment variables, aggregator sandbox first then live keys,
      webhook URL registered with the aggregator, real package prices
      entered and packages switched on.
  - Done when: a real 100 FCFA test order is paid from an MTN number
    and an Orange number and marked renewed.
