import Link from "next/link";

/**
 * Mobile-first frame: centred 420 px column on desktop, optional back link,
 * step indicator, and one primary action pinned to the bottom.
 */
export function PhoneShell({
  children,
  back,
  step,
  footer,
  title,
}: {
  children: React.ReactNode;
  back?: string;
  step?: { n: number; of: number };
  footer?: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-phone flex-col bg-canvas md:my-6 md:min-h-[calc(100dvh-3rem)] md:rounded-[28px] md:shadow-[0_0_0_1px_#E3E6EB,0_20px_60px_-30px_rgba(16,20,24,.35)]">
      <header className="flex items-center gap-2 px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
        {back ? (
          <Link
            href={back}
            aria-label="Back"
            className="-ml-2 inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-black/5"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M15 5l-7 7 7 7"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        ) : (
          <Logo />
        )}
        {title && <span className="text-base font-bold">{title}</span>}
        {step && (
          <div
            className="ml-auto flex items-center gap-1.5"
            aria-label={`Step ${step.n} of ${step.of}`}
          >
            {Array.from({ length: step.of }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i < step.n ? "w-6 bg-accent" : "w-3 bg-line"}`}
              />
            ))}
          </div>
        )}
      </header>
      <main className={`flex-1 px-4 ${footer ? "pb-32" : "pb-8"}`}>{children}</main>
      {footer && (
        <div className="fixed inset-x-0 bottom-0 z-10 md:sticky">
          <div className="mx-auto w-full max-w-phone border-t border-line/70 bg-canvas/95 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:rounded-b-[28px]">
            {footer}
          </div>
        </div>
      )}
    </div>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-lg font-extrabold tracking-tight text-ink ${className}`}
    >
      <span className="inline-flex size-8 items-center justify-center rounded-[10px] bg-accent text-white">
        <svg width="16" height="16" viewBox="0 0 512 512" aria-hidden>
          <path
            d="M164 136v240M348 136v240M164 256h184"
            stroke="#fff"
            strokeWidth="64"
            strokeLinecap="round"
          />
        </svg>
      </span>
      Hearay
    </span>
  );
}

export function Spinner({ className = "size-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Alert({
  kind = "danger",
  children,
}: {
  kind?: "danger" | "warn" | "info";
  children: React.ReactNode;
}) {
  const styles = {
    danger: "bg-danger-soft text-danger",
    warn: "bg-warn-soft text-warn",
    info: "bg-accent-soft text-accent-dark",
  }[kind];
  return (
    <div
      role={kind === "danger" ? "alert" : "status"}
      className={`rounded-xl px-4 py-3 text-sm font-semibold ${styles}`}
    >
      {children}
    </div>
  );
}

export function MethodDot({ method }: { method: "mtn_momo" | "orange_money" }) {
  return method === "mtn_momo" ? (
    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-mtn text-[11px] font-extrabold text-ink">
      MTN
    </span>
  ) : (
    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange text-[10px] font-extrabold text-white">
      OM
    </span>
  );
}
