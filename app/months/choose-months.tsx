"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, PhoneShell, Spinner } from "@/components/phone-shell";
import { loadPackages, qs, type PackagesResponse } from "@/lib/client";
import { formatXaf } from "@/lib/money";

const MONTHS = [1, 3, 6, 12] as const;

/** Screen 2 — choose 1, 3, 6 or 12 months; shows price × months + fee = total. */
export function ChooseMonths() {
  const router = useRouter();
  const params = useSearchParams();
  const card = params.get("card") ?? "";
  const code = params.get("package") ?? "";
  const initial = Number(params.get("months"));
  const [months, setMonths] = useState<number>(MONTHS.includes(initial as 1) ? initial : 1);
  const [data, setData] = useState<PackagesResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadPackages()
      .then(setData)
      .catch(() => setError(true));
  }, []);

  const pkg = data?.packages.find((p) => p.code === code);
  const back = `/?${qs({ card, package: code, months })}`;

  useEffect(() => {
    if (!card || (data && !pkg)) router.replace(back);
  }, [card, data, pkg, router, back]);

  // Keep the choice in the URL so refresh/back loses nothing.
  function choose(m: number) {
    setMonths(m);
    router.replace(`/months?${qs({ card, package: code, months: m })}`, { scroll: false });
  }

  const fee = data?.serviceFeeXaf ?? 0;
  const total = pkg ? pkg.monthlyPriceXaf * months + fee : 0;

  return (
    <PhoneShell
      back={back}
      step={{ n: 2, of: 3 }}
      footer={
        <button
          className="btn-primary"
          disabled={!pkg}
          data-testid="continue"
          onClick={() => router.push(`/pay?${qs({ card, package: code, months })}`)}
        >
          Continue · {formatXaf(total)}
        </button>
      }
    >
      <h1 className="mt-2 text-[26px] font-extrabold leading-tight tracking-tight">
        How many months?
      </h1>
      {error && <Alert>Could not load prices. Check your connection and refresh.</Alert>}
      {!pkg && !error && (
        <div className="flex justify-center py-10 text-accent">
          <Spinner className="size-7" />
        </div>
      )}
      {pkg && (
        <>
          <p className="mt-1 text-ink-muted">
            DStv <b className="text-ink">{pkg.name}</b> · card {card}
          </p>
          <div role="radiogroup" aria-label="Months" className="mt-6 grid grid-cols-2 gap-3">
            {MONTHS.map((m) => {
              const active = m === months;
              return (
                <button
                  key={m}
                  role="radio"
                  aria-checked={active}
                  onClick={() => choose(m)}
                  data-testid={`months-${m}`}
                  className={`flex min-h-[88px] flex-col items-start justify-center rounded-2xl border-2 bg-white px-4 text-left transition ${
                    active
                      ? "border-accent shadow-[0_8px_24px_-12px_rgba(31,79,216,.6)]"
                      : "border-transparent shadow-[0_0_0_1px_#E3E6EB]"
                  }`}
                >
                  <span className="text-2xl font-extrabold tracking-tight">{m}</span>
                  <span className="text-sm font-semibold text-ink-muted">
                    {m === 1 ? "month" : "months"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="card mt-6 p-4" data-testid="breakdown">
            <Row
              label={`${formatXaf(pkg.monthlyPriceXaf)} × ${months} ${months === 1 ? "month" : "months"}`}
              value={formatXaf(pkg.monthlyPriceXaf * months)}
            />
            <Row label="Service fee" value={fee ? formatXaf(fee) : "Free"} />
            <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3">
              <span className="font-bold">Total</span>
              <span className="text-2xl font-extrabold tracking-tight" data-testid="total">
                {formatXaf(total)}
              </span>
            </div>
          </div>
        </>
      )}
    </PhoneShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 text-[15px]">
      <span className="text-ink-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
