"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, MethodDot, PhoneShell, Spinner } from "@/components/phone-shell";
import { api, ApiClientError, METHOD_LABEL, qs } from "@/lib/client";
import { formatXaf } from "@/lib/money";
import { useOrder, type OrderView } from "@/lib/use-order";

const USSD = { mtn_momo: "*126#", orange_money: "#150*50#" } as const;
const RESEND_COOLDOWN_S = 30;

/** Screen 4 — approve the prompt on the phone. Moves to screen 5 as soon as the order is paid. */
export function Approve({ id }: { id: string }) {
  const router = useRouter();
  const done = (o: OrderView) => o.status !== "awaiting_payment";
  const { order, error, reload } = useOrder(id, done);
  const [now, setNow] = useState(() => Date.now());
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<{ kind: "info" | "danger"; text: string } | null>(
    null,
  );
  const [cooldownUntil, setCooldownUntil] = useState(() => Date.now() + RESEND_COOLDOWN_S * 1000);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (order && ["paid", "renewed", "refunded"].includes(order.status))
      router.replace(`/orders/${id}`);
  }, [order, id, router]);

  if (error?.code === "NOT_FOUND") {
    return (
      <PhoneShell>
        <div className="mt-10">
          <Alert>We could not find this order. Check the link or start again.</Alert>
          <Link href="/" className="btn-secondary mt-4">
            Start again
          </Link>
        </div>
      </PhoneShell>
    );
  }

  if (!order) {
    return (
      <PhoneShell>
        <div className="flex justify-center py-24 text-accent">
          <Spinner className="size-8" />
        </div>
      </PhoneShell>
    );
  }

  const retryHref = `/pay?${qs({ card: order.smartcardNumber, package: order.packageCode, months: order.months, method: order.paymentMethod })}`;

  if (order.status === "payment_failed" || order.status === "expired") {
    return (
      <PhoneShell
        footer={
          <Link href={retryHref} className="btn-primary" data-testid="try-again">
            Try again
          </Link>
        }
      >
        <div className="mt-10 text-center" data-testid="payment-failed">
          <div className="mx-auto inline-flex size-16 items-center justify-center rounded-full bg-danger-soft text-danger">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">
            {order.status === "expired" ? "Payment timed out" : "Payment not completed"}
          </h1>
          <p className="mt-2 text-ink-muted">
            {order.status === "expired"
              ? "We did not get your approval in time. No money was taken."
              : (order.failureReason ?? "The payment was declined or cancelled.")}
          </p>
          <p className="mt-1 text-sm text-ink-faint">Order {order.reference}</p>
        </div>
        <div className="card mt-8 p-4 text-sm text-ink-muted">
          Check that your {METHOD_LABEL[order.paymentMethod]} account has at least{" "}
          <b className="text-ink">{formatXaf(order.totalXaf)}</b>, then try again. You can also
          switch to the other payment method.
        </div>
      </PhoneShell>
    );
  }

  const secondsLeft = Math.max(0, Math.floor((new Date(order.expiresAt).getTime() - now) / 1000));
  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  async function resend() {
    setResending(true);
    setResendMsg(null);
    try {
      await api(`/api/orders/${id}/pay`, { method: "POST" });
      setResendMsg({ kind: "info", text: "We sent a new prompt to your phone." });
      setCooldownUntil(Date.now() + RESEND_COOLDOWN_S * 1000);
      reload();
    } catch (e) {
      setResendMsg({ kind: "danger", text: (e as ApiClientError).message });
      reload();
    } finally {
      setResending(false);
    }
  }

  return (
    <PhoneShell
      footer={
        <div className="space-y-1">
          <button
            className="btn-secondary"
            onClick={resend}
            disabled={resending || cooldown > 0}
            data-testid="resend"
          >
            {resending ? <Spinner /> : null}
            {cooldown > 0 ? `Resend prompt in ${cooldown}s` : "Resend prompt"}
          </button>
          <Link href={retryHref} className="btn-link w-full text-sm" data-testid="change-number">
            Change number or payment method
          </Link>
        </div>
      }
    >
      <div className="mt-8 text-center" data-testid="approve">
        <div className="relative mx-auto inline-flex size-24 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent/15 [animation-duration:2s]" />
          <span className="relative inline-flex size-20 items-center justify-center rounded-full bg-accent text-white">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect
                x="6"
                y="2.5"
                width="12"
                height="19"
                rx="2.5"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path d="M10.5 18.5h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
        </div>
        <h1 className="mt-5 text-[26px] font-extrabold leading-tight tracking-tight">
          Approve on your phone
        </h1>
        <p className="mx-auto mt-2 max-w-[320px] text-ink-muted">
          We sent a request for <b className="text-ink">{formatXaf(order.totalXaf)}</b> to{" "}
          <b className="whitespace-nowrap text-ink">{order.phoneMasked}</b>. Enter your{" "}
          {METHOD_LABEL[order.paymentMethod]} PIN to approve.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-[0_0_0_1px_#E3E6EB]">
          <Spinner className="size-4 text-accent" />
          Waiting for approval · {Math.floor(secondsLeft / 60)}:
          {String(secondsLeft % 60).padStart(2, "0")}
        </div>
      </div>

      <div className="card mt-8 divide-y divide-line">
        <div className="flex items-center gap-3 p-4">
          <MethodDot method={order.paymentMethod} />
          <div className="text-sm">
            <div className="font-bold">No prompt on your phone?</div>
            <div className="text-ink-muted">
              Dial <b className="text-ink">{USSD[order.paymentMethod]}</b> to see pending approvals,
              or resend the prompt below.
            </div>
          </div>
        </div>
        <div className="flex justify-between p-4 text-sm">
          <span className="text-ink-muted">
            DStv {order.packageName} · {order.months} {order.months === 1 ? "month" : "months"}
          </span>
          <span className="font-semibold">{order.reference}</span>
        </div>
      </div>
      {resendMsg && (
        <div className="mt-4">
          <Alert kind={resendMsg.kind}>{resendMsg.text}</Alert>
        </div>
      )}
    </PhoneShell>
  );
}
