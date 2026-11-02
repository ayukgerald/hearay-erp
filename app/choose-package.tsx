"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, PhoneShell, Spinner } from "@/components/phone-shell";
import { loadPackages, qs, type PackagesResponse } from "@/lib/client";
import { formatXaf } from "@/lib/money";
import { validateSmartcard } from "@/lib/smartcard";

/** Screen 1 — enter smartcard number and choose a package. */
export function ChoosePackage() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<PackagesResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [card, setCard] = useState(params.get("card") ?? "");
  const [touched, setTouched] = useState(false);
  const [selected, setSelected] = useState(params.get("package") ?? "");

  useEffect(() => {
    loadPackages({ fresh: true })
      .then(setData)
      .catch(() => setLoadError(true));
  }, []);

  const lengths = data?.smartcardLengths ?? [10];
  const check = validateSmartcard(card, lengths);
  const pkg = data?.packages.find((p) => p.code === selected);
  const canContinue = check.ok && !!pkg;

  function go() {
    setTouched(true);
    if (!check.ok || !pkg) return;
    const months = params.get("months");
    router.push(`/months?${qs({ card: check.value, package: pkg.code, months })}`);
  }

  return (
    <PhoneShell
      step={{ n: 1, of: 3 }}
      footer={
        <button className="btn-primary" disabled={!canContinue} onClick={go} data-testid="continue">
          Continue
        </button>
      }
    >
      <h1 className="mt-4 text-[28px] font-extrabold leading-tight tracking-tight">
        Renew your DStv
      </h1>
      <p className="mt-1 text-ink-muted">
        Pay with MTN MoMo or Orange Money. We renew your account and send you an SMS.
      </p>

      <div className="mt-6">
        <label htmlFor="card" className="field-label">
          Smartcard number
        </label>
        <input
          id="card"
          className="field-input"
          inputMode="numeric"
          autoComplete="off"
          placeholder={"0".repeat(lengths[0]).replace(/0/g, "•")}
          value={card}
          maxLength={lengths[lengths.length - 1] + 4}
          onChange={(e) => setCard(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={touched && !check.ok}
          aria-describedby="card-help"
        />
        {touched && !check.ok ? (
          <p id="card-help" className="field-error">
            {check.reason}
          </p>
        ) : (
          <p id="card-help" className="field-hint">
            The {lengths.join(" or ")}-digit number on your decoder screen or smartcard.
          </p>
        )}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wider text-ink-muted">
        Choose a package
      </h2>
      {loadError && (
        <Alert>Could not load packages. Check your connection and refresh the page.</Alert>
      )}
      {!data && !loadError && (
        <div className="flex justify-center py-10 text-accent">
          <Spinner className="size-7" />
        </div>
      )}
      {data && data.packages.length === 0 && (
        <Alert kind="info">Packages are not available yet. Please check back soon.</Alert>
      )}
      <div role="radiogroup" aria-label="Package" className="grid grid-cols-2 gap-3">
        {data?.packages.map((p) => {
          const active = p.code === selected;
          return (
            <button
              key={p.id}
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(p.code)}
              data-testid={`package-${p.code}`}
              className={`relative flex min-h-[112px] flex-col items-start justify-between rounded-2xl border-2 bg-white p-4 text-left transition ${
                active
                  ? "border-accent shadow-[0_8px_24px_-12px_rgba(31,79,216,.6)]"
                  : "border-transparent shadow-[0_0_0_1px_#E3E6EB]"
              }`}
            >
              {p.badge && (
                <span className="absolute -top-2.5 left-3 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-white">
                  {p.badge}
                </span>
              )}
              <span className="text-base font-bold">{p.name}</span>
              <span>
                <span className="block text-lg font-extrabold tracking-tight">
                  {formatXaf(p.monthlyPriceXaf)}
                </span>
                <span className="text-xs font-medium text-ink-muted">per month</span>
              </span>
              <span
                className={`absolute right-3 top-3 inline-flex size-5 items-center justify-center rounded-full border-2 ${
                  active ? "border-accent bg-accent" : "border-line"
                }`}
                aria-hidden
              >
                {active && <span className="size-2 rounded-full bg-white" />}
              </span>
            </button>
          );
        })}
      </div>
    </PhoneShell>
  );
}
