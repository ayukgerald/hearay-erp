"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, MethodDot, PhoneShell, Spinner } from "@/components/phone-shell";
import {
  api,
  ApiClientError,
  loadPackages,
  METHOD_LABEL,
  qs,
  type Method,
  type PackagesResponse,
} from "@/lib/client";
import { formatXaf } from "@/lib/money";
import { normalizeCameroonPhone } from "@/lib/phone";

type CreatedOrder = { id: string; reference: string; totalXaf: number };

/** Screen 3 — choose MTN MoMo or Orange Money, phone number, retype smartcard, Pay. */
export function PayForm() {
  const router = useRouter();
  const params = useSearchParams();
  const card = params.get("card") ?? "";
  const code = params.get("package") ?? "";
  const months = Number(params.get("months") ?? 1);
  const initialMethod = params.get("method");

  const [data, setData] = useState<PackagesResponse | null>(null);
  const [method, setMethod] = useState<Method | null>(
    initialMethod === "mtn_momo" || initialMethod === "orange_money" ? initialMethod : null,
  );
  const [phone, setPhone] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // If the order was created but starting the payment failed, retry the payment on the same order.
  const created = useRef<{ key: string; order: CreatedOrder } | null>(null);

  useEffect(() => {
    loadPackages()
      .then(setData)
      .catch(() => setError("Could not load prices. Check your connection and refresh."));
  }, []);

  const pkg = data?.packages.find((p) => p.code === code);
  const back = `/months?${qs({ card, package: code, months })}`;
  useEffect(() => {
    if (!card || ![1, 3, 6, 12].includes(months) || (data && !pkg))
      router.replace(`/?${qs({ card, package: code })}`);
  }, [card, months, data, pkg, code, router]);

  const total = pkg ? pkg.monthlyPriceXaf * months + (data?.serviceFeeXaf ?? 0) : 0;
  const phoneCheck = normalizeCameroonPhone(phone);
  const confirmClean = confirm.replace(/[\s-]/g, "");
  const confirmOk = confirmClean === card;
  const valid = !!method && phoneCheck.ok && confirmOk && !!pkg;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ phone: true, confirm: true, method: true });
    if (!valid || !pkg || !method || !phoneCheck.ok) return;
    setBusy(true);
    setError(null);
    const key = [card, pkg.id, months, phoneCheck.e164, method].join("|");
    try {
      let order = created.current?.key === key ? created.current.order : null;
      if (!order) {
        order = await api<CreatedOrder>("/api/orders", {
          method: "POST",
          json: {
            smartcardNumber: card,
            smartcardConfirm: confirmClean,
            packageId: pkg.id,
            months,
            phone: phoneCheck.e164,
            paymentMethod: method,
          },
        });
        created.current = { key, order };
      }
      await api(`/api/orders/${order.id}/pay`, { method: "POST" });
      router.push(`/orders/${order.id}/approve`);
    } catch (err) {
      const e = err instanceof ApiClientError ? err : null;
      if (e?.code === "ORDER_NOT_PAYABLE") created.current = null;
      if (e?.code === "PACKAGE_INACTIVE")
        loadPackages({ fresh: true })
          .then(setData)
          .catch(() => undefined);
      setError(e?.message ?? "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <PhoneShell
      back={back}
      step={{ n: 3, of: 3 }}
      footer={
        <button
          form="pay"
          type="submit"
          className="btn-primary"
          disabled={busy || !pkg}
          data-testid="pay"
        >
          {busy ? (
            <>
              <Spinner /> Sending request…
            </>
          ) : (
            <>Pay {formatXaf(total)}</>
          )}
        </button>
      }
    >
      <h1 className="mt-2 text-[26px] font-extrabold leading-tight tracking-tight">Pay</h1>

      {pkg && (
        <div
          className="card mt-4 flex items-center justify-between gap-3 p-4"
          data-testid="summary"
        >
          <div className="min-w-0">
            <div className="font-bold">
              DStv {pkg.name} · {months} {months === 1 ? "month" : "months"}
            </div>
            <div className="truncate text-sm text-ink-muted">Smartcard {card}</div>
          </div>
          <div className="shrink-0 text-right text-lg font-extrabold tracking-tight">
            {formatXaf(total)}
          </div>
        </div>
      )}

      <form id="pay" onSubmit={submit} noValidate className="mt-6 space-y-6">
        <fieldset>
          <legend className="field-label">Pay with</legend>
          <div className="grid grid-cols-2 gap-3" role="radiogroup">
            {(["mtn_momo", "orange_money"] as const).map((m) => (
              <button
                type="button"
                key={m}
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                data-testid={`method-${m}`}
                className={`flex min-h-[64px] items-center gap-3 rounded-2xl border-2 bg-white px-3 text-left font-bold transition ${
                  method === m ? "border-accent" : "border-transparent shadow-[0_0_0_1px_#E3E6EB]"
                }`}
              >
                <MethodDot method={m} />
                <span className="leading-tight">{METHOD_LABEL[m]}</span>
              </button>
            ))}
          </div>
          {touched.method && !method && <p className="field-error">Choose how you want to pay</p>}
        </fieldset>

        <div>
          <label htmlFor="phone" className="field-label">
            {method ? `${METHOD_LABEL[method]} number` : "Mobile money number"}
          </label>
          <div className="flex items-stretch gap-2">
            <span className="inline-flex items-center rounded-xl border border-line bg-white px-3 text-lg font-semibold text-ink-muted">
              +237
            </span>
            <input
              id="phone"
              className="field-input"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="6XX XX XX XX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
              aria-invalid={touched.phone && !phoneCheck.ok}
            />
          </div>
          {touched.phone && !phoneCheck.ok ? (
            <p className="field-error">{phoneCheck.reason}</p>
          ) : (
            <p className="field-hint">
              You will get a prompt on this phone to approve the payment.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="confirm" className="field-label">
            Retype your smartcard number
          </label>
          <input
            id="confirm"
            className="field-input"
            inputMode="numeric"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
            onPaste={(e) => e.preventDefault()}
            aria-invalid={touched.confirm && !confirmOk}
          />
          {touched.confirm && !confirmOk ? (
            <p className="field-error">
              {confirm
                ? "This does not match the number you entered first"
                : "Retype your smartcard number"}
            </p>
          ) : (
            <p className="field-hint">
              So we renew the right account. We cannot undo a renewal on the wrong card.
            </p>
          )}
        </div>

        {error && <Alert>{error}</Alert>}
      </form>
    </PhoneShell>
  );
}
