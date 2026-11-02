"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Alert, PhoneShell, Spinner } from "@/components/phone-shell";
import { METHOD_LABEL, qs } from "@/lib/client";
import { formatXaf } from "@/lib/money";
import { useOrder, type OrderView } from "@/lib/use-order";

const time = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "short",
        timeZone: "Africa/Douala",
      }).format(new Date(iso))
    : "";

/** Screen 5 — paid → renewing → done timeline, receipt download. */
export function Confirmation({ id }: { id: string }) {
  const router = useRouter();
  const final = (o: OrderView) =>
    ["renewed", "refunded", "payment_failed", "expired"].includes(o.status);
  const { order, error } = useOrder(id, final);

  useEffect(() => {
    if (order && ["awaiting_payment", "payment_failed", "expired"].includes(order.status)) {
      router.replace(`/orders/${id}/approve`);
    }
  }, [order, id, router]);

  if (error?.code === "NOT_FOUND") {
    return (
      <PhoneShell>
        <div className="mt-10">
          <Alert>We could not find this order.</Alert>
          <Link href="/" className="btn-secondary mt-4">
            Renew DStv
          </Link>
        </div>
      </PhoneShell>
    );
  }
  if (!order || ["awaiting_payment", "payment_failed", "expired"].includes(order.status)) {
    return (
      <PhoneShell>
        <div className="flex justify-center py-24 text-accent">
          <Spinner className="size-8" />
        </div>
      </PhoneShell>
    );
  }

  const renewed = order.status === "renewed";
  const refunded = order.status === "refunded";

  return (
    <PhoneShell
      footer={
        <div className="space-y-1">
          <a
            href={`/api/orders/${id}/receipt`}
            target="_blank"
            rel="noopener"
            className="btn-primary"
            data-testid="receipt"
          >
            Download receipt
          </a>
          <Link href={`/?${qs({})}`} className="btn-link w-full text-sm">
            Renew another account
          </Link>
        </div>
      }
    >
      <div className="mt-8 text-center" data-testid="confirmation">
        <div
          className={`mx-auto inline-flex size-16 items-center justify-center rounded-full ${refunded ? "bg-warn-soft text-warn" : "bg-success-soft text-success"}`}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1
          className="mt-4 text-[26px] font-extrabold leading-tight tracking-tight"
          data-testid="headline"
        >
          {refunded ? "Payment refunded" : renewed ? "Your DStv is renewed" : "Payment received"}
        </h1>
        <p className="mt-1 text-ink-muted">
          Order{" "}
          <b className="text-ink" data-testid="reference">
            {order.reference}
          </b>
        </p>
      </div>

      {refunded ? (
        <div className="mt-6">
          <Alert kind="warn">
            We could not renew this account, so your {formatXaf(order.totalXaf)} was refunded to
            your {METHOD_LABEL[order.paymentMethod]} account.
          </Alert>
        </div>
      ) : (
        <ol className="card mt-6 p-4" aria-label="Order progress" data-testid="timeline">
          <Step
            state="done"
            title="Paid"
            detail={`${formatXaf(order.totalXaf)} · ${time(order.paidAt)}`}
          />
          <Step
            state={renewed ? "done" : "current"}
            title={renewed ? "Renewed by our team" : "Renewing your account"}
            detail={
              renewed
                ? ""
                : "Usually within 15 minutes during opening hours. You can close this page."
            }
          />
          <Step
            state={renewed ? "done" : "todo"}
            title="Done"
            detail={
              renewed
                ? `Renewed ${time(order.renewedAt)} · SMS sent`
                : "We will SMS you when it is done"
            }
            last
          />
        </ol>
      )}

      <dl className="card mt-4 divide-y divide-line text-[15px]">
        <Item k="Smartcard" v={order.smartcardNumber} />
        <Item
          k="Package"
          v={`DStv ${order.packageName} · ${order.months} ${order.months === 1 ? "month" : "months"}`}
        />
        <Item k="Paid with" v={`${METHOD_LABEL[order.paymentMethod]} · ${order.phoneMasked}`} />
        <Item k="Total" v={formatXaf(order.totalXaf)} strong />
      </dl>
    </PhoneShell>
  );
}

function Step({
  state,
  title,
  detail,
  last,
}: {
  state: "done" | "current" | "todo";
  title: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0" data-state={state}>
      {!last && (
        <span
          className={`absolute left-[13px] top-7 h-[calc(100%-24px)] w-0.5 ${state === "done" ? "bg-success" : "bg-line"}`}
          aria-hidden
        />
      )}
      <span
        className={`relative z-[1] inline-flex size-7 shrink-0 items-center justify-center rounded-full ${
          state === "done"
            ? "bg-success text-white"
            : state === "current"
              ? "bg-accent text-white"
              : "border-2 border-line bg-white"
        }`}
        aria-hidden
      >
        {state === "done" && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {state === "current" && <Spinner className="size-4" />}
      </span>
      <div className="pt-0.5">
        <div className={`font-bold ${state === "todo" ? "text-ink-faint" : ""}`}>{title}</div>
        {detail && <div className="text-sm text-ink-muted">{detail}</div>}
      </div>
    </li>
  );
}

function Item({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-3">
      <dt className="text-ink-muted">{k}</dt>
      <dd className={`text-right ${strong ? "text-lg font-extrabold" : "font-semibold"}`}>{v}</dd>
    </div>
  );
}
