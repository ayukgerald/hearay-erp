"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Logo, Spinner } from "@/components/phone-shell";
import { api, ApiClientError } from "@/lib/client";

export function LoginForm({ devMode }: { devMode: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/session", { method: "POST", json: { email, password } });
      router.replace("/admin/orders");
      router.refresh();
    } catch (err) {
      setError((err as ApiClientError).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-5 p-6 shadow-sm">
        <div>
          <Logo />
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight">Staff sign in</h1>
          <p className="text-sm text-ink-muted">Orders to fulfil, prices and staff.</p>
        </div>
        <div>
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            className="field-input !text-base"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="field-input !text-base"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <Alert>{error}</Alert>}
        <button className="btn-primary" disabled={busy}>
          {busy && <Spinner />} Sign in
        </button>
        {devMode && (
          <p className="text-center text-xs text-warn">Development sign-in (AUTH_MODE=dev)</p>
        )}
      </form>
    </div>
  );
}
