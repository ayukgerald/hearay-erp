"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert, Logo, Spinner } from "@/components/phone-shell";

export function SetPassword({ url, anonKey }: { url: string; anonKey: string }) {
  const supabase: SupabaseClient | null = useMemo(
    () =>
      url && anonKey
        ? createClient(url, anonKey, {
            auth: { flowType: "implicit", detectSessionInUrl: true, persistSession: false },
          })
        : null,
    [url, anonKey],
  );
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return setError("Sign-in is not configured.");
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      else
        setError("This invite link is invalid or has expired. Ask the owner to invite you again.");
    });
  }, [supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (password.length < 10) return setError("Use at least 10 characters.");
    setState("busy");
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setState("idle");
      return;
    }
    await supabase.auth.signOut();
    setState("done");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-5 p-6">
        <Logo />
        <h1 className="text-2xl font-extrabold tracking-tight">Choose your password</h1>
        {state === "done" ? (
          <>
            <Alert kind="info">Password saved. You can now sign in.</Alert>
            <Link href="/admin/login" className="btn-primary">
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <div>
              <label className="field-label" htmlFor="pw">
                New password
              </label>
              <input
                id="pw"
                type="password"
                autoComplete="new-password"
                className="field-input !text-base"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!ready}
              />
              <p className="field-hint">At least 10 characters.</p>
            </div>
            {error && <Alert>{error}</Alert>}
            <button className="btn-primary" disabled={!ready || state === "busy"}>
              {state === "busy" && <Spinner />} Save password
            </button>
          </>
        )}
      </form>
    </div>
  );
}
