import { db } from "@/lib/db";
import { ApiError, handle } from "@/lib/errors";
import { formatXaf } from "@/lib/money";
import { maskPhone } from "@/lib/phone";
import { isUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid — renewal in progress",
  renewed: "Paid — DStv renewed",
  refunded: "Refunded",
};
const METHOD = { mtn_momo: "MTN Mobile Money", orange_money: "Orange Money" } as const;

function dt(d: Date | null | undefined) {
  return d
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Douala",
      }).format(d)
    : "—";
}

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new ApiError("NOT_FOUND", "Order not found");
  const o = await db.order.findUnique({
    where: { id },
    include: { payments: { where: { status: "succeeded" } }, events: true },
  });
  if (!o) throw new ApiError("NOT_FOUND", "Order not found");
  if (!["paid", "renewed", "refunded"].includes(o.status)) {
    throw new ApiError(
      "ORDER_NOT_PAYABLE",
      "A receipt is available once the payment is confirmed.",
    );
  }
  const paidAt = o.events.find((e) => e.toStatus === "paid")?.createdAt;
  const pay = o.payments[0];
  const rows: [string, string][] = [
    ["Order", o.reference],
    ["Status", STATUS_LABEL[o.status] ?? o.status],
    ["Smartcard", o.smartcardNumber],
    ["Package", `DStv ${o.packageName}`],
    ["Months", String(o.months)],
    ["Price per month", formatXaf(o.monthlyPriceXaf)],
    ["Service fee", formatXaf(o.serviceFeeXaf)],
    ["Paid with", `${METHOD[o.paymentMethod]} · ${maskPhone(o.customerPhone)}`],
    ["Transaction", pay?.providerReference ?? "—"],
    ["Paid on", dt(paidAt)],
    ["Renewed on", dt(o.renewedAt)],
  ];
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt ${esc(o.reference)} · Hearay</title>
<style>
  :root{--ink:#101418;--muted:#5B6470;--line:#E3E6EB;--accent:#1F4FD8;--bg:#F5F6F8}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 Manrope,system-ui,sans-serif}
  main{max-width:420px;margin:24px auto;background:#fff;border-radius:16px;padding:24px;border:1px solid var(--line)}
  h1{font-size:20px;margin:0} .brand{color:var(--accent);font-weight:800;letter-spacing:-.02em;font-size:18px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;margin:16px 0} td{padding:8px 0;border-bottom:1px solid var(--line);vertical-align:top}
  td:first-child{color:var(--muted);width:45%} td:last-child{text-align:right;font-weight:600;word-break:break-all}
  .total{display:flex;justify-content:space-between;font-size:18px;font-weight:800;margin-top:8px}
  .note{color:var(--muted);font-size:13px;margin-top:16px}
  button{margin-top:20px;width:100%;min-height:48px;border:0;border-radius:12px;background:var(--accent);color:#fff;font:inherit;font-weight:700;cursor:pointer}
  @media print{body{background:#fff} main{border:0;margin:0;max-width:none} button{display:none}}
</style></head>
<body><main>
  <div class="brand">Hearay</div>
  <h1>Payment receipt</h1>
  <table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
  <div class="total"><span>Total paid</span><span>${esc(formatXaf(o.totalXaf))}</span></div>
  <p class="note">Keep this receipt. Quote ${esc(o.reference)} if you contact us about this order.</p>
  <button onclick="window.print()">Download or print</button>
</main></body></html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
});
