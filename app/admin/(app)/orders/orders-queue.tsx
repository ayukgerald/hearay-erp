"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, MethodDot, Spinner } from "@/components/phone-shell";
import { api, ApiClientError, METHOD_LABEL, qs } from "@/lib/client";
import { formatXaf } from "@/lib/money";
import { formatPhone } from "@/lib/phone";

type Row = {
  id: string;
  reference: string;
  status: string;
  smartcardNumber: string;
  packageName: string;
  months: number;
  totalXaf: number;
  customerPhone: string;
  paymentMethod: "mtn_momo" | "orange_money";
  createdAt: string;
  paidAt: string | null;
  renewedAt: string | null;
  renewedBy: string | null;
  adminNote: string | null;
};
type Stats = {
  toRenew: number;
  oldestWaitingSince: string | null;
  paidToday: number;
  paidTodayXaf: number;
  renewedToday: number;
  failedToday: number;
};

const TABS = [
  { value: "paid", label: "To renew" },
  { value: "renewed", label: "Renewed" },
  { value: "awaiting_payment", label: "Awaiting payment" },
  { value: "payment_failed", label: "Failed" },
  { value: "expired", label: "Expired" },
  { value: "refunded", label: "Refunded" },
  { value: "all", label: "All" },
];

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-accent-soft text-accent",
  renewed: "bg-success-soft text-success",
  awaiting_payment: "bg-warn-soft text-warn",
  payment_failed: "bg-danger-soft text-danger",
  expired: "bg-line text-ink-muted",
  refunded: "bg-warn-soft text-warn",
};

function ago(iso: string, now: number) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60} min ago` : `${Math.floor(h / 24)} d ago`;
}
const dt = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Douala",
      }).format(new Date(iso))
    : "—";

export function OrdersQueue({ isOwner }: { isOwner: boolean }) {
  const [status, setStatus] = useState("paid");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ orders: Row[]; total: number; pageSize: number } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [renewing, setRenewing] = useState<Row | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([
        api<{ orders: Row[]; total: number; pageSize: number }>(
          `/api/admin/orders?${qs({ status, q: query, page })}`,
        ),
        api<Stats>("/api/admin/stats/today"),
      ]);
      setData(list);
      setStats(s);
      setError(null);
      setNow(Date.now());
    } catch (e) {
      const err = e as ApiClientError;
      if (err.status === 401) window.location.href = "/admin/login";
      setError(err.message);
    }
  }, [status, query, page]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000); // refresh every 30 s
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Orders to fulfil</h1>
        <span className="text-xs text-ink-faint">
          Refreshes every 30 s · updated {new Date(now).toLocaleTimeString("en-GB")}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="stats">
        <StatCard
          label="To renew"
          value={stats?.toRenew}
          hint={
            stats?.oldestWaitingSince
              ? `Oldest ${ago(stats.oldestWaitingSince, now)}`
              : "Queue is clear"
          }
          accent
        />
        <StatCard
          label="Paid today"
          value={stats?.paidToday}
          hint={stats ? formatXaf(stats.paidTodayXaf) : ""}
        />
        <StatCard label="Renewed today" value={stats?.renewedToday} />
        <StatCard label="Failed or expired today" value={stats?.failedToday} />
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="-mx-1 flex gap-1 overflow-x-auto pb-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={status === t.value}
              onClick={() => {
                setStatus(t.value);
                setPage(1);
              }}
              className={`inline-flex min-h-touch items-center whitespace-nowrap rounded-xl px-3 text-sm font-semibold ${
                status === t.value
                  ? "bg-ink text-white"
                  : "bg-white text-ink-muted shadow-[0_0_0_1px_#E3E6EB] hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <form
          className="flex flex-1 gap-2 lg:ml-auto lg:max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q.trim());
            setPage(1);
          }}
        >
          <input
            className="field-input !min-h-touch !text-sm"
            placeholder="Search reference, phone or smartcard"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search orders"
          />
          <button className="btn-secondary !w-auto">Search</button>
        </form>
      </div>

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mt-4 space-y-3" data-testid="queue">
        {!data && !error && (
          <div className="flex justify-center py-16 text-accent">
            <Spinner className="size-7" />
          </div>
        )}
        {data && data.orders.length === 0 && (
          <div className="card p-10 text-center text-ink-muted">
            {status === "paid" && !query ? "Nothing to renew. Nice work." : "No orders found."}
          </div>
        )}
        {data?.orders.map((o) => (
          <div
            key={o.id}
            className="card flex flex-col gap-3 p-4 md:flex-row md:items-center"
            data-testid={`order-${o.reference}`}
          >
            <button
              className="flex flex-1 items-start gap-3 text-left"
              onClick={() => setDetailId(o.id)}
            >
              <MethodDot method={o.paymentMethod} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-extrabold">{o.reference}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[o.status]}`}
                  >
                    {o.status.replace("_", " ")}
                  </span>
                  <span className="text-xs text-ink-faint">
                    {o.status === "paid" && o.paidAt
                      ? `paid ${ago(o.paidAt, now)}`
                      : ago(o.createdAt, now)}
                  </span>
                </div>
                <div className="mt-1 text-sm">
                  <b>DStv {o.packageName}</b> × {o.months} {o.months === 1 ? "month" : "months"} ·{" "}
                  {formatXaf(o.totalXaf)}
                </div>
                <div className="text-sm text-ink-muted">{formatPhone(o.customerPhone)}</div>
                {o.adminNote && (
                  <div className="mt-1 whitespace-pre-line text-xs font-semibold text-warn">
                    {o.adminNote}
                  </div>
                )}
              </div>
            </button>
            <div className="flex items-center gap-2 md:w-auto">
              <CopyChip value={o.smartcardNumber} />
              {o.status === "paid" && (
                <button
                  className="btn-primary !min-h-touch !w-auto !rounded-xl !text-sm"
                  onClick={() => setRenewing(o)}
                  data-testid="mark-renewed"
                >
                  Mark renewed
                </button>
              )}
              {o.status === "renewed" && (
                <span className="text-xs text-ink-muted">
                  by {o.renewedBy ?? "—"}, {dt(o.renewedAt)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {data && pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button
            className="btn-secondary !w-auto"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span className="text-ink-muted">
            Page {page} of {pages}
          </span>
          <button
            className="btn-secondary !w-auto"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}

      {renewing && (
        <RenewDialog
          order={renewing}
          onClose={() => setRenewing(null)}
          onDone={(ref) => {
            setRenewing(null);
            setToast(`${ref} marked renewed — SMS sent to the customer.`);
            load();
          }}
        />
      )}
      {detailId && (
        <DetailDrawer
          id={detailId}
          isOwner={isOwner}
          onClose={() => setDetailId(null)}
          onChanged={(msg) => {
            setToast(msg);
            load();
          }}
        />
      )}
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-lg"
          data-testid="toast"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value?: number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-4 ${accent ? "bg-accent text-white" : "card"}`}>
      <div className={`text-sm font-semibold ${accent ? "text-white/80" : "text-ink-muted"}`}>
        {label}
      </div>
      <div className="mt-1 text-3xl font-extrabold tracking-tight">{value ?? "–"}</div>
      {hint && (
        <div
          className={`mt-0.5 text-xs font-semibold ${accent ? "text-white/80" : "text-ink-muted"}`}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="inline-flex min-h-touch items-center gap-2 rounded-xl bg-canvas px-3 font-mono text-sm font-bold tracking-wider hover:bg-line"
      title="Copy smartcard number"
      onClick={async () => {
        await navigator.clipboard?.writeText(value).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {value}
      <span className="font-sans text-xs font-semibold text-accent">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className={`max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-11 items-center justify-center rounded-full hover:bg-canvas"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RenewDialog({
  order,
  onClose,
  onDone,
}: {
  order: Row;
  onClose: () => void;
  onDone: (ref: string) => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/orders/${order.id}/mark-renewed`, {
        method: "POST",
        json: { note: note.trim() || undefined },
      });
      onDone(order.reference);
    } catch (err) {
      setError((err as ApiClientError).message);
      setBusy(false);
    }
  }
  return (
    <Modal title={`Mark ${order.reference} renewed`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-canvas p-3 text-sm">
          Renewed <b>DStv {order.packageName}</b> for{" "}
          <b>
            {order.months} {order.months === 1 ? "month" : "months"}
          </b>{" "}
          on smartcard <b className="font-mono">{order.smartcardNumber}</b> in the DStv agent
          portal?
        </div>
        <div>
          <label className="field-label" htmlFor="note">
            DStv agent receipt number or note
          </label>
          <input
            id="note"
            className="field-input !text-base"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Optional"
            autoFocus
          />
        </div>
        {error && <Alert>{error}</Alert>}
        <button className="btn-primary" disabled={busy} data-testid="confirm-renewed">
          {busy && <Spinner />} Mark renewed and SMS customer
        </button>
      </form>
    </Modal>
  );
}

type Detail = Row & {
  payments: {
    id: string;
    provider: string;
    providerReference: string;
    amountXaf: number;
    phone: string;
    status: string;
    failureReason: string | null;
    createdAt: string;
  }[];
  events: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    actorName: string;
    note: string | null;
    createdAt: string;
  }[];
  smsMessages: { id: string; kind: string; status: string; body: string; createdAt: string }[];
};

function DetailDrawer({
  id,
  isOwner,
  onClose,
  onChanged,
}: {
  id: string;
  isOwner: boolean;
  onClose: () => void;
  onChanged: (msg: string) => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      api<Detail>(`/api/admin/orders/${id}`)
        .then(setD)
        .catch((e) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function refund(e: React.FormEvent) {
    e.preventDefault();
    if (
      !d ||
      !confirm(
        `Mark ${d.reference} refunded? Send the money back in the aggregator dashboard first.`,
      )
    )
      return;
    setBusy(true);
    try {
      await api(`/api/admin/orders/${id}/refund`, {
        method: "POST",
        json: { reason: refundReason },
      });
      onChanged(`${d.reference} marked refunded.`);
      onClose();
    } catch (err) {
      setError((err as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={d ? `Order ${d.reference}` : "Order"} onClose={onClose} wide>
      {error && <Alert>{error}</Alert>}
      {!d && !error && (
        <div className="flex justify-center py-10 text-accent">
          <Spinner className="size-7" />
        </div>
      )}
      {d && (
        <div className="space-y-5 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <dt className="text-ink-muted">Status</dt>
            <dd className="font-bold">{d.status.replace("_", " ")}</dd>
            <dt className="text-ink-muted">Smartcard</dt>
            <dd className="font-mono font-bold">{d.smartcardNumber}</dd>
            <dt className="text-ink-muted">Package</dt>
            <dd>
              DStv {d.packageName} × {d.months}
            </dd>
            <dt className="text-ink-muted">Total</dt>
            <dd className="font-bold">{formatXaf(d.totalXaf)}</dd>
            <dt className="text-ink-muted">Customer</dt>
            <dd>
              {formatPhone(d.customerPhone)} · {METHOD_LABEL[d.paymentMethod]}
            </dd>
            <dt className="text-ink-muted">Created</dt>
            <dd>{dt(d.createdAt)}</dd>
            {d.adminNote && (
              <>
                <dt className="text-ink-muted">Note</dt>
                <dd className="whitespace-pre-line">{d.adminNote}</dd>
              </>
            )}
          </dl>

          <section>
            <h3 className="mb-2 font-bold">Payments</h3>
            <div className="space-y-2">
              {d.payments.length === 0 && <p className="text-ink-muted">No payment attempts.</p>}
              {d.payments.map((p) => (
                <div key={p.id} className="rounded-xl bg-canvas p-3">
                  <div className="flex justify-between gap-2">
                    <span className="font-mono text-xs">
                      {p.provider} · {p.providerReference}
                    </span>
                    <b>{p.status}</b>
                  </div>
                  <div className="text-ink-muted">
                    {formatXaf(p.amountXaf)} · {formatPhone(p.phone)} · {dt(p.createdAt)}
                  </div>
                  {p.failureReason && <div className="text-danger">{p.failureReason}</div>}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-bold">History</h3>
            <ol className="space-y-1.5">
              {d.events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="w-36 shrink-0 text-ink-muted">{dt(e.createdAt)}</span>
                  <span>
                    <b>
                      {e.fromStatus ? `${e.fromStatus} → ` : ""}
                      {e.toStatus}
                    </b>{" "}
                    · {e.actorName}
                    {e.note && <span className="text-ink-muted"> — {e.note}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h3 className="mb-2 font-bold">SMS</h3>
            {d.smsMessages.length === 0 && <p className="text-ink-muted">None sent.</p>}
            {d.smsMessages.map((m) => (
              <div key={m.id} className="mb-2 rounded-xl bg-canvas p-3">
                <div className="flex justify-between">
                  <b>{m.kind}</b>
                  <span className="text-ink-muted">
                    {m.status} · {dt(m.createdAt)}
                  </span>
                </div>
                <div className="text-ink-muted">{m.body}</div>
              </div>
            ))}
          </section>

          {isOwner && d.status === "paid" && (
            <form onSubmit={refund} className="space-y-2 rounded-xl border border-danger/30 p-3">
              <h3 className="font-bold text-danger">Cannot renew? Refund</h3>
              <p className="text-ink-muted">
                Send the money back from the aggregator dashboard, then record it here.
              </p>
              <input
                className="field-input !min-h-touch !text-sm"
                placeholder="Reason (e.g. smartcard not found)"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
              />
              <button
                className="btn-secondary !border-danger/40 !text-danger"
                disabled={busy || refundReason.trim().length < 3}
              >
                Mark refunded
              </button>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
