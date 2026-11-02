"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Spinner } from "@/components/phone-shell";
import { api, ApiClientError } from "@/lib/client";

type User = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "staff";
  isActive: boolean;
  createdAt: string;
};

export function StaffManager({ meId }: { meId: string }) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [mode, setMode] = useState<"dev" | "supabase">("supabase");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "staff" as "owner" | "staff" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api<{ users: User[]; authMode: "dev" | "supabase" }>("/api/admin/users")
        .then((r) => {
          setUsers(r.users);
          setMode(r.authMode);
        })
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/users", { method: "POST", json: form });
      setMsg(
        mode === "dev"
          ? `${form.name} added. In dev mode they sign in with DEV_ADMIN_PASSWORD.`
          : `Invite sent to ${form.email}.`,
      );
      setForm({ name: "", email: "", role: "staff" });
      load();
    } catch (err) {
      setError((err as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(u: User) {
    setError(null);
    try {
      await api("/api/admin/users", { method: "PATCH", json: { id: u.id, isActive: !u.isActive } });
      setMsg(u.isActive ? `${u.name} can no longer sign in.` : `${u.name} can sign in again.`);
      load();
    } catch (err) {
      setError((err as ApiClientError).message);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Staff</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Staff renew orders. Owners also manage prices and staff.
        </p>
        <div className="mt-4 space-y-2">
          {error && <Alert>{error}</Alert>}
          {msg && !error && <Alert kind="info">{msg}</Alert>}
        </div>
        {!users && !error && (
          <div className="flex justify-center py-16 text-accent">
            <Spinner className="size-7" />
          </div>
        )}
        <div className="mt-4 space-y-2">
          {users?.map((u) => (
            <div
              key={u.id}
              className={`card flex flex-wrap items-center gap-3 p-4 ${u.isActive ? "" : "opacity-60"}`}
            >
              <div className="inline-flex size-10 items-center justify-center rounded-full bg-accent-soft font-extrabold text-accent">
                {u.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold">
                  {u.name}{" "}
                  {u.id === meId && (
                    <span className="text-xs font-semibold text-ink-faint">(you)</span>
                  )}
                </div>
                <div className="truncate text-sm text-ink-muted">{u.email}</div>
              </div>
              <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-bold capitalize">
                {u.role}
              </span>
              {u.id !== meId && (
                <button
                  className="btn-secondary !min-h-touch !w-auto !text-sm"
                  onClick={() => toggle(u)}
                >
                  {u.isActive ? "Deactivate" : "Reactivate"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <form onSubmit={invite} className="card h-fit space-y-4 p-5">
        <h2 className="text-lg font-extrabold">Invite someone</h2>
        <label className="block">
          <span className="field-label">Name</span>
          <input
            className="field-input !min-h-touch !text-base"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </label>
        <label className="block">
          <span className="field-label">Email</span>
          <input
            type="email"
            className="field-input !min-h-touch !text-base"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </label>
        <label className="block">
          <span className="field-label">Role</span>
          <select
            className="field-input !min-h-touch !text-base"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as "owner" | "staff" })}
          >
            <option value="staff">Staff — renews orders</option>
            <option value="owner">Owner — also prices and staff</option>
          </select>
        </label>
        <button className="btn-primary" disabled={busy}>
          {busy && <Spinner />} Send invite
        </button>
      </form>
    </div>
  );
}
