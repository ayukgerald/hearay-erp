"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Spinner } from "@/components/phone-shell";
import { api, ApiClientError } from "@/lib/client";
import { formatXaf } from "@/lib/money";

type Pkg = {
  id: string;
  code: string;
  name: string;
  monthlyPriceXaf: number;
  isActive: boolean;
  sortOrder: number;
  badge: string | null;
};

export function PackagesEditor() {
  const [pkgs, setPkgs] = useState<Pkg[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<{ packages: Pkg[] }>("/api/admin/packages")
        .then((r) => setPkgs(r.packages))
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: string, data: Partial<Pkg>, okMsg: string) {
    setError(null);
    try {
      await api("/api/admin/packages", { method: "PATCH", json: { id, ...data } });
      setMsg(okMsg);
      await load();
      return true;
    } catch (e) {
      setError((e as ApiClientError).message);
      return false;
    }
  }

  async function move(index: number, dir: -1 | 1) {
    if (!pkgs) return;
    const other = pkgs[index + dir];
    const me = pkgs[index];
    if (!other) return;
    // Re-number everything so ties never block reordering.
    const order = [...pkgs];
    order[index] = other;
    order[index + dir] = me;
    for (let i = 0; i < order.length; i++) {
      if (order[i].sortOrder !== (i + 1) * 10) {
        await api("/api/admin/packages", {
          method: "PATCH",
          json: { id: order[i].id, sortOrder: (i + 1) * 10 },
        }).catch(() => undefined);
      }
    }
    setMsg("Order updated");
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">Packages & prices</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Prices are whole FCFA per month. Changing a price never changes orders already placed.
        Customers only see packages that are shown.
      </p>
      <div className="mt-4 space-y-2">
        {error && <Alert>{error}</Alert>}
        {msg && !error && <Alert kind="info">{msg}</Alert>}
      </div>

      {!pkgs && !error && (
        <div className="flex justify-center py-16 text-accent">
          <Spinner className="size-7" />
        </div>
      )}
      <div className="mt-4 space-y-3">
        {pkgs?.map((p, i) => (
          <PackageRow
            key={p.id + p.monthlyPriceXaf + p.badge + p.name}
            p={p}
            first={i === 0}
            last={i === pkgs.length - 1}
            onMove={(d) => move(i, d)}
            onPatch={patch}
          />
        ))}
      </div>
      <AddPackage
        onAdded={() => {
          setMsg("Package added");
          load();
        }}
        nextSort={((pkgs?.length ?? 0) + 1) * 10}
      />
    </div>
  );
}

function PackageRow({
  p,
  first,
  last,
  onMove,
  onPatch,
}: {
  p: Pkg;
  first: boolean;
  last: boolean;
  onMove: (d: -1 | 1) => void;
  onPatch: (id: string, d: Partial<Pkg>, m: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(p.name);
  const [price, setPrice] = useState(String(p.monthlyPriceXaf));
  const [badge, setBadge] = useState(p.badge ?? "");
  const dirty = name !== p.name || price !== String(p.monthlyPriceXaf) || badge !== (p.badge ?? "");
  const priceNum = Number(price);
  const priceOk = /^\d+$/.test(price);

  return (
    <div
      className={`card grid gap-3 p-4 md:grid-cols-[auto_1fr_160px_150px_auto_auto] md:items-end ${p.isActive ? "" : "opacity-80"}`}
      data-testid={`pkg-${p.code}`}
    >
      <div className="flex gap-1 md:flex-col">
        <button
          className="btn-secondary !min-h-[36px] !w-10 !px-0"
          disabled={first}
          onClick={() => onMove(-1)}
          aria-label={`Move ${p.name} up`}
        >
          ↑
        </button>
        <button
          className="btn-secondary !min-h-[36px] !w-10 !px-0"
          disabled={last}
          onClick={() => onMove(1)}
          aria-label={`Move ${p.name} down`}
        >
          ↓
        </button>
      </div>
      <label className="block">
        <span className="field-label">
          Name <span className="font-normal text-ink-faint">· {p.code}</span>
        </span>
        <input
          className="field-input !min-h-touch !text-base"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="field-label">FCFA / month</span>
        <input
          className="field-input !min-h-touch !text-base"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
          aria-label={`${p.name} monthly price`}
        />
      </label>
      <label className="block">
        <span className="field-label">Badge</span>
        <input
          className="field-input !min-h-touch !text-base"
          value={badge}
          placeholder="e.g. Most chosen"
          onChange={(e) => setBadge(e.target.value)}
        />
      </label>
      <button
        className="btn-primary !min-h-touch !rounded-xl !text-sm md:!w-auto"
        disabled={!dirty || !priceOk || !name.trim()}
        onClick={() =>
          onPatch(
            p.id,
            { name: name.trim(), monthlyPriceXaf: priceNum, badge: badge.trim() || null },
            `${name} saved — ${formatXaf(priceNum)} per month`,
          )
        }
      >
        Save
      </button>
      <button
        className={`btn-secondary !min-h-touch !text-sm md:!w-28 ${p.isActive ? "" : "!border-accent !text-accent"}`}
        onClick={() =>
          onPatch(
            p.id,
            { isActive: !p.isActive },
            p.isActive ? `${p.name} hidden from customers` : `${p.name} is now shown to customers`,
          )
        }
        aria-pressed={p.isActive}
      >
        {p.isActive ? "Hide" : "Show"}
      </button>
      <div className="text-xs font-semibold md:col-span-6">
        {p.isActive ? (
          <span className="text-success">● Shown to customers</span>
        ) : (
          <span className="text-ink-faint">
            ○ Hidden{p.monthlyPriceXaf === 0 ? " · set a price to show it" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function AddPackage({ onAdded, nextSort }: { onAdded: () => void; nextSort: number }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!open)
    return (
      <button className="btn-secondary mt-4 md:!w-auto" onClick={() => setOpen(true)}>
        + Add package
      </button>
    );
  return (
    <form
      className="card mt-4 grid gap-3 p-4 md:grid-cols-4 md:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await api("/api/admin/packages", {
            method: "POST",
            json: {
              code,
              name,
              monthlyPriceXaf: Number(price || 0),
              sortOrder: nextSort,
              isActive: false,
            },
          });
          setOpen(false);
          setCode("");
          setName("");
          setPrice("");
          onAdded();
        } catch (err) {
          setError((err as ApiClientError).message);
        }
      }}
    >
      <label>
        <span className="field-label">Code</span>
        <input
          className="field-input !min-h-touch !text-base"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. confort"
          required
        />
      </label>
      <label>
        <span className="field-label">Name</span>
        <input
          className="field-input !min-h-touch !text-base"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      <label>
        <span className="field-label">FCFA / month</span>
        <input
          className="field-input !min-h-touch !text-base"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      <button className="btn-primary !min-h-touch !rounded-xl !text-sm">Add (hidden)</button>
      {error && (
        <div className="md:col-span-4">
          <Alert>{error}</Alert>
        </div>
      )}
    </form>
  );
}
